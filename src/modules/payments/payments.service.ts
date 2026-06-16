import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma.service';
import { LedgerService } from '../financial/ledger.service';
import { CurrencyCode } from '../../common/enums';

/**
 * PaymentsService — Module H (Payments API Integration).
 *
 * Owns ALL interaction with the standalone Payments Platform (SRS §11).
 * Phase 1: createBill() (PAY-API-001) and handleCallback() (PAY-API-003/005/006/008).
 *
 * Idempotency (PAY-API-005) is enforced two ways:
 *   - pay.callback has a UNIQUE index on platform_txn_id;
 *   - fin.ledger_entry has a UNIQUE index on platform_txn_id.
 * A duplicate callback is detected and NOT double-posted.
 *
 * NOTE: the actual outbound HTTP call to the Payments Platform is left as a
 * clearly-marked TODO until the platform team confirms the contract (SRS §18).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  /** PAY-API-008: verify the HMAC signature on an inbound callback. */
  verifySignature(rawBody: string, signature: string): boolean {
    const secret = process.env.PAYMENTS_CALLBACK_HMAC_SECRET ?? '';
    if (!secret || !signature) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** PAY-API-001: create a bill on the Payments Platform for an invoice. */
  async createBill(invoiceId: string, actorId: string) {
    return this.prisma.withActor(actorId, 'finance', async (tx) => {
      const inv = await tx.$queryRawUnsafe<any[]>(
        `SELECT invoice_id, reference, amount, currency, due_date
           FROM fin.invoice WHERE invoice_id = $1::uuid`,
        invoiceId,
      );
      if (!inv.length) throw new Error('INVOICE_NOT_FOUND');
      const i = inv[0];

      // TODO(EOS): POST to PAYMENTS_API_BASE_URL/bills per SRS §15.1, capture
      // platform_bill_id / short_code / qr_payload from the response.
      const platformBillId: string | null = null;

      await tx.$executeRawUnsafe(
        `INSERT INTO pay.bill (invoice_id, bill_ref, platform_bill_id, amount, currency, status, callback_url)
         VALUES ($1::uuid, $2, $3, $4, $5::fin.currency_code, 'created', $6)`,
        i.invoice_id, i.reference, platformBillId, i.amount, i.currency,
        '/api/payments/callback',
      );
      return { billRef: i.reference, platformBillId };
    });
  }

  /**
   * PAY-API-003/005/006: process an inbound payment callback.
   * Returns 'matched' | 'duplicate' | 'unmatched'.
   */
  async handleCallback(payload: {
    platform_txn_id: string;
    platform_bill_id?: string;
    bill_ref?: string;
    amount_paid: number;
    currency?: string;
    channel?: string;
    signatureValid: boolean;
  }): Promise<'matched' | 'duplicate' | 'unmatched'> {
    const currency = (payload.currency ?? 'USD') as CurrencyCode;

    // Posting runs in ONE transaction so the callback record and the ledger
    // entry commit atomically. Module A (LedgerService) owns the ledger writes.
    const outcome = await this.prisma.withActor(null, 'system', async (tx) => {
      // Idempotency: record the callback first; the unique index rejects dupes.
      try {
        await tx.$executeRawUnsafe(
          `INSERT INTO pay.callback
             (platform_txn_id, platform_bill_id, bill_ref, amount_paid, currency, channel, status, signature_valid, raw_payload)
           VALUES ($1, $2, $3, $4, $5::fin.currency_code, $6::pay.pay_channel, 'received', $7, $8::jsonb)`,
          payload.platform_txn_id, payload.platform_bill_id ?? null, payload.bill_ref ?? null,
          payload.amount_paid, currency, payload.channel ?? null, payload.signatureValid,
          JSON.stringify(payload),
        );
      } catch (e: any) {
        if (String(e?.meta?.message ?? e?.message).includes('uq_callback_txn')) {
          return { status: 'duplicate' as const, accountId: null };
        }
        throw e;
      }

      // Match to an invoice by bill_ref (== invoice.reference).
      const inv = await tx.$queryRawUnsafe<any[]>(
        `SELECT i.invoice_id, i.account_id
           FROM fin.invoice i WHERE i.reference = $1`,
        payload.bill_ref ?? '',
      );

      if (!inv.length) {
        // Unmatched: park in suspense (FIN-LED-003) for manual allocation.
        await this.ledger.parkSuspenseTx(tx, {
          platformTxnId: payload.platform_txn_id,
          amount: payload.amount_paid,
          currency,
          channel: payload.channel ?? null,
          rawPayload: payload,
        });
        await tx.$executeRawUnsafe(
          `UPDATE pay.callback SET status = 'unmatched', processed_at = now() WHERE platform_txn_id = $1`,
          payload.platform_txn_id,
        );
        return { status: 'unmatched' as const, accountId: null };
      }

      const i = inv[0];
      // Post the credit via Module A (idempotency backstop: unique platform_txn_id).
      const post = await this.ledger.postPaymentTx(tx, {
        accountId: i.account_id,
        invoiceId: i.invoice_id,
        amount: payload.amount_paid,
        currency,
        paymentMethod: this.mapChannel(payload.channel),
        platformTxnId: payload.platform_txn_id,
        narrative: `Payment via ${payload.channel ?? 'unknown'}`,
      });

      // The ledger backstop caught a duplicate even though the callback insert
      // didn't — record it as a duplicate, post nothing more.
      if (post.duplicate) {
        await tx.$executeRawUnsafe(
          `UPDATE pay.callback SET status = 'duplicate', processed_at = now() WHERE platform_txn_id = $1`,
          payload.platform_txn_id,
        );
        return { status: 'duplicate' as const, accountId: null };
      }

      await tx.$executeRawUnsafe(
        `UPDATE pay.callback SET status = 'matched', ledger_id = $2::bigint, processed_at = now()
          WHERE platform_txn_id = $1`,
        payload.platform_txn_id,
        post.ledgerId,
      );
      return { status: 'matched' as const, accountId: i.account_id as string };
    });

    // FIN-LED-002: recalculate arrears in real time once the posting commits.
    if (outcome.status === 'matched' && outcome.accountId) {
      await this.ledger.recomputeAccount(outcome.accountId, {
        actorId: '',
        actorRole: 'system',
      });
    }

    return outcome.status;
  }

  private mapChannel(ch?: string): string {
    const allowed = ['wallet', 'cash', 'bank_transfer', 'remittance', 'agent', 'merchant'];
    if (ch === 'app' || ch === 'ussd' || ch === 'qr') return 'wallet';
    return allowed.includes(ch ?? '') ? (ch as string) : 'wallet';
  }
}
