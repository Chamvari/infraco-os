import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CURRENCY_CODES, CurrencyCode } from '../../common/enums';
import { arrearsBucket, ArrearsRisk } from './instalment.util';
import { AccountingService } from './accounting.service';
import { COA } from './coa-map';

/**
 * Minimal transaction-client shape: lets ledger postings run INSIDE a caller's
 * transaction (e.g. Module H's callback handler) so the callback record and the
 * ledger posting commit atomically.
 */
export interface TxClient {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

interface Actor {
  actorId: string;
  actorRole: string;
}

export interface PostPaymentParams {
  accountId: string;
  invoiceId: string;
  amount: number;
  currency: CurrencyCode;
  paymentMethod: string; // fin.payment_method
  platformTxnId: string | null;
  narrative?: string;
  postedBy?: string | null;
}

export interface PostPaymentResult {
  ledgerId: string | null;
  duplicate: boolean;
  invoiceStatus: 'partially_paid' | 'paid' | null;
}

export interface AccountPosition {
  balance: number; // outstanding across raised invoices (FIN-INST-004)
  totalPaid: number;
  arrearsOutstanding: number; // unpaid amount past due
  daysOverdue: number;
  riskCategory: ArrearsRisk;
  nextDue: string | null; // ISO date of next unpaid instalment
  lastPaymentDate: string | null;
}

/**
 * LedgerService — Module A, unified ledger & reconciliation (SRS §4.5).
 *
 *   FIN-LED-001  every transaction posts to one ledger keyed by account, invoice,
 *                and transaction reference (platform_txn_id)
 *   FIN-LED-002  payment callbacks auto-post + update invoice status (Module H wires here)
 *   FIN-LED-003  unmatched payments parked in suspense for manual allocation
 *   FIN-LED-004  reconciliation report flags discrepancies
 *   FIN-LED-005  manual adjustments need dual authorisation + full audit entry
 *
 * Idempotency backstop: fin.ledger_entry has a UNIQUE index on platform_txn_id.
 * postPaymentTx() catches that violation and reports `duplicate` rather than
 * double-posting — even if a caller's own dedupe is bypassed.
 */
@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  /**
   * Post a payment credit to the ledger and update the invoice, INSIDE the
   * caller's transaction. Returns duplicate=true (and posts nothing) if the
   * platform_txn_id has already been recorded (PAY-API-005 backstop).
   */
  async postPaymentTx(
    tx: TxClient,
    p: PostPaymentParams,
  ): Promise<PostPaymentResult> {
    const inv = await tx.$queryRawUnsafe<
      { amount: string; amount_paid: string }[]
    >(
      `SELECT amount, amount_paid FROM fin.invoice WHERE invoice_id = $1::uuid FOR UPDATE`,
      p.invoiceId,
    );
    if (inv.length === 0) {
      throw new NotFoundException(`Invoice ${p.invoiceId} not found.`);
    }

    let ledgerId: string;
    try {
      const rows = await tx.$queryRawUnsafe<{ ledger_id: string }[]>(
        `INSERT INTO fin.ledger_entry
           (account_id, invoice_id, txn_type, amount, currency, payment_method, platform_txn_id, narrative, posted_by)
         VALUES ($1::uuid, $2::uuid, 'credit', $3, $4::fin.currency_code, $5::fin.payment_method, $6, $7, $8::uuid)
         RETURNING ledger_id::text AS ledger_id`,
        p.accountId,
        p.invoiceId,
        p.amount,
        p.currency,
        p.paymentMethod,
        p.platformTxnId,
        p.narrative ?? null,
        p.postedBy ?? null,
      );
      ledgerId = rows[0].ledger_id;
    } catch (err: unknown) {
      // Idempotency backstop: uq_ledger_platform_txn already has this txn.
      if (this.isUnique(err, 'uq_ledger_platform_txn')) {
        return { ledgerId: null, duplicate: true, invoiceStatus: null };
      }
      throw err;
    }

    const newPaid = Number(inv[0].amount_paid) + Number(p.amount);
    const invoiceStatus: 'partially_paid' | 'paid' =
      newPaid >= Number(inv[0].amount) ? 'paid' : 'partially_paid';
    await tx.$executeRawUnsafe(
      `UPDATE fin.invoice SET amount_paid = $1, status = $2::fin.invoice_status
        WHERE invoice_id = $3::uuid`,
      newPaid,
      invoiceStatus,
      p.invoiceId,
    );

    // FIN-ACC-002 — auto-post the double-entry journal in the same transaction:
    // cash received, receivable cleared. Both sit in the 'group' asset class.
    await this.accounting.postJournalTx(tx, {
      narrative: `Payment ${ledgerId} on invoice ${p.invoiceId}`,
      sourceTable: 'ledger_entry',
      sourceId: ledgerId,
      postedBy: p.postedBy ?? null,
      lines: [
        { coaCode: COA.CASH, debit: p.amount },
        { coaCode: COA.RECEIVABLES, credit: p.amount },
      ],
    });

    return { ledgerId, duplicate: false, invoiceStatus };
  }

