import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  ACCOUNT_CLASSES,
  ASSET_CLASSES,
  AccountClass,
  AssetClass,
} from '../../common/enums';

/**
 * Minimal transaction-client shape — lets a journal post INSIDE a caller's
 * transaction (payment callback, invoice issue) so the source row and its
 * double-entry journal commit atomically (FIN-ACC-002, real time).
 */
export interface TxClient {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

interface Actor {
  actorId: string;
  actorRole: string;
}

export interface JournalLineInput {
  coaCode: string;
  assetClass?: AssetClass;
  debit?: number;
  credit?: number;
}

export interface JournalEntry {
  journalDate?: string; // YYYY-MM-DD; defaults to today
  narrative?: string;
  sourceTable?: string;
  sourceId?: string;
  postedBy?: string | null;
  lines: JournalLineInput[];
}

const EPSILON = 0.005; // half a cent — balance tolerance

function money(v: unknown): number {
  return Math.round(Number(v) * 100) / 100;
}

/**
 * AccountingService — Module A accounting layer (SRS §4.x, FIN-ACC-001..010).
 *
 *   FIN-ACC-001  configurable Chart of Accounts by account_class + asset_class
 *   FIN-ACC-002  every financial transaction auto-posts a balanced double-entry
 *                journal in real time (postJournalTx runs inside the caller's tx)
 *   FIN-ACC-003  monthly P&L per asset class and consolidated
 *   FIN-ACC-004  balance sheet (assets / liabilities / equity)
 *   FIN-ACC-006  journals are reversible only by counter-entry; never deleted
 *   FIN-ACC-007  period close: lock prior periods + trial balance
 *   FIN-ACC-008  journal export (CSV) for external consolidation
 *   FIN-ACC-009  management accounts producible on demand for any period,
 *                filterable by asset class
 *
 * Posting to a 'locked' or 'closed' period is refused (FIN-ACC-007). A line is
 * either a debit or a credit (DB CHECK), and a journal must balance to the cent.
 */
@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Chart of accounts (FIN-ACC-001) -------------------------------------

  async listAccounts(filter?: {
    accountClass?: AccountClass;
    assetClass?: AssetClass;
  }): Promise<
    Array<{
      coaId: string;
      code: string;
      name: string;
      accountClass: string;
      assetClass: string;
      isPostable: boolean;
      active: boolean;
    }>
  > {
    const rows = await this.prisma.$queryRawUnsafe<
      {
        coa_id: string;
        code: string;
        name: string;
        account_class: string;
        asset_class: string;
        is_postable: boolean;
        active: boolean;
      }[]
    >(
      `SELECT coa_id::text AS coa_id, code, name, account_class, asset_class,
              is_postable, active
         FROM fin.coa_account
        WHERE ($1::fin.account_class IS NULL OR account_class = $1::fin.account_class)
          AND ($2::fin.asset_class   IS NULL OR asset_class   = $2::fin.asset_class)
        ORDER BY code`,
      filter?.accountClass ?? null,
      filter?.assetClass ?? null,
    );
    return rows.map((r) => ({
      coaId: r.coa_id,
      code: r.code,
      name: r.name,
      accountClass: r.account_class,
      assetClass: r.asset_class,
      isPostable: r.is_postable,
      active: r.active,
    }));
  }

