import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { LedgerService, TxClient } from './ledger.service';
import { AccountingService } from './accounting.service';
import { COA, assetClassForAccountType, revenueCoaForInvoice } from './coa-map';
import { CURRENCY_CODES, CurrencyCode } from '../../common/enums';
import {
  computeInstalmentAmounts,
  InstalmentError,
  InstalmentStructure,
} from './instalment.util';

interface Actor {
  actorId: string;
  actorRole: string;
}

export interface GenerateScheduleParams extends Actor {
  accountId: string;
  totalPrice: number;
  deposit: number;
  numInstalments: number;
  frequency?: 'monthly' | 'quarterly';
  structure?: InstalmentStructure;
  /** Required when structure = 'balloon'; the final (balloon) instalment. */
  balloonAmount?: number;
  startDate: Date;
  currency?: CurrencyCode;
}

/**
 * FinancialService — Module A (Financial Core), instalment engine (SRS §4.2).
 *
 *   FIN-INST-001  generate schedules: frequency, amounts, due dates, deposit, total
 *   FIN-INST-002  equal AND balloon structures
 *   FIN-INST-003  on each due date, auto-raise the invoice → Payments Platform (Module H) + notify
 *   FIN-INST-005  multi-currency: currency recorded on every row
 *
 * Per-account balance/arrears/next-due (FIN-INST-004) is computed by
 * LedgerService.recomputeAccount(), which the engine calls after raising bills.
 * The instalment maths lives in instalment.util.ts (pure, unit-tested). Every
 * write runs inside prisma.withActor() so the audit trigger captures the actor.
 */