  /**
   * FIN-LED-003 — park an unmatched payment in suspense for manual allocation,
   * INSIDE the caller's transaction. Idempotent on platform_txn_id.
   */
  async parkSuspenseTx(
    tx: TxClient,
    p: {
      platformTxnId: string;
      amount: number;
      currency: CurrencyCode;
      channel: string | null;
      rawPayload: unknown;
    },
  ): Promise<void> {
    await tx.$executeRawUnsafe(
      `INSERT INTO fin.suspense_item (platform_txn_id, amount, currency, channel, raw_payload)
       VALUES ($1, $2, $3::fin.currency_code, $4::pay.pay_channel, $5::jsonb)
       ON CONFLICT (platform_txn_id) DO NOTHING`,
      p.platformTxnId,
      p.amount,
      p.currency,
      p.channel,
      JSON.stringify(p.rawPayload),
    );
  }

  /**
   * FIN-LED-003 — Finance manually allocates a suspense item to an account/invoice.
   * Posts to the ledger (reusing the platform_txn_id, so the idempotency backstop
   * still holds), marks the suspense resolved, and recomputes arrears.
   */
  async resolveSuspense(
    p: { suspenseId: string; accountId: string; invoiceId: string; narrative?: string },
    actor: Actor,
  ): Promise<{ ledgerId: string | null; duplicate: boolean }> {
    const result = await this.prisma.withActor(
      actor.actorId,
      actor.actorRole,
      async (tx) => {
        const s = await tx.$queryRawUnsafe<
          {
            platform_txn_id: string;
            amount: string;
            currency: CurrencyCode;
            resolved: boolean;
          }[]
        >(
          `SELECT platform_txn_id, amount, currency, resolved
             FROM fin.suspense_item WHERE suspense_id = $1::uuid FOR UPDATE`,
          p.suspenseId,
        );
        if (s.length === 0) {
          throw new NotFoundException(`Suspense item ${p.suspenseId} not found.`);
        }
        if (s[0].resolved) {
          throw new BadRequestException('Suspense item is already resolved.');
        }

        const post = await this.postPaymentTx(tx as TxClient, {
          accountId: p.accountId,
          invoiceId: p.invoiceId,
          amount: Number(s[0].amount),
          currency: s[0].currency,
          paymentMethod: 'adjustment',
          platformTxnId: s[0].platform_txn_id,
          narrative:
            p.narrative ?? `Suspense ${p.suspenseId} allocated by ${actor.actorId}`,
          postedBy: actor.actorId || null,
        });

        await tx.$executeRawUnsafe(
          `UPDATE fin.suspense_item
              SET resolved = true, resolved_to_account = $1::uuid, resolved_by = $2::uuid
            WHERE suspense_id = $3::uuid`,
          p.accountId,
          actor.actorId || null,
          p.suspenseId,
        );

        return post;
      },
    );

    // Real-time arrears recalculation after allocation (FIN-LED-002/004).
    await this.recomputeAccount(p.accountId, actor);
    return { ledgerId: result.ledgerId, duplicate: result.duplicate };
  }