  async createAccount(
    p: {
      code: string;
      name: string;
      accountClass: AccountClass;
      assetClass?: AssetClass;
      parentCode?: string;
      isPostable?: boolean;
    },
    actor: Actor,
  ): Promise<{ coaId: string }> {
    if (!ACCOUNT_CLASSES.includes(p.accountClass)) {
      throw new BadRequestException(`Invalid account_class '${p.accountClass}'.`);
    }
    const assetClass = p.assetClass ?? 'group';
    if (!ASSET_CLASSES.includes(assetClass)) {
      throw new BadRequestException(`Invalid asset_class '${assetClass}'.`);
    }
    if (!p.code?.trim() || !p.name?.trim()) {
      throw new BadRequestException('code and name are required.');
    }

    return this.prisma.withActor(actor.actorId, actor.actorRole, async (tx) => {
      let parentId: string | null = null;
      if (p.parentCode) {
        const parent = await tx.$queryRawUnsafe<{ coa_id: string }[]>(
          `SELECT coa_id::text AS coa_id FROM fin.coa_account WHERE code = $1`,
          p.parentCode,
        );
        if (parent.length === 0) {
          throw new NotFoundException(`Parent account '${p.parentCode}' not found.`);
        }
        parentId = parent[0].coa_id;
      }
      try {
        const rows = await tx.$queryRawUnsafe<{ coa_id: string }[]>(
          `INSERT INTO fin.coa_account
             (code, name, account_class, asset_class, parent_id, is_postable)
           VALUES ($1, $2, $3::fin.account_class, $4::fin.asset_class, $5::uuid, $6)
           RETURNING coa_id::text AS coa_id`,
          p.code.trim(),
          p.name.trim(),
          p.accountClass,
          assetClass,
          parentId,
          p.isPostable ?? true,
        );
        return { coaId: rows[0].coa_id };
      } catch (err: unknown) {
        if (this.isUnique(err)) {
          throw new BadRequestException(`Account code '${p.code}' already exists.`);
        }
        throw err;
      }
    });
  }

  // ---- Journal posting engine (FIN-ACC-002) --------------------------------

  /**
   * Post a balanced double-entry journal INSIDE the caller's transaction. Use
   * this from money-movement paths (payment, invoice, write-off) so the journal
   * commits atomically with the source row. Refuses locked/closed periods.
   */
  async postJournalTx(tx: TxClient, entry: JournalEntry): Promise<{ journalId: string }> {
    const lines = entry.lines ?? [];
    if (lines.length < 2) {
      throw new BadRequestException('A journal needs at least two lines.');
    }

    let totalDebit = 0;
    let totalCredit = 0;
    for (const l of lines) {
      const debit = money(l.debit ?? 0);
      const credit = money(l.credit ?? 0);
      if (debit < 0 || credit < 0) {
        throw new BadRequestException('Journal amounts must be non-negative.');
      }
      if ((debit > 0) === (credit > 0)) {
        throw new BadRequestException(
          'Each journal line must be exactly one of debit or credit.',
        );
      }
      totalDebit += debit;
      totalCredit += credit;
    }
    if (Math.abs(totalDebit - totalCredit) > EPSILON) {
      throw new BadRequestException(
        `Journal does not balance: debit ${totalDebit} ≠ credit ${totalCredit}.`,
      );
    }

    const journalDate = entry.journalDate ?? new Date().toISOString().slice(0, 10);
    const year = Number(journalDate.slice(0, 4));
    const month = Number(journalDate.slice(5, 7));

    // Resolve (or open) the accounting period and reject locked/closed ones.
    await tx.$executeRawUnsafe(
      `INSERT INTO fin.acc_period (year, month, status)
       VALUES ($1, $2, 'open') ON CONFLICT (year, month) DO NOTHING`,
      year,
      month,
    );
    const period = (
      await tx.$queryRawUnsafe<{ period_id: string; status: string }[]>(
        `SELECT period_id::text AS period_id, status
           FROM fin.acc_period WHERE year = $1 AND month = $2`,
        year,
        month,
      )
    )[0];
    if (period.status !== 'open') {
      throw new ForbiddenException(
        `Accounting period ${year}-${String(month).padStart(2, '0')} is ${period.status}; cannot post.`,
      );
    }

    // Resolve COA codes → ids; enforce postable + active.
    const codes = Array.from(new Set(lines.map((l) => l.coaCode)));
    const coa = await tx.$queryRawUnsafe<
      { code: string; coa_id: string; asset_class: string; is_postable: boolean; active: boolean }[]
    >(
      `SELECT code, coa_id::text AS coa_id, asset_class, is_postable, active
         FROM fin.coa_account WHERE code = ANY($1::text[])`,
      codes,
    );
    const byCode = new Map(coa.map((c) => [c.code, c]));
    for (const code of codes) {
      const c = byCode.get(code);
      if (!c) throw new NotFoundException(`Chart-of-accounts code '${code}' not found.`);
      if (!c.is_postable || !c.active) {
        throw new BadRequestException(`Account '${code}' is not postable.`);
      }
    }

    const header = (
      await tx.$queryRawUnsafe<{ journal_id: string }[]>(
        `INSERT INTO fin.journal
           (period_id, journal_date, narrative, source_table, source_id, posted_by)
         VALUES ($1::uuid, $2::date, $3, $4, $5, $6::uuid)
         RETURNING journal_id::text AS journal_id`,
        period.period_id,
        journalDate,
        entry.narrative ?? null,
        entry.sourceTable ?? null,
        entry.sourceId ?? null,
        entry.postedBy ?? null,
      )
    )[0];

    for (const l of lines) {
      const c = byCode.get(l.coaCode)!;
      await tx.$executeRawUnsafe(
        `INSERT INTO fin.journal_line (journal_id, coa_id, asset_class, debit, credit)
         VALUES ($1::uuid, $2::uuid, $3::fin.asset_class, $4, $5)`,
        header.journal_id,
        c.coa_id,
        l.assetClass ?? c.asset_class,
        money(l.debit ?? 0),
        money(l.credit ?? 0),
      );
    }

    return { journalId: header.journal_id };
  }