@Injectable()
export class FinancialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly ledger: LedgerService,
    private readonly accounting: AccountingService,
  ) {}

  /**
   * Generate an instalment schedule and persist the plan + draft invoices.
   * Supports 'equal' and 'balloon' structures (FIN-INST-001/002). Invoices are
   * created in 'draft'; raiseDueInstalments() issues them on the due date.
   */
  async generateInstalmentSchedule(params: GenerateScheduleParams): Promise<{
    invoiceIds: string[];
    amounts: number[];
    count: number;
    structure: InstalmentStructure;
    currency: CurrencyCode;
  }> {
    // Validate (and compute the maths) BEFORE opening a transaction, so invalid
    // input is rejected without ever entering withActor.
    this.computeSchedule(params);
    return this.prisma.withActor(params.actorId, params.actorRole, (tx) =>
      this.generateInstalmentScheduleTx(tx as TxClient, params),
    );
  }

  /**
   * Pure validation + instalment maths (no DB). Throws BadRequestException on
   * invalid input. Shared by the public method (early, pre-transaction) and the
   * Tx variant (defence in depth).
   */
  private computeSchedule(params: GenerateScheduleParams): {
    amounts: number[];
    monthsPerStep: number;
  } {
    const {
      totalPrice,
      deposit,
      numInstalments,
      frequency = 'monthly',
      structure = 'equal',
      balloonAmount,
      currency = 'USD',
    } = params;

    if (!CURRENCY_CODES.includes(currency)) {
      throw new BadRequestException(`Invalid currency '${currency}'.`);
    }
    if (deposit < 0 || totalPrice < 0) {
      throw new BadRequestException('totalPrice and deposit cannot be negative.');
    }
    if (deposit > totalPrice) {
      throw new BadRequestException('deposit cannot exceed totalPrice.');
    }

    const financed = Math.max(Math.round((totalPrice - deposit) * 100) / 100, 0);
    let amounts: number[];
    try {
      amounts = computeInstalmentAmounts(financed, numInstalments, structure, balloonAmount);
    } catch (e) {
      if (e instanceof InstalmentError) throw new BadRequestException(e.message);
      throw e;
    }
    return { amounts, monthsPerStep: frequency === 'quarterly' ? 3 : 1 };
  }

  /**
   * Transaction-aware variant: generates the plan + draft invoices on an
   * existing transaction so callers (e.g. SalesService converting a reservation
   * to a sale) can compose schedule generation atomically with their own writes.
   * The public generateInstalmentSchedule() wraps this in withActor().
   */
  async generateInstalmentScheduleTx(
    tx: TxClient,
    params: GenerateScheduleParams,
  ): Promise<{
    invoiceIds: string[];
    amounts: number[];
    count: number;
    structure: InstalmentStructure;
    currency: CurrencyCode;
  }> {
    const {
      accountId,
      totalPrice,
      deposit,
      numInstalments,
      frequency = 'monthly',
      structure = 'equal',
      startDate,
      currency = 'USD',
    } = params;

    const { amounts, monthsPerStep } = this.computeSchedule(params);

    {
      await tx.$executeRawUnsafe(
        `INSERT INTO fin.instalment_plan
           (account_id, total_price, deposit, num_instalments, frequency, structure, start_date, currency)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::date, $8::fin.currency_code)`,
        accountId,
        totalPrice,
        deposit,
        numInstalments,
        frequency,
        structure,
        startDate.toISOString().slice(0, 10),
        currency,
      );

      const invoiceIds: string[] = [];
      for (let i = 0; i < numInstalments; i++) {
        const due = new Date(startDate);
        due.setMonth(due.getMonth() + monthsPerStep * (i + 1));
        const ref = `INV-${accountId.slice(0, 8)}-${String(i + 1).padStart(3, '0')}`;
        const isBalloonFinal = structure === 'balloon' && i === numInstalments - 1;
        const description = isBalloonFinal
          ? `Balloon instalment ${i + 1} of ${numInstalments}`
          : `Instalment ${i + 1} of ${numInstalments}`;

        const rows = await tx.$queryRawUnsafe<{ invoice_id: string }[]>(
          `INSERT INTO fin.invoice
             (account_id, invoice_type, reference, amount, currency, due_date, status, description, source_table)
           VALUES ($1::uuid, 'instalment', $2, $3, $4::fin.currency_code, $5::date, 'draft', $6, 'instalment_plan')
           RETURNING invoice_id`,
          accountId,
          ref,
          amounts[i],
          currency,
          due.toISOString().slice(0, 10),
          description,
        );
        invoiceIds.push(rows[0].invoice_id);
      }

      return { invoiceIds, amounts, count: numInstalments, structure, currency };
    }
  }

  /**
   * FIN-INST-003 — raise every draft instalment invoice due on/before `asOf`:
   * transition draft → issued, create the bill on the Payments Platform via
   * Module H, notify the customer, and recompute the account position.
   * Intended to be driven by a daily scheduled job (wired in Module Z).
   */
  async raiseDueInstalments(params: { asOf?: Date } & Actor): Promise<{
    raised: Array<{ invoiceId: string; reference: string; accountId: string }>;
    count: number;
  }> {
    const asOf = params.asOf ?? new Date();
    const asOfDate = asOf.toISOString().slice(0, 10);

    const due = await this.prisma.$queryRawUnsafe<
      {
        invoice_id: string;
        account_id: string;
        reference: string;
        customer_id: string;
        amount: string;
        invoice_type: string;
        account_type: string;
      }[]
    >(
      `SELECT i.invoice_id, i.account_id, i.reference, a.customer_id,
              i.amount::text AS amount, i.invoice_type, a.account_type
         FROM fin.invoice i
         JOIN fin.account a ON a.account_id = i.account_id
        WHERE i.invoice_type = 'instalment'
          AND i.status = 'draft'
          AND i.due_date <= $1::date
        ORDER BY i.due_date, i.reference`,
      asOfDate,
    );

    const raised: Array<{ invoiceId: string; reference: string; accountId: string }> = [];

    for (const inv of due) {
      // Issue the invoice and queue the customer notification atomically.
      await this.prisma.withActor(params.actorId, params.actorRole, async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE fin.invoice SET status = 'issued'
            WHERE invoice_id = $1::uuid AND status = 'draft'`,
          inv.invoice_id,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO core.notification (recipient_kind, recipient_id, channel, template_code, payload)
           VALUES ('customer', $1::uuid, 'sms', 'instalment_due', $2::jsonb)`,
          inv.customer_id,
          JSON.stringify({ invoiceRef: inv.reference }),
        );

        // FIN-ACC-002 — recognise revenue on issue (accrual): debtor up,
        // revenue up, tagged with the buyer's asset class for the P&L.
        const assetClass = assetClassForAccountType(inv.account_type);
        await this.accounting.postJournalTx(tx as TxClient, {
          journalDate: asOfDate,
          narrative: `Invoice ${inv.reference} issued`,
          sourceTable: 'invoice',
          sourceId: inv.invoice_id,
          postedBy: params.actorId || null,
          lines: [
            { coaCode: COA.RECEIVABLES, assetClass, debit: Number(inv.amount) },
            {
              coaCode: revenueCoaForInvoice(inv.invoice_type, assetClass),
              assetClass,
              credit: Number(inv.amount),
            },
          ],
        });
      });

      // Module H owns the Payments Platform call (PAY-API-001 / FIN-INST-003).
      await this.payments.createBill(inv.invoice_id, params.actorId);

      // Refresh balance / arrears / next-due for the account (FIN-INST-004).
      await this.ledger.recomputeAccount(inv.account_id, params, asOf);

      raised.push({
        invoiceId: inv.invoice_id,
        reference: inv.reference,
        accountId: inv.account_id,
      });
    }

    return { raised, count: raised.length };
  }
}
