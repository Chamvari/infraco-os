import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ArrearsRisk } from '../financial/instalment.util';

const BUCKET_ORDER: ArrearsRisk[] = [
  'current',
  'd1_30',
  'd31_60',
  'd61_90',
  'd90_plus',
];

const BUCKET_LABEL: Record<ArrearsRisk, string> = {
  current: 'Current',
  d1_30: '1–30 days',
  d31_60: '31–60 days',
  d61_90: '61–90 days',
  d90_plus: '90+ days',
};

/**
 * ReportingService — Module Z reporting for the Finance dashboard
 * (FIN-ARR-003: arrears ageing + top debtors). Read-only.
 */
@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Collections summary: payment credits posted to the ledger this calendar
   * month vs the previous month (adjustments excluded). Drives the dashboard
   * "Collections (MTD)" KPI. Starts at zero on a fresh database.
   */
  async collectionsSummary(): Promise<{
    currency: string;
    mtd: number;
    mtdCount: number;
    prevMonth: number;
    deltaPct: number | null;
  }> {
    const rows = await this.prisma.$queryRawUnsafe<
      { mtd: string; mtd_count: string; prev: string }[]
    >(
      `SELECT
          COALESCE(SUM(amount) FILTER (WHERE posted_at >= date_trunc('month', now())), 0)::text AS mtd,
          COUNT(*)             FILTER (WHERE posted_at >= date_trunc('month', now()))::text      AS mtd_count,
          COALESCE(SUM(amount) FILTER (
            WHERE posted_at >= date_trunc('month', now()) - interval '1 month'
              AND posted_at <  date_trunc('month', now())), 0)::text                             AS prev
         FROM fin.ledger_entry
        WHERE txn_type = 'credit'
          AND (payment_method IS NULL OR payment_method <> 'adjustment')`,
    );
    const r = rows[0] ?? { mtd: '0', mtd_count: '0', prev: '0' };
    const mtd = Number(r.mtd);
    const prevMonth = Number(r.prev);
    const deltaPct =
      prevMonth > 0 ? Math.round(((mtd - prevMonth) / prevMonth) * 100) : null;
    return { currency: 'USD', mtd, mtdCount: Number(r.mtd_count), prevMonth, deltaPct };
  }

  /** Arrears ageing: latest snapshot per account, aggregated by risk bucket. */
  async arrearsAgeing(): Promise<
    Array<{ bucket: ArrearsRisk; label: string; accounts: number; total: number }>
  > {
    const rows = await this.prisma.$queryRawUnsafe<
      { risk_category: ArrearsRisk; accounts: string; total: string }[]
    >(
      `WITH latest AS (
         SELECT DISTINCT ON (account_id)
                account_id, total_outstanding, risk_category
           FROM fin.arrears
          ORDER BY account_id, snapshot_at DESC
       )
       SELECT risk_category, COUNT(*)::text AS accounts, COALESCE(SUM(total_outstanding),0)::text AS total
         FROM latest GROUP BY risk_category`,
    );

    const byBucket = new Map(rows.map((r) => [r.risk_category, r]));
    return BUCKET_ORDER.map((bucket) => {
      const r = byBucket.get(bucket);
      return {
        bucket,
        label: BUCKET_LABEL[bucket],
        accounts: r ? Number(r.accounts) : 0,
        total: r ? Number(r.total) : 0,
      };
    });
  }

  /** Top debtors by outstanding account balance, with customer + ageing. */
  async topDebtors(
    limit = 20,
  ): Promise<
    Array<{
      accountId: string;
      reference: string;
      customer: string;
      balance: number;
      currency: string;
      daysOverdue: number;
    }>
  > {
    const rows = await this.prisma.$queryRawUnsafe<
      {
        account_id: string;
        reference: string;
        customer: string;
        balance: string;
        currency: string;
        days_overdue: number | null;
      }[]
    >(
      `SELECT a.account_id::text AS account_id,
              a.reference,
              c.first_name || ' ' || c.last_name AS customer,
              a.balance::text AS balance,
              a.currency,
              (SELECT ar.days_overdue FROM fin.arrears ar
                WHERE ar.account_id = a.account_id
                ORDER BY ar.snapshot_at DESC LIMIT 1) AS days_overdue
         FROM fin.account a
         JOIN fin.customer c ON c.customer_id = a.customer_id
        WHERE a.balance > 0
        ORDER BY a.balance DESC
        LIMIT $1`,
      limit,
    );

    return rows.map((r) => ({
      accountId: r.account_id,
      reference: r.reference,
      customer: r.customer,
      balance: Number(r.balance),
      currency: r.currency,
      daysOverdue: r.days_overdue == null ? 0 : Number(r.days_overdue),
    }));
  }
}