  /** Post a manual journal in its own audited transaction (FIN-ACC-002). */
  async postJournal(entry: JournalEntry, actor: Actor): Promise<{ journalId: string }> {
    return this.prisma.withActor(actor.actorId, actor.actorRole, (tx) =>
      this.postJournalTx(tx as TxClient, { ...entry, postedBy: entry.postedBy ?? actor.actorId }),
    );
  }

  /**
   * FIN-ACC-006 — reverse a posted journal by a counter-entry. Direct deletion
   * is never permitted; this creates a new journal that swaps every debit and
   * credit, then links the original via reversed_by. Refuses double reversal.
   */
  async reverseJournal(
    journalId: string,
    actor: Actor,
    reason?: string,
  ): Promise<{ reversalJournalId: string }> {
    return this.prisma.withActor(actor.actorId, actor.actorRole, async (tx) => {
      const orig = await tx.$queryRawUnsafe<
        { journal_id: string; reversed_by: string | null }[]
      >(
        `SELECT journal_id::text AS journal_id, reversed_by::text AS reversed_by
           FROM fin.journal WHERE journal_id = $1::uuid FOR UPDATE`,
        journalId,
      );
      if (orig.length === 0) {
        throw new NotFoundException(`Journal ${journalId} not found.`);
      }
      if (orig[0].reversed_by) {
        throw new BadRequestException('Journal has already been reversed.');
      }

      const lines = await tx.$queryRawUnsafe<
        { code: string; asset_class: AssetClass; debit: string; credit: string }[]
      >(
        `SELECT c.code, jl.asset_class, jl.debit::text AS debit, jl.credit::text AS credit
           FROM fin.journal_line jl
           JOIN fin.coa_account c ON c.coa_id = jl.coa_id
          WHERE jl.journal_id = $1::uuid`,
        journalId,
      );

      // Swap debit ↔ credit on every line (the counter-entry).
      const reversal = await this.postJournalTx(tx as TxClient, {
        narrative: `Reversal of ${journalId}${reason ? `: ${reason}` : ''}`,
        sourceTable: 'journal',
        sourceId: journalId,
        postedBy: actor.actorId || null,
        lines: lines.map((l) => ({
          coaCode: l.code,
          assetClass: l.asset_class,
          debit: Number(l.credit),
          credit: Number(l.debit),
        })),
      });

      await tx.$executeRawUnsafe(
        `UPDATE fin.journal SET reversed_by = $1::uuid WHERE journal_id = $2::uuid`,
        reversal.journalId,
        journalId,
      );

      return { reversalJournalId: reversal.journalId };
    });
  }

