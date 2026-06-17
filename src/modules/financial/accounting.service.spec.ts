import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AccountingService, JournalEntry } from './accounting.service';
import { PrismaService } from '../../prisma.service';

/**
 * Unit tests for AccountingService (FIN-ACC-001..009). Prisma is mocked;
 * withActor() runs its callback with a fake tx whose responses are routed by
 * the SQL text, so we can assert the posting engine, period locking, reversal,
 * and the management-account maths without a database.
 */
describe('AccountingService', () => {
  let service: AccountingService;
  let tx: { $queryRawUnsafe: jest.Mock; $executeRawUnsafe: jest.Mock };
  let prisma: { $queryRawUnsafe: jest.Mock; withActor: jest.Mock };

  const actor = { actorId: 'user-1', actorRole: 'finance' };

  // Default postable COA set returned by the code-resolution query.
  const POSTABLE = [
    { code: '1200', coa_id: 'coa-1200', asset_class: 'group', is_postable: true, active: true },
    { code: '1300', coa_id: 'coa-1300', asset_class: 'group', is_postable: true, active: true },
    { code: '4000', coa_id: 'coa-4000', asset_class: 'residential', is_postable: true, active: true },
  ];

  // Configurable fake tx whose query routing keys off the SQL string.
  function makeTx(opts: { periodStatus?: string } = {}) {
    const queryImpl = async (sql: string): Promise<unknown[]> => {
      if (sql.includes('FROM fin.acc_period')) {
        return [{ period_id: 'period-1', status: opts.periodStatus ?? 'open' }];
      }
      if (sql.includes('FROM fin.coa_account WHERE code = ANY')) {
        return POSTABLE;
      }
      if (sql.includes('INSERT INTO fin.journal')) {
        return [{ journal_id: 'jrnl-new' }];
      }
      return [];
    };
    return {
      $queryRawUnsafe: jest.fn().mockImplementation(queryImpl),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
  }

  function wire(t: ReturnType<typeof makeTx>) {
    tx = t;
    prisma = {
      $queryRawUnsafe: jest.fn(),
      withActor: jest.fn(
        (_a: string, _r: string, fn: (x: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    };
    service = new AccountingService(prisma as unknown as PrismaService);
  }

  const balancedEntry = (over: Partial<JournalEntry> = {}): JournalEntry => ({
    narrative: 'test',
    lines: [
      { coaCode: '1300', debit: 1000 },
      { coaCode: '1200', credit: 1000 },
    ],
    ...over,
  });

  describe('postJournalTx', () => {
    it('posts a balanced double-entry journal to an open period', async () => {
      wire(makeTx());

      const res = await service.postJournalTx(tx, balancedEntry());

      expect(res).toEqual({ journalId: 'jrnl-new' });
      // header + two lines inserted
      const lineInserts = tx.$executeRawUnsafe.mock.calls.filter((c) =>
        String(c[0]).includes('INSERT INTO fin.journal_line'),
      );
      expect(lineInserts).toHaveLength(2);
    });

    it('rejects an unbalanced journal', async () => {
      wire(makeTx());
      await expect(
        service.postJournalTx(tx, {
          lines: [
            { coaCode: '1300', debit: 1000 },
            { coaCode: '1200', credit: 900 },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a line that is both a debit and a credit', async () => {
      wire(makeTx());
      await expect(
        service.postJournalTx(tx, {
          lines: [
            { coaCode: '1300', debit: 500, credit: 500 },
            { coaCode: '1200', credit: 1000 },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to post into a closed period (FIN-ACC-007)', async () => {
      wire(makeTx({ periodStatus: 'closed' }));
      await expect(service.postJournalTx(tx, balancedEntry())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects an unknown chart-of-accounts code', async () => {
      wire(makeTx());
      await expect(
        service.postJournalTx(tx, {
          lines: [
            { coaCode: '9999', debit: 1000 },
            { coaCode: '1200', credit: 1000 },
          ],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reverseJournal (FIN-ACC-006)', () => {
    it('posts a counter-entry swapping debit and credit, and links reversed_by', async () => {
      const t = makeTx();
      t.$queryRawUnsafe.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT journal_id') && sql.includes('reversed_by')) {
          return [{ journal_id: 'jrnl-orig', reversed_by: null }];
        }
        if (sql.includes('FROM fin.journal_line jl') && sql.includes('JOIN fin.coa_account')) {
          return [
            { code: '1300', asset_class: 'group', debit: '1000', credit: '0' },
            { code: '1200', asset_class: 'group', debit: '0', credit: '1000' },
          ];
        }
        if (sql.includes('FROM fin.acc_period')) return [{ period_id: 'p1', status: 'open' }];
        if (sql.includes('WHERE code = ANY')) return POSTABLE;
        if (sql.includes('INSERT INTO fin.journal')) return [{ journal_id: 'jrnl-rev' }];
        return [];
      });
      wire(t);

      const res = await service.reverseJournal('jrnl-orig', actor, 'erroneous');

      expect(res).toEqual({ reversalJournalId: 'jrnl-rev' });
      // The counter-entry swaps the lines: 1300 becomes a credit, 1200 a debit.
      const lineInserts = tx.$executeRawUnsafe.mock.calls.filter((c) =>
        String(c[0]).includes('INSERT INTO fin.journal_line'),
      );
      const cash = lineInserts.find((c) => c[2] === 'coa-1300');
      expect(Number(cash![4])).toBe(0); // debit
      expect(Number(cash![5])).toBe(1000); // credit
      // reversed_by linked on the original
      const link = tx.$executeRawUnsafe.mock.calls.find((c) =>
        String(c[0]).includes('SET reversed_by'),
      );
      expect(link![1]).toBe('jrnl-rev');
    });

    it('refuses to reverse an already-reversed journal', async () => {
      const t = makeTx();
      t.$queryRawUnsafe.mockImplementation(async (sql: string) => {
        if (sql.includes('reversed_by')) {
          return [{ journal_id: 'jrnl-orig', reversed_by: 'jrnl-rev' }];
        }
        return [];
      });
      wire(t);
      await expect(service.reverseJournal('jrnl-orig', actor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('trialBalance (FIN-ACC-007/009)', () => {
    it('totals debits and credits and reports balanced', async () => {
      wire(makeTx());
      prisma.$queryRawUnsafe.mockResolvedValue([
        { code: '1300', name: 'Cash', account_class: 'asset', debit: '1000', credit: '0' },
        { code: '1200', name: 'Receivables', account_class: 'asset', debit: '0', credit: '1000' },
      ]);

      const tb = await service.trialBalance({ year: 2026, month: 6 });

      expect(tb.totalDebit).toBe(1000);
      expect(tb.totalCredit).toBe(1000);
      expect(tb.balanced).toBe(true);
      expect(tb.rows).toHaveLength(2);
    });
  });

  describe('profitAndLoss (FIN-ACC-003)', () => {
    it('computes margin and EBITDA per asset class and consolidated', async () => {
      wire(makeTx());
      prisma.$queryRawUnsafe.mockResolvedValue([
        { asset_class: 'residential', account_class: 'revenue', net_credit: '10000' },
        { asset_class: 'residential', account_class: 'cogs', net_credit: '-4000' },
        { asset_class: 'residential', account_class: 'opex', net_credit: '-1000' },
        { asset_class: 'agro', account_class: 'revenue', net_credit: '5000' },
      ]);

      const pnl = await service.profitAndLoss({ year: 2026 });

      const res = pnl.byAssetClass.find((b) => b.assetClass === 'residential')!;
      expect(res.revenue).toBe(10000);
      expect(res.costOfSales).toBe(4000);
      expect(res.grossMargin).toBe(6000);
      expect(res.operatingExpenses).toBe(1000);
      expect(res.ebitda).toBe(5000);
      // Consolidated revenue spans both asset classes.
      expect(pnl.consolidated.revenue).toBe(15000);
      expect(pnl.consolidated.netProfit).toBe(10000); // 15000 - 4000 - 1000
    });
  });

  describe('balanceSheet (FIN-ACC-004)', () => {
    it('derives liabilities/equity from credit balances and checks the equation', async () => {
      wire(makeTx());
      prisma.$queryRawUnsafe.mockResolvedValue([
        { account_class: 'asset', net_debit: '10000' }, // cash + receivables
        { account_class: 'revenue', net_debit: '-10000' }, // credit balance → retained earnings
      ]);

      const bs = await service.balanceSheet({ asOf: '2026-06-30' });

      expect(bs.assets).toBe(10000);
      expect(bs.retainedEarnings).toBe(10000);
      expect(bs.liabilities).toBe(0);
      expect(bs.equity).toBe(0);
      expect(bs.balanced).toBe(true);
    });
  });

  describe('closePeriod (FIN-ACC-007)', () => {
    it('locks an open period and returns its trial balance', async () => {
      const t = makeTx();
      t.$queryRawUnsafe.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM fin.acc_period') && sql.includes('FOR UPDATE')) {
          return [{ period_id: 'period-1', status: 'open' }];
        }
        return [];
      });
      wire(t);
      prisma.$queryRawUnsafe.mockResolvedValue([]); // empty trial balance

      const res = await service.closePeriod({ year: 2026, month: 6 }, actor);

      expect(res.status).toBe('closed');
      const upd = tx.$executeRawUnsafe.mock.calls.find((c) =>
        String(c[0]).includes("SET status = 'closed'"),
      );
      expect(upd).toBeTruthy();
    });

    it('refuses to close an already-closed period', async () => {
      const t = makeTx();
      t.$queryRawUnsafe.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM fin.acc_period') && sql.includes('FOR UPDATE')) {
          return [{ period_id: 'period-1', status: 'closed' }];
        }
        return [];
      });
      wire(t);
      await expect(
        service.closePeriod({ year: 2026, month: 6 }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