  /**
   * FIN-LED-005 — post a manual ledger adjustment (credit note / write-off).
   * Requires DUAL AUTHORISATION: a second authoriser distinct from the actor;
   * write-offs additionally require a Finance Manager authoriser (FIN-ARR-004).
   * The write is audited (core.capture_audit via withActor); the authoriser is
   * recorded on the entry.
   */
  async postManualAdjustment(
    p: {
      accountId: string;
      invoiceId?: string | null;
      txnType: 'debit' | 'credit';
      amount: number;
      kind: 'credit_note' | 'write_off' | 'correction';
      currency?: CurrencyCode;
      narrative: string;
      authoriserId: string;
      authoriserRole: string;
    },
    actor: Actor,
  ): Promise<{ ledgerId: string }> {
    if (p.txnType !== 'debit' && p.txnType !== 'credit') {
      throw new BadRequestException('txnType must be debit or credit.');
    }
    if (!(p.amount > 0)) {
      throw new BadRequestException('Adjustment amount must be greater than 0.');
    }
    const currency: CurrencyCode = p.currency ?? 'USD';
    if (!CURRENCY_CODES.includes(currency)) {
      throw new BadRequestException(`Invalid currency '${currency}'.`);
    }

    // Dual authorisation (FIN-LED-005).
    if (!p.authoriserId || p.authoriserId.trim() === '') {
      throw new ForbiddenException(
        'A second authoriser is required for manual ledger adjustments.',
      );
    }
    if (p.authoriserId === actor.actorId) {
      throw new ForbiddenException(
        'Dual authorisation requires a different second authoriser.',
      );
    }
    if (p.kind === 'write_off' && p.authoriserRole !== 'finance_mgr') {
      throw new ForbiddenException(
        'Write-offs must be authorised by a Finance Manager (FIN-ARR-004).',
      );
    }

    const narrative = `[${p.kind}] ${p.narrative} (posted_by=${actor.actorId}; authorised_by=${p.authoriserId})`;

    const ledgerId = await this.prisma.withActor(
      actor.actorId,
      actor.actorRole,
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<{ ledger_id: string }[]>(
          `INSERT INTO fin.ledger_entry
             (account_id, invoice_id, txn_type, amount, currency, payment_method, narrative, posted_by)
           VALUES ($1::uuid, $2::uuid, $3::fin.txn_type, $4, $5::fin.currency_code, 'adjustment', $6, $7::uuid)
           RETURNING ledger_id::text AS ledger_id`,
          p.accountId,
          p.invoiceId ?? null,
          p.txnType,
          p.amount,
          currency,
          narrative,
          actor.actorId || null,
        );
        const newLedgerId = rows[0].ledger_id;

        // FIN-ACC-002 — auto-post the matching journal. A credit (write-off /
        // credit note) clears a receivable against operating expense; a debit
        // (re-charge / correction) raises a receivable against interest revenue.
        const lines =
          p.txnType === 'credit'
            ? [
                { coaCode: COA.OPEX, debit: p.amount },
                { coaCode: COA.RECEIVABLES, credit: p.amount },
              ]
            : [
                { coaCode: COA.RECEIVABLES, debit: p.amount },
                { coaCode: COA.REV_INTEREST, credit: p.amount },
              ];
        await this.accounting.postJournalTx(tx as TxClient, {
          narrative: `[${p.kind}] ledger ${newLedgerId}`,
          sourceTable: 'ledger_entry',
          sourceId: newLedgerId,
          postedBy: actor.actorId || null,
          lines,
        });

        return newLedgerId;
      },
    );