  // ---- Reporting (FIN-ACC-003/004/007/009) ---------------------------------

  /**
   * FIN-ACC-007/009 — trial balance for a period (a month, or a whole year when
   * month is omitted). Lists every account with movement and the debit/credit
   * grand totals, which must be equal for a healthy ledger.
   */
  async trialBalance(p: { year: number; month?: number }): Promise<{
    period: { year: number; month: number | null };
    rows: Array<{ code: string; name: string; accountClass: string; debit: number; credit: number }>;
    totalDebit: number;
    totalCredit: number;
    balanced: boolean;
  }> {
    const rows = await this.prisma.$queryRawUnsafe<
      { code: string; name: string; account_class: string; debit: string; credit: string }[]
    >(
      `SELECT c.code, c.name, c.account_class,
              COALESCE(SUM(jl.debit), 0)::text  AS debit,
              COALESCE(SUM(jl.credit), 0)::text AS credit
         FROM fin.coa_account c
         LEFT JOIN fin.journal_line jl ON jl.coa_id = c.coa_id
         LEFT JOIN fin.journal j ON j.journal_id = jl.journal_id
              AND extract(year  FROM j.journal_date) = $1
              AND ($2::int IS NULL OR extract(month FROM j.journal_date) = $2)
        GROUP BY c.code, c.name, c.account_class
       HAVING COALESCE(SUM(jl.debit), 0) <> 0 OR COALESCE(SUM(jl.credit), 0) <> 0
        ORDER BY c.code`,
      p.year,
      p.month ?? null,
    );

    let totalDebit = 0;
    let totalCredit = 0;
    const out = rows.map((r) => {
      const debit = money(r.debit);
      const credit = money(r.credit);
      totalDebit += debit;
      totalCredit += credit;
      return { code: r.code, name: r.name, accountClass: r.account_class, debit, credit };
    });
    totalDebit = money(totalDebit);
    totalCredit = money(totalCredit);
    return {
      period: { year: p.year, month: p.month ?? null },
      rows: out,
      totalDebit,
      totalCredit,
      balanced: Math.abs(totalDebit - totalCredit) <= EPSILON,
    };
  }

