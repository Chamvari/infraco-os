import { BadRequestException, ConflictException } from '@nestjs/common';
import { LeaseService } from './lease.service';
import { PrismaService } from '../../prisma.service';
import { AccountService } from '../account/account.service';
import { PaymentsService } from '../payments/payments.service';
import { LedgerService } from '../financial/ledger.service';

/**
 * Unit tests for LeaseService (LEASE-001/003, FIN-RENT-001/002/003).
 * Prisma, AccountService, PaymentsService and LedgerService are mocked;
 * withActor() runs its callback with a fake tx so we can assert the SQL/params,
 * the lifecycle rules, and the rent → Module H → recompute flow — without a DB.
 */
describe('LeaseService', () => {
  let service: LeaseService;
  let tx: { $queryRawUnsafe: jest.Mock; $executeRawUnsafe: jest.Mock };
  let prisma: { $queryRawUnsafe: jest.Mock; withActor: jest.Mock };
  let accounts: { createAccount: jest.Mock };
  let payments: { createBill: jest.Mock };
  let ledger: { recomputeAccount: jest.Mock; getAccountLedger: jest.Mock };

  const actor = { actorId: 'user-1', actorRole: 'operations' };

  beforeEach(() => {
    tx = { $queryRawUnsafe: jest.fn(), $executeRawUnsafe: jest.fn() };
    prisma = {
      $queryRawUnsafe: jest.fn(),
      withActor: jest.fn(
        (_a: string, _r: string, fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    };
    accounts = {
      createAccount: jest
        .fn()
        .mockResolvedValue({ accountId: 'acc-new', reference: 'RNT-X' }),
    };
    payments = { createBill: jest.fn().mockResolvedValue({ billRef: 'x' }) };
    ledger = {
      recomputeAccount: jest.fn().mockResolvedValue({}),
      getAccountLedger: jest.fn().mockResolvedValue([]),
    };
    service = new LeaseService(
      prisma as unknown as PrismaService,
      accounts as unknown as AccountService,
      payments as unknown as PaymentsService,
      ledger as unknown as LedgerService,
    );
  });

  describe('createLease', () => {
    const base = () => ({
      premisesId: 'prem-1',
      tenantId: 'ten-1',
      startDate: '2026-01-01',
      endDate: '2027-01-01',
      rentAmount: 1000,
      ...actor,
    });

    it('inserts a draft lease through withActor', async () => {
      tx.$queryRawUnsafe.mockResolvedValue([{ lease_id: 'lease-1', status: 'draft' }]);
      const res = await service.createLease(base());
      expect(res).toEqual({ leaseId: 'lease-1', status: 'draft' });
      expect(prisma.withActor).toHaveBeenCalledWith(
        'user-1',
        'operations',
        expect.any(Function),
      );
      const sql = tx.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toMatch(/INSERT INTO lease\.lease/);
      expect(sql).toMatch(/'draft'/);
    });

    it('rejects endDate <= startDate', async () => {
      await expect(
        service.createLease({ ...base(), endDate: '2025-12-31' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.withActor).not.toHaveBeenCalled();
    });

    it('rejects an invalid currency', async () => {
      await expect(
        service.createLease({ ...base(), currency: 'XXX' as never }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('transitionLease', () => {
    const leaseRow = (over: Record<string, unknown> = {}) => [
      {
        lease_id: 'lease-1',
        status: 'signed',
        tenant_id: 'ten-1',
        account_id: null,
        start_date: '2026-01-01',
        currency: 'USD',
        escalation_pct: '10',
        escalation_anniv: null,
        ...over,
      },
    ];

    it('rejects an illegal lifecycle jump (draft → expired)', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce(leaseRow({ status: 'draft' }));
      await expect(
        service.transitionLease('lease-1', { toStatus: 'expired', ...actor }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('provisions a rental account and sets the escalation anniversary on activation', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce(leaseRow({ status: 'signed' }));
      const res = await service.transitionLease('lease-1', {
        toStatus: 'active',
        ...actor,
      });
      expect(accounts.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'ten-1', accountType: 'rental' }),
      );
      expect(res).toEqual({
        leaseId: 'lease-1',
        status: 'active',
        accountId: 'acc-new',
      });
      // anniversary defaulted to start + 1y
      const params = tx.$executeRawUnsafe.mock.calls[0];
      expect(params).toContain('2027-01-01');
      expect(params).toContain('acc-new');
    });

    it('maps the uq_active_lease violation to a Conflict', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce(
        leaseRow({ status: 'signed', account_id: 'acc-1', escalation_pct: null }),
      );
      prisma.withActor.mockRejectedValueOnce({
        meta: { message: 'duplicate key value violates unique constraint "uq_active_lease"' },
      });
      await expect(
        service.transitionLease('lease-1', { toStatus: 'active', ...actor }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not re-provision an account when one already exists', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce(
        leaseRow({ status: 'signed', account_id: 'acc-existing', escalation_pct: null }),
      );
      const res = await service.transitionLease('lease-1', {
        toStatus: 'active',
        ...actor,
      });
      expect(accounts.createAccount).not.toHaveBeenCalled();
      expect(res.accountId).toBe('acc-existing');
    });
  });

  describe('runRentBilling', () => {
    it('bills each active lease, links the bill, and recomputes (FIN-RENT-001/002)', async () => {
      // One active lease, escalation already in effect (10% from 2026-01-01).
      prisma.$queryRawUnsafe.mockResolvedValueOnce([
        {
          lease_id: 'lease-abcdef12',
          account_id: 'acc-1',
          tenant_id: 'ten-1',
          rent_amount: '1000',
          currency: 'USD',
          escalation_pct: '10',
          escalation_anniv: '2026-01-01',
        },
      ]);
      // The INSERT ... RETURNING inside withActor returns a new invoice id.
      tx.$queryRawUnsafe.mockResolvedValueOnce([{ invoice_id: 'inv-1' }]);

      const res = await service.runRentBilling({ asOf: '2026-06-15', ...actor });

      expect(res.count).toBe(1);
      expect(res.period).toBe('202606');
      expect(res.raised[0]).toEqual({
        leaseId: 'lease-abcdef12',
        invoiceId: 'inv-1',
        reference: 'RENT-lease-ab-202606',
        amount: 1100, // 1000 * 1.10 (one escalation in effect)
      });
      expect(payments.createBill).toHaveBeenCalledWith('inv-1', 'user-1');
      expect(ledger.recomputeAccount).toHaveBeenCalledWith(
        'acc-1',
        actor,
        expect.any(Date),
      );
    });

    it('skips a lease already billed for the period (idempotent)', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([
        {
          lease_id: 'lease-abcdef12',
          account_id: 'acc-1',
          tenant_id: 'ten-1',
          rent_amount: '1000',
          currency: 'USD',
          escalation_pct: null,
          escalation_anniv: null,
        },
      ]);
      // ON CONFLICT DO NOTHING → no rows returned.
      tx.$queryRawUnsafe.mockResolvedValueOnce([]);

      const res = await service.runRentBilling({ asOf: '2026-06-15', ...actor });
      expect(res.count).toBe(0);
      expect(res.skipped).toBe(1);
      expect(payments.createBill).not.toHaveBeenCalled();
    });
  });

  describe('addUtilityCharge', () => {
    it('raises a separate utility invoice and bills it (FIN-RENT-003)', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([
        {
          lease_id: 'lease-abcdef12',
          status: 'active',
          tenant_id: 'ten-1',
          account_id: 'acc-1',
          start_date: '2026-01-01',
          currency: 'USD',
          escalation_pct: null,
          escalation_anniv: null,
        },
      ]);
      tx.$queryRawUnsafe.mockResolvedValueOnce([{ invoice_id: 'inv-utl' }]);

      const res = await service.addUtilityCharge('lease-abcdef12', {
        utilityType: 'water',
        amount: 25,
        ...actor,
        asOf: '2026-06-15',
      });
      expect(res.mode).toBe('separate');
      expect(res.amount).toBe(25);
      expect(payments.createBill).toHaveBeenCalledWith('inv-utl', 'user-1');
      expect(ledger.recomputeAccount).toHaveBeenCalled();
    });

    it('rejects an invalid utility type', async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([
        {
          lease_id: 'lease-1',
          status: 'active',
          tenant_id: 'ten-1',
          account_id: 'acc-1',
          start_date: '2026-01-01',
          currency: 'USD',
          escalation_pct: null,
          escalation_anniv: null,
        },
      ]);
      await expect(
        service.addUtilityCharge('lease-1', {
          utilityType: 'gas' as never,
          amount: 10,
          ...actor,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getRentRoll', () => {
    it('reports a mixed portfolio: current, overdue, and vacant (LEASE-INV-003)', async () => {
      // First query → active leases (one current, one overdue).
      prisma.$queryRawUnsafe.mockResolvedValueOnce([
        {
          premises_id: 'prem-1',
          premises: 'Suite A',
          lease_id: 'lease-cur',
          tenant: 'Ada Paid',
          monthly_rent: '1000',
          currency: 'USD',
          last_invoice_date: '2026-06-01',
          billed_this_month: '1000',
          collected: '1000',
          arrears_total: '0',
          days_overdue: '0',
        },
        {
          premises_id: 'prem-2',
          premises: 'Suite B',
          lease_id: 'lease-od',
          tenant: 'Ben Owing',
          monthly_rent: '1200',
          currency: 'USD',
          last_invoice_date: '2026-06-01',
          billed_this_month: '1200',
          collected: '0',
          arrears_total: '2400',
          days_overdue: '95',
        },
      ]);
      // Second query → vacant premises (no active lease).
      prisma.$queryRawUnsafe.mockResolvedValueOnce([
        { premises_id: 'prem-3', premises: 'Suite C' },
      ]);

      const res = await service.getRentRoll('2026-06-16');

      expect(res.period).toBe('202606');
      expect(res.rows).toHaveLength(3);

      const current = res.rows.find((r) => r.leaseId === 'lease-cur');
      expect(current).toMatchObject({
        vacant: false,
        arrearsTotal: 0,
        daysOverdue: 0,
        riskCategory: 'current',
        collected: 1000,
      });

      const overdue = res.rows.find((r) => r.leaseId === 'lease-od');
      expect(overdue).toMatchObject({
        vacant: false,
        arrearsTotal: 2400,
        daysOverdue: 95,
        riskCategory: 'd90_plus', // colour-codes red in the UI
      });

      const vacant = res.rows.find((r) => r.premisesId === 'prem-3');
      expect(vacant).toMatchObject({
        vacant: true,
        leaseId: null,
        tenant: null,
        monthlyRent: null,
        riskCategory: 'current',
      });

      expect(res.summary).toEqual({
        occupied: 2,
        vacant: 1,
        totalBilledThisMonth: 2200,
        totalCollected: 1000,
        totalArrears: 2400,
      });
    });
  });
});