    await this.recomputeAccount(p.accountId, actor);
    return { ledgerId };
  }

  /**
   * FIN-INST-004 / FIN-LED-002 — recompute and persist an account's position:
   * amount paid, balance outstanding, arrears (days + value, risk bucket), next
   * due date. Marks past-due raised invoices 'overdue' and writes an arrears
   * snapshot (FIN-ARR-001).
   */
  async recomputeAccount(
    accountId: string,
    actor: Actor,
    asOf: Date = new Date(),
  ): Promise<AccountPosition> {
    const asOfDate = asOf.toISOString().slice(0, 10);

    return this.prisma.withActor(actor.actorId, actor.actorRole, async (tx) => {
      const acct = await tx.$queryRawUnsafe<{ account_id: string }[]>(
        `SELECT account_id FROM fin.account WHERE account_id = $1::uuid`,
        accountId,
      );
      if (acct.length === 0) {
        throw new NotFoundException(`Account ${accountId} not found.`);
      }

      // Transition raised-but-unpaid past-due invoices to 'overdue'.
      await tx.$executeRawUnsafe(
        `UPDATE fin.invoice SET status = 'overdue'
          WHERE account_id = $1::uuid
            AND status IN ('issued','partially_paid')
            AND amount_paid < amount
            AND due_date < $2::date`,
        accountId,
        asOfDate,
      );

      const agg = (
        await tx.$queryRawUnsafe<
          {
            outstanding: string;
            total_paid: string;
            overdue_outstanding: string;
            days_overdue: number | null;
            next_due: string | null;
          }[]
        >(
          `SELECT
             COALESCE(SUM(CASE WHEN status IN ('issued','partially_paid','overdue')
                               THEN amount - amount_paid ELSE 0 END), 0) AS outstanding,
             COALESCE(SUM(amount_paid), 0) AS total_paid,
             COALESCE(SUM(CASE WHEN status IN ('issued','partially_paid','overdue')
                                AND amount_paid < amount AND due_date < $2::date
                               THEN amount - amount_paid ELSE 0 END), 0) AS overdue_outstanding,
             ($2::date - MIN(CASE WHEN status IN ('issued','partially_paid','overdue')
                                   AND amount_paid < amount AND due_date < $2::date
                                  THEN due_date END)) AS days_overdue,
             MIN(CASE WHEN status NOT IN ('paid','cancelled') AND amount_paid < amount
                      THEN due_date END) AS next_due
           FROM fin.invoice WHERE account_id = $1::uuid`,
          accountId,
          asOfDate,
        )
      )[0];

      const lastPay = (
        await tx.$queryRawUnsafe<{ d: string | null }[]>(
          `SELECT MAX(posted_at)::date AS d
             FROM fin.ledger_entry WHERE account_id = $1::uuid AND txn_type = 'credit'`,
          accountId,
        )
      )[0];

      const outstanding = Number(agg.outstanding);
      const totalPaid = Number(agg.total_paid);
      const arrearsOutstanding = Number(agg.overdue_outstanding);
      const daysOverdue = agg.days_overdue == null ? 0 : Number(agg.days_overdue);
      const riskCategory = arrearsBucket(daysOverdue);

      await tx.$executeRawUnsafe(
        `UPDATE fin.account SET balance = $1 WHERE account_id = $2::uuid`,
        outstanding,
        accountId,
      );

      await tx.$executeRawUnsafe(
        `INSERT INTO fin.arrears
           (account_id, total_outstanding, days_overdue, risk_category, last_payment_date)
         VALUES ($1::uuid, $2, $3, $4::fin.arrears_risk, $5::date)`,
        accountId,
        arrearsOutstanding,
        daysOverdue,
        riskCategory,
        lastPay.d,
      );

      return {
        balance: outstanding,
        totalPaid,
        arrearsOutstanding,
        daysOverdue,
        riskCategory,
        nextDue: agg.next_due,
        lastPaymentDate: lastPay.d,
      };
    });
  }

  /** FIN-LED-001 — per-account ledger view with a running balance. */
  async getAccountLedger(accountId: string): Promise<
    Array<{
      ledgerId: string;
      invoiceId: string | null;
      txnType: string;
      amount: string;
      currency: string;
      paymentMethod: string | null;
      platformTxnId: string | null;
      narrative: string | null;
      postedAt: string;
    }>
  > {
    const rows = await this.prisma.$queryRawUnsafe<
      {
        ledger_id: string;
        invoice_id: string | null;
        txn_type: string;
        amount: string;
        currency: string;
        payment_method: string | null;
        platform_txn_id: string | null;
        narrative: string | null;
        posted_at: string;
      }[]
    >(
      `SELECT ledger_id::text AS ledger_id, invoice_id::text AS invoice_id,
              txn_type, amount::text AS amount, currency, payment_method,
              platform_txn_id, narrative, posted_at::text AS posted_at
         FROM fin.ledger_entry
        WHERE account_id = $1::uuid
        ORDER BY posted_at, ledger_id`,
      accountId,
    );
    return rows.map((r) => ({
      ledgerId: r.ledger_id,
      invoiceId: r.invoice_id,
      txnType: r.txn_type,
      amount: r.amount,
      currency: r.currency,
      paymentMethod: r.payment_method,
      platformTxnId: r.platform_txn_id,
      narrative: r.narrative,
      postedAt: r.posted_at,
    }));
  }

  /**
   * FIN-LED-004 — reconciliation report. Flags accounts where invoice-linked
   * payment credits in the ledger disagree with the invoices' recorded
   * amount_paid, and lists unresolved suspense items awaiting allocation.
   */
  async reconciliationReport(): Promise<{
    discrepancies: Array<{
      accountId: string;
      ledgerPaid: string;
      invoicePaid: string;
    }>;
    unresolvedSuspense: Array<{
      suspenseId: string;
      platformTxnId: string;
      amount: string;
      currency: string;
    }>;
    suspenseTotal: number;
  }> {
    const discrepancies = await this.prisma.$queryRawUnsafe<
      { account_id: string; ledger_paid: string; invoice_paid: string }[]
    >(
      `SELECT a.account_id::text AS account_id,
              COALESCE(l.paid, 0)::text AS ledger_paid,
              COALESCE(iv.paid, 0)::text AS invoice_paid
         FROM fin.account a
         LEFT JOIN (
            SELECT account_id, SUM(amount) AS paid
              FROM fin.ledger_entry
             WHERE txn_type = 'credit' AND payment_method <> 'adjustment'
               AND invoice_id IS NOT NULL
             GROUP BY account_id
         ) l ON l.account_id = a.account_id
         LEFT JOIN (
            SELECT account_id, SUM(amount_paid) AS paid
              FROM fin.invoice GROUP BY account_id
         ) iv ON iv.account_id = a.account_id
        WHERE COALESCE(l.paid, 0) <> COALESCE(iv.paid, 0)`,
    );

    const suspense = await this.prisma.$queryRawUnsafe<
      { suspense_id: string; platform_txn_id: string; amount: string; currency: string }[]
    >(
      `SELECT suspense_id::text AS suspense_id, platform_txn_id, amount::text AS amount, currency
         FROM fin.suspense_item WHERE resolved = false ORDER BY received_at`,
    );

    return {
      discrepancies: discrepancies.map((d) => ({
        accountId: d.account_id,
        ledgerPaid: d.ledger_paid,
        invoicePaid: d.invoice_paid,
      })),
      unresolvedSuspense: suspense.map((s) => ({
        suspenseId: s.suspense_id,
        platformTxnId: s.platform_txn_id,
        amount: s.amount,
        currency: s.currency,
      })),
      suspenseTotal: suspense.reduce((a, s) => a + Number(s.amount), 0),
    };
  }

  private isUnique(err: unknown, constraint: string): boolean {
    const e = err as {
      code?: string;
      meta?: { code?: string; message?: string };
      message?: string;
    };
    const code = e?.meta?.code ?? e?.code;
    const msg = e?.meta?.message ?? e?.message ?? '';
    return code === '23505' || msg.includes(constraint);
  }
}