  /**
   * FIN-ACC-003/009 — P&L for a period, broken down per asset class and
   * consolidated: revenue, cost of sales, gross margin, operating expenses,
   * EBITDA, finance costs, net profit. Filterable to a single asset class.
   */
  async profitAndLoss(p: {
    year: number;
    month?: number;
    assetClass?: AssetClass;
  }): Promise<{
    period: { year: number; month: number | null };
    byAssetClass: Array<PnlBlock & { assetClass: string }>;
    consolidated: PnlBlock;
  }> {
    const rows = await this.prisma.$queryRawUnsafe<
      { asset_class: string; account_class: string; net_credit: string }[]
    >(
      `SELECT jl.asset_class, c.account_class,
              SUM(jl.credit - jl.debit)::text AS net_credit
         FROM fin.journal_line jl
         JOIN fin.coa_account c ON c.coa_id = jl.coa_id
         JOIN fin.journal j ON j.journal_id = jl.journal_id
        WHERE c.account_class IN ('revenue','cogs','opex','finance_cost')
          AND extract(year  FROM j.journal_date) = $1
          AND ($2::int IS NULL OR extract(month FROM j.journal_date) = $2)
          AND ($3::fin.asset_class IS NULL OR jl.asset_class = $3::fin.asset_class)
        GROUP BY jl.asset_class, c.account_class`,
      p.year,
      p.month ?? null,
      p.assetClass ?? null,
    );

    const blocks = new Map<string, PnlBlock>();
    const ensure = (ac: string): PnlBlock => {
      let b = blocks.get(ac);
      if (!b) {
        b = {
          revenue: 0,
          costOfSales: 0,
          grossMargin: 0,
          operatingExpenses: 0,
          ebitda: 0,
          financeCosts: 0,
          netProfit: 0,
        };
        blocks.set(ac, b);
      }
      return b;
    };

    for (const r of rows) {
      const net = money(r.net_credit); // credit − debit
      const b = ensure(r.asset_class);
      if (r.account_class === 'revenue') b.revenue += net;
      else if (r.account_class === 'cogs') b.costOfSales += -net;
      else if (r.account_class === 'opex') b.operatingExpenses += -net;
      else if (r.account_class === 'finance_cost') b.financeCosts += -net;
    }

    const finalize = (b: PnlBlock): PnlBlock => {
      b.revenue = money(b.revenue);
      b.costOfSales = money(b.costOfSales);
      b.operatingExpenses = money(b.operatingExpenses);
      b.financeCosts = money(b.financeCosts);
      b.grossMargin = money(b.revenue - b.costOfSales);
      b.ebitda = money(b.grossMargin - b.operatingExpenses);
      b.netProfit = money(b.ebitda - b.financeCosts);
      return b;
    };

    const consolidated = ensure('__total__');
    for (const [ac, b] of blocks) {
      if (ac === '__total__') continue;
      consolidated.revenue += b.revenue;
      consolidated.costOfSales += b.costOfSales;
      consolidated.operatingExpenses += b.operatingExpenses;
      consolidated.financeCosts += b.financeCosts;
    }

    const byAssetClass = Array.from(blocks.entries())
      .filter(([ac]) => ac !== '__total__')
      .map(([ac, b]) => ({ assetClass: ac, ...finalize(b) }))
      .sort((a, b) => a.assetClass.localeCompare(b.assetClass));

    return {
      period: { year: p.year, month: p.month ?? null },
      byAssetClass,
      consolidated: finalize(consolidated),
    };
  }

  /**
   * FIN-ACC-004/009 — balance sheet as at a date: assets, liabilities, equity
   * (including retained earnings = net profit to date). Reports whether the
   * fundamental accounting equation holds.
   */
  async balanceSheet(p?: { asOf?: string; assetClass?: AssetClass }): Promise<{
    asOf: string;
    assets: number;
    liabilities: number;
    equity: number;
    retainedEarnings: number;
    balanced: boolean;
  }> {
    const asOf = p?.asOf ?? new Date().toISOString().slice(0, 10);

    const rows = await this.prisma.$queryRawUnsafe<
      { account_class: string; net_debit: string }[]
    >(
      `SELECT c.account_class, SUM(jl.debit - jl.credit)::text AS net_debit
         FROM fin.journal_line jl
         JOIN fin.coa_account c ON c.coa_id = jl.coa_id
         JOIN fin.journal j ON j.journal_id = jl.journal_id
        WHERE j.journal_date <= $1::date
          AND ($2::fin.asset_class IS NULL OR jl.asset_class = $2::fin.asset_class)
        GROUP BY c.account_class`,
      asOf,
      p?.assetClass ?? null,
    );

    let assets = 0;
    let liabilities = 0;
    let equity = 0;
    let retainedEarnings = 0;
    for (const r of rows) {
      const netDebit = money(r.net_debit); // debit − credit
      switch (r.account_class) {
        case 'asset':
        case 'capex':
          assets += netDebit;
          break;
        case 'liability':
          liabilities += -netDebit; // liabilities carry a credit balance
          break;
        case 'equity':
          equity += -netDebit;
          break;
        // revenue/cogs/opex/finance_cost roll up into retained earnings
        case 'revenue':
          retainedEarnings += -netDebit;
          break;
        case 'cogs':
        case 'opex':
        case 'finance_cost':
          retainedEarnings += -netDebit; // expenses reduce earnings
          break;
      }
    }

    assets = money(assets);
    liabilities = money(liabilities);
    equity = money(equity);
    retainedEarnings = money(retainedEarnings);
    const balanced =
      Math.abs(assets - (liabilities + equity + retainedEarnings)) <= EPSILON;
    return { asOf, assets, liabilities, equity, retainedEarnings, balanced };
  }

