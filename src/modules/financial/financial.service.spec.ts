import { BadRequestException } from '@nestjs/common';
import { FinancialService, GenerateScheduleParams } from './financial.service';
import { PrismaService } from '../../prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { LedgerService } from './ledger.service';

/**
 * Unit tests for FinancialService (FIN-INST-001..003/005).
 * Prisma, PaymentsService and LedgerService are mocked; withActor() runs its
 * callback with a fake tx so we can assert SQL/params, the audit-actor wiring,
 * and the raise → Module H → recompute flow — without a database.
 */
describe('FinancialService', () => {
  let service: FinancialService;
  let tx: { $queryRawUnsafe: jest.Mock; $executeRawUnsafe: jest.Mock };
  let prisma: { $queryRawUnsafe: jest.Mock; withActor: jest.Mock };
  let payments: { createBill: jest.Mock };
  let ledger: { recomputeAccount: jest.Mock };

  const actor = { actorId: 'user-1', actorRole: 'finance' };

  const baseParams = (
    over: Partial<GenerateScheduleParams> = {},
  ): GenerateScheduleParams => ({
    accountId: 'acc-12345678',
    totalPrice: 12000,
    deposit: 0,
    numInstalments: 12,
    startDate: new Date('2026-01-01'),
    ...actor,
    ...over,
  });

  beforeEach(() => {
    tx = { $queryRawUnsafe: jest.fn(), $executeRawUnsafe: jest.fn() };
    prisma = {
      $queryRawUnsafe: jest.fn(),
      withActor: jest.fn(
        (
          _actorId: string,
          _actorRole: string,
          fn: (t: typeof tx) => Promise<unknown>,
        ) => fn(tx),
      ),
    };
    payments = { createBill: jest.fn().mockResolvedValue({ billRef: 'x' }) };
    ledger = { recomputeAccount: jest.fn().mockResolvedValue({}) };
    service = new FinancialService(
      prisma as unknown as PrismaService,
      payments as unknown as PaymentsService,
      ledger as unknown as LedgerService,
    );
  });

  describe('generateInstalmentSchedule', () => {
    it('creates an equal schedule of N draft invoices through withActor', async () => {
      tx.$queryRawUnsafe.mockImplementation(async () => [
        { invoice_id: `inv-${tx.$queryRawUnsafe.mock.calls.length}` },
      ]);

      const res = await service.generateInstalmentSchedule(baseParams());

      expect(res.count).toBe(12);
      expect(res.structure).toBe('equal');
      expect(res.currency).toBe('USD');
      expect(res.amounts.every((a) => a === 1000)).toBe(true);
      expect(res.invoiceIds).toHaveLength(12);

      expect(prisma.withActor).toHaveBeenCalledWith(
        'user-1',
        'finance',
        expect.any(Function),
      );

      const planCall = tx.$executeRawUnsafe.mock.calls.find((c) =>
        String(c[0]).includes('INSERT INTO fin.instalment_plan'),
      );
      expect(planCall).toBeDefined();
      expect(planCall![6]).toBe('equal');

      const invoiceCalls = tx.$queryRawUnsafe.mock.calls.filter((c) =>
        String(c[0]).includes('INSERT INTO fin.invoice'),
      );
      expect(invoiceCalls).toHaveLength(12);
      for (const c of invoiceCalls) {
        expect(c[3]).toBe(1000); // amount
        expect(c[4]).toBe('USD'); // currency (FIN-INST-005)
      }
    });

    it('creates a balloon schedule with a larger, clearly-labelled final invoice', async () => {
      tx.$queryRawUnsafe.mockImplementation(async () => [
        { invoice_id: `inv-${tx.$queryRawUnsafe.mock.calls.length}` },
      ]);

      const res = await service.generateInstalmentSchedule(
        baseParams({
          totalPrice: 10000,
          numInstalments: 4,
          structure: 'balloon',
          balloonAmount: 4000,
        }),
      );

      expect(res.structure).toBe('balloon');
      expect(res.amounts).toEqual([2000, 2000, 2000, 4000]);

      const planCall = tx.$executeRawUnsafe.mock.calls.find((c) =>
        String(c[0]).includes('INSERT INTO fin.instalment_plan'),
      );
      expect(planCall![6]).toBe('balloon');

      const invoiceCalls = tx.$queryRawUnsafe.mock.calls.filter((c) =>
        String(c[0]).includes('INSERT INTO fin.invoice'),
      );
      expect(invoiceCalls[3][3]).toBe(4000); // final amount = balloon
      expect(invoiceCalls[3][6]).toContain('Balloon'); // labelled
    });

    it('applies the rounding remainder to the final instalment (10000 / 3)', async () => {
      tx.$queryRawUnsafe.mockImplementation(async () => [{ invoice_id: 'inv' }]);

      const res = await service.generateInstalmentSchedule(
        baseParams({ totalPrice: 10000, deposit: 0, numInstalments: 3 }),
      );

      expect(res.amounts).toEqual([3333.33, 3333.33, 3333.34]);
      const total = res.amounts.reduce((a, b) => a + Math.round(b * 100), 0);
      expect(total).toBe(1000000);
    });

    it('subtracts the deposit before splitting (financed = total - deposit)', async () => {
      tx.$queryRawUnsafe.mockImplementation(async () => [{ invoice_id: 'inv' }]);
      const res = await service.generateInstalmentSchedule(
        baseParams({ totalPrice: 12000, deposit: 2000, numInstalments: 10 }),
      );
      expect(res.amounts.every((a) => a === 1000)).toBe(true); // 10000 / 10
    });

    it('rejects a balloon schedule without a balloon amount', async () => {
      await expect(
        service.generateInstalmentSchedule(baseParams({ structure: 'balloon' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.withActor).not.toHaveBeenCalled();
    });

    it('rejects a deposit greater than the total price', async () => {
      await expect(
        service.generateInstalmentSchedule(
          baseParams({ totalPrice: 1000, deposit: 5000 }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('raiseDueInstalments', () => {
    it('issues each due invoice, bills via Module H, notifies and recomputes', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([
        {
          invoice_id: 'inv-1',
          account_id: 'acc-1',
          reference: 'INV-1',
          customer_id: 'cust-1',
        },
      ]);

      const asOf = new Date('2026-02-01');
      const res = await service.raiseDueInstalments({ asOf, ...actor });

      expect(res.count).toBe(1);

      const issueCall = tx.$executeRawUnsafe.mock.calls.find((c) =>
        String(c[0]).includes("SET status = 'issued'"),
      );
      expect(issueCall).toBeDefined();
      expect(issueCall![1]).toBe('inv-1');

      const notifyCall = tx.$executeRawUnsafe.mock.calls.find((c) =>
        String(c[0]).includes('INSERT INTO core.notification'),
      );
      expect(notifyCall![1]).toBe('cust-1');

      expect(payments.createBill).toHaveBeenCalledWith('inv-1', 'user-1');
      expect(ledger.recomputeAccount).toHaveBeenCalledWith(
        'acc-1',
        expect.anything(),
        asOf,
      );
    });

    it('does nothing when no instalments are due', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([]);
      const res = await service.raiseDueInstalments({ ...actor });
      expect(res.count).toBe(0);
      expect(payments.createBill).not.toHaveBeenCalled();
    });
  });
});
