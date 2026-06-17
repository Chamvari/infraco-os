import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { AccountingService } from './accounting.service';
import { PrismaService } from '../../prisma.service';

/**
 * Unit tests for LedgerService (FIN-LED-001..005 + FIN-INST-004 recompute).
 * Prisma is mocked; withActor() runs its callback with a fake tx.
 */
describe('LedgerService', () => {
  let service: LedgerService;
  let tx: { $queryRawUnsafe: jest.Mock; $executeRawUnsafe: jest.Mock };
  let prisma: { $queryRawUnsafe: jest.Mock; withActor: jest.Mock };
  let accounting: { postJournalTx: jest.Mock };

  const actor = { actorId: 'user-1', actorRole: 'finance' };

  beforeEach(() => {
    tx = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    prisma = {
      $queryRawUnsafe: jest.fn(),
      withActor: jest.fn(
        (_a: string, _r: string, fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    };
    accounting = { postJournalTx: jest.fn().mockResolvedValue({ journalId: 'jrnl-1' }) };
    service = new LedgerService(
      prisma as unknown as PrismaService,
      accounting as unknown as AccountingService,
    );
  });

  const payParams = (amount: number) => ({
    accountId: 'acc-1',
    invoiceId: 'inv-1',
    amount,
    currency: 'USD' as const,
    paymentMethod: 'wallet',
    platformTxnId: 'TX-1',
    narrative: 'Payment',
  });

  describe('postPaymentTx', () => {
    it('posts a full payment and marks the invoice paid', async () => {
      tx.$queryRawUnsafe
        .mockResolvedValueOnce([{ amount: '1000.00', amount_paid: '0' }])
        .mockResolvedValueOnce([{ ledger_id: '10' }]);

      const res = await service.postPaymentTx(tx, payParams(1000));

      expect(res).toEqual({ ledgerId: '10', duplicate: false, invoiceStatus: 'paid' });
      const upd = tx.$executeRawUnsafe.mock.calls.find((c) =>
        String(c[0]).includes('UPDATE fin.invoice SET amount_paid'),
      );
      expect(upd![1]).toBe(1000);
      expect(upd![2]).toBe('paid');
    });

    it('marks the invoice partially_paid on a partial payment', async () => {
      tx.$queryRawUnsafe
        .mockResolvedValueOnce([{ amount: '1000.00', amount_paid: '0' }])
        .mockResolvedValueOnce([{ ledger_id: '11' }]);

      const res = await service.postPaymentTx(tx, payParams(400));

      expect(res.invoiceStatus).toBe('partially_paid');
      const upd = tx.$executeRawUnsafe.mock.calls.find((c) =>
        String(c[0]).includes('UPDATE fin.invoice SET amount_paid'),
      );
      expect(upd![1]).toBe(400);
      expect(upd![2]).toBe('partially_paid');
    });

    it('accumulates onto an existing partial balance', async () => {
      tx.$queryRawUnsafe
        .mockResolvedValueOnce([{ amount: '1000.00', amount_paid: '600.00' }])
        .mockResolvedValueOnce([{ ledger_id: '12' }]);

      const res = await service.postPaymentTx(tx, payParams(400));
      expect(res.invoiceStatus).toBe('paid'); // 600 + 400 = 1000
    });

    it('does NOT double-post when platform_txn_id already exists (idempotency)', async () => {
      tx.$queryRawUnsafe
        .mockResolvedValueOnce([{ amount: '1000.00', amount_paid: '0' }])
        .mockRejectedValueOnce({
          meta: { code: '23505', message: 'uq_ledger_platform_txn' },
        });

      const res = await service.postPaymentTx(tx, payParams(1000));

      expect(res).toEqual({ ledgerId: null, duplicate: true, invoiceStatus: null });
      const upd = tx.$executeRawUnsafe.mock.calls.find((c) =>
        String(c[0]).includes('UPDATE fin.invoice SET amount_paid'),
      );
      expect(upd).toBeUndefined();
    });

    it('throws NotFound when the invoice does not exist', async () => {
      tx.$queryRawUnsafe.mockResolvedValueOnce([]);
      await expect(service.postPaymentTx(tx, payParams(100))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('parkSuspenseTx', () => {
    it('inserts an idempotent suspense item', async () => {
      await service.parkSuspenseTx(tx, {
        platformTxnId: 'TX-9',
        amount: 250,
        currency: 'USD',
        channel: 'ussd',
        rawPayload: { foo: 'bar' },
      });
      const call = tx.$executeRawUnsafe.mock.calls[0];
      expect(String(call[0])).toContain('INSERT INTO fin.suspense_item');
      expect(String(call[0])).toContain('ON CONFLICT (platform_txn_id) DO NOTHING');
      expect(call[1]).toBe('TX-9');
    });
  });

  describe('resolveSuspense', () => {
    it('allocates a suspense item to an invoice and recomputes arrears', async () => {
      const recomputeSpy = jest
        .spyOn(service, 'recomputeAccount')
        .mockResolvedValue({} as never);
      tx.$queryRawUnsafe
        .mockResolvedValueOnce([
          { platform_txn_id: 'TX-5', amount: '500.00', currency: 'USD', resolved: false },
        ])
        .mockResolvedValueOnce([{ amount: '500.00', amount_paid: '0' }]) // postPaymentTx: invoice
        .mockResolvedValueOnce([{ ledger_id: '40' }]); // postPaymentTx: ledger

      const res = await service.resolveSuspense(
        { suspenseId: 'sus-1', accountId: 'acc-1', invoiceId: 'inv-1' },
        actor,
      );

      expect(res).toEqual({ ledgerId: '40', duplicate: false });
      const markResolved = tx.$executeRawUnsafe.mock.calls.find((c) =>
        String(c[0]).includes('UPDATE fin.suspense_item'),
      );
      expect(markResolved).toBeDefined();
      expect(recomputeSpy).toHaveBeenCalledWith('acc-1', actor);
    });

    it('rejects an already-resolved suspense item', async () => {
      tx.$queryRawUnsafe.mockResolvedValueOnce([
        { platform_txn_id: 'TX-5', amount: '500', currency: 'USD', resolved: true },
      ]);
      await expect(
        service.resolveSuspense(
          { suspenseId: 'sus-1', accountId: 'acc-1', invoiceId: 'inv-1' },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFound for an unknown suspense item', async () => {
      tx.$queryRawUnsafe.mockResolvedValueOnce([]);
      await expect(
        service.resolveSuspense(
          { suspenseId: 'missing', accountId: 'acc-1', invoiceId: 'inv-1' },
          actor,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('postManualAdjustment (dual authorisation, FIN-LED-005)', () => {
    const base = {
      accountId: 'acc-1',
      txnType: 'credit' as const,
      amount: 100,
      kind: 'credit_note' as const,
      narrative: 'goodwill',
      authoriserId: 'user-2',
      authoriserRole: 'finance_mgr',
    };

    it('posts a dual-authorised credit note and recomputes', async () => {
      jest.spyOn(service, 'recomputeAccount').mockResolvedValue({} as never);
      tx.$queryRawUnsafe.mockResolvedValueOnce([{ ledger_id: '50' }]);

      const res = await service.postManualAdjustment(base, actor);

      expect(res).toEqual({ ledgerId: '50' });
      const ins = tx.$queryRawUnsafe.mock.calls[0];
      expect(String(ins[0])).toContain('INSERT INTO fin.ledger_entry');
      expect(String(ins[6])).toContain('[credit_note]');
      expect(String(ins[6])).toContain('authorised_by=user-2');
      expect(service.recomputeAccount).toHaveBeenCalledWith('acc-1', actor);
    });

    it('rejects when no second authoriser is supplied', async () => {
      await expect(
        service.postManualAdjustment({ ...base, authoriserId: '' }, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.withActor).not.toHaveBeenCalled();
    });

    it('rejects when the authoriser is the same person as the actor', async () => {
      await expect(
        service.postManualAdjustment({ ...base, authoriserId: 'user-1' }, actor),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('requires a Finance Manager to authorise a write-off', async () => {
      await expect(
        service.postManualAdjustment(
          { ...base, kind: 'write_off', authoriserRole: 'finance' },
          actor,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows a write-off authorised by a Finance Manager', async () => {
      jest.spyOn(service, 'recomputeAccount').mockResolvedValue({} as never);
      tx.$queryRawUnsafe.mockResolvedValueOnce([{ ledger_id: '51' }]);
      const res = await service.postManualAdjustment(
        { ...base, kind: 'write_off', authoriserRole: 'finance_mgr' },
        actor,
      );
      expect(res.ledgerId).toBe('51');
    });

    it('rejects a non-positive amount', async () => {
      await expect(
        service.postManualAdjustment({ ...base, amount: 0 }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('recomputeAccount (FIN-INST-004)', () => {
    it('computes balance, arrears bucket and next due, and snapshots arrears', async () => {
      tx.$queryRawUnsafe
        .mockResolvedValueOnce([{ account_id: 'acc-1' }]) // account exists
        .mockResolvedValueOnce([
          {
            outstanding: '500.00',
            total_paid: '100.00',
            overdue_outstanding: '200.00',
            days_overdue: 45,
            next_due: '2026-07-01',
          },
        ]) // aggregates
        .mockResolvedValueOnce([{ d: '2026-06-01' }]); // last payment

      const res = await service.recomputeAccount('acc-1', actor, new Date('2026-06-16'));

      expect(res).toEqual({
        balance: 500,
        totalPaid: 100,
        arrearsOutstanding: 200,
        daysOverdue: 45,
        riskCategory: 'd31_60',
        nextDue: '2026-07-01',
        lastPaymentDate: '2026-06-01',
      });

      const arrearsCall = tx.$executeRawUnsafe.mock.calls.find((c) =>
        String(c[0]).includes('INSERT INTO fin.arrears'),
      );
      expect(arrearsCall![4]).toBe('d31_60');

      const balCall = tx.$executeRawUnsafe.mock.calls.find((c) =>
        String(c[0]).includes('UPDATE fin.account SET balance'),
      );
      expect(balCall![1]).toBe(500);
    });

    it('reports current (no arrears) when nothing is overdue', async () => {
      tx.$queryRawUnsafe
        .mockResolvedValueOnce([{ account_id: 'acc-1' }])
        .mockResolvedValueOnce([
          {
            outstanding: '1000.00',
            total_paid: '0',
            overdue_outstanding: '0',
            days_overdue: null,
            next_due: '2026-09-01',
          },
        ])
        .mockResolvedValueOnce([{ d: null }]);

      const res = await service.recomputeAccount('acc-1', actor);
      expect(res.daysOverdue).toBe(0);
      expect(res.riskCategory).toBe('current');
      expect(res.lastPaymentDate).toBeNull();
    });

    it('throws NotFound for an unknown account', async () => {
      tx.$queryRawUnsafe.mockResolvedValueOnce([]);
      await expect(
        service.recomputeAccount('missing', actor),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reconciliationReport (FIN-LED-004)', () => {
    it('returns discrepancies and unresolved suspense', async () => {
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([
          { account_id: 'acc-9', ledger_paid: '100.00', invoice_paid: '90.00' },
        ])
        .mockResolvedValueOnce([
          { suspense_id: 'sus-1', platform_txn_id: 'TX-7', amount: '50.00', currency: 'USD' },
        ]);

      const res = await service.reconciliationReport();

      expect(res.discrepancies).toEqual([
        { accountId: 'acc-9', ledgerPaid: '100.00', invoicePaid: '90.00' },
      ]);
      expect(res.unresolvedSuspense).toHaveLength(1);
      expect(res.suspenseTotal).toBe(50);
    });
  });
});