  /**
   * FIN-ACC-007 — close (lock) an accounting period and return its trial
   * balance. Once closed, postJournalTx refuses further postings to it. Senior
   * finance only (enforced at the controller via finance_senior).
   */
  async closePeriod(
    p: { year: number; month: number },
    actor: Actor,
  ): Promise<{ periodId: string; status: string; trialBalance: Awaited<ReturnType<AccountingService['trialBalance']>> }> {
    const { periodId, status } = await this.prisma.withActor(
      actor.actorId,
      actor.actorRole,
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<{ period_id: string; status: string }[]>(
          `SELECT period_id::text AS period_id, status
             FROM fin.acc_period WHERE year = $1 AND month = $2 FOR UPDATE`,
          p.year,
          p.month,
        );
        if (rows.length === 0) {
          throw new NotFoundException(
            `Accounting period ${p.year}-${String(p.month).padStart(2, '0')} does not exist.`,
          );
        }
        if (rows[0].status === 'closed') {
          throw new BadRequestException('Period is already closed.');
        }
        await tx.$executeRawUnsafe(
          `UPDATE fin.acc_period SET status = 'closed', closed_at = now()
            WHERE period_id = $1::uuid`,
          rows[0].period_id,
        );
        return { periodId: rows[0].period_id, status: 'closed' };
      },
    );

    const trialBalance = await this.trialBalance({ year: p.year, month: p.month });
    return { periodId, status, trialBalance };
  }

  /**
   * FIN-ACC-008 — export posted journals for a period as CSV, for upload into an
   * external accounting/ERP system. One row per journal line.
   */
  async exportJournalsCsv(p: { year: number; month?: number }): Promise<string> {
    const rows = await this.prisma.$queryRawUnsafe<
      {
        journal_id: string;
        journal_date: string;
        narrative: string | null;
        source_table: string | null;
        source_id: string | null;
        code: string;
        name: string;
        asset_class: string;
        debit: string;
        credit: string;
      }[]
    >(
      `SELECT j.journal_id::text AS journal_id, j.journal_date::text AS journal_date,
              j.narrative, j.source_table, j.source_id,
              c.code, c.name, jl.asset_class,
              jl.debit::text AS debit, jl.credit::text AS credit
         FROM fin.journal j
         JOIN fin.journal_line jl ON jl.journal_id = j.journal_id
         JOIN fin.coa_account c   ON c.coa_id = jl.coa_id
        WHERE extract(year  FROM j.journal_date) = $1
          AND ($2::int IS NULL OR extract(month FROM j.journal_date) = $2)
        ORDER BY j.journal_date, j.journal_id, c.code`,
      p.year,
      p.month ?? null,
    );

    const header = [
      'journal_id',
      'journal_date',
      'account_code',
      'account_name',
      'asset_class',
      'debit',
      'credit',
      'source_table',
      'source_id',
      'narrative',
    ];
    const esc = (v: string | null): string => {
      const s = v ?? '';
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map((r) =>
      [
        r.journal_id,
        r.journal_date,
        r.code,
        r.name,
        r.asset_class,
        money(r.debit).toFixed(2),
        money(r.credit).toFixed(2),
        r.source_table,
        r.source_id,
        r.narrative,
      ]
        .map((v) => esc(v as string | null))
        .join(','),
    );
    return [header.join(','), ...lines].join('\n');
  }

  private isUnique(err: unknown): boolean {
    const e = err as { code?: string; meta?: { code?: string } };
    return (e?.meta?.code ?? e?.code) === '23505';
  }
}

interface PnlBlock {
  revenue: number;
  costOfSales: number;
  grossMargin: number;
  operatingExpenses: number;
  ebitda: number;
  financeCosts: number;
  netProfit: number;
}
