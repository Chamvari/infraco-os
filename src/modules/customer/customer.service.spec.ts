import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { PrismaService } from '../../prisma.service';
import { CreateCustomerDto } from './customer.dto';

/**
 * Unit tests for CustomerService (FIN-CUST-001..004).
 *
 * PrismaService is mocked: withActor() invokes its callback with a fake tx so we
 * can assert (a) the right SQL/params are issued, (b) every write goes through
 * withActor() with the actor (PLAT-AUDIT-001), and (c) validation rules hold —
 * all without a database.
 */
describe('CustomerService', () => {
  let service: CustomerService;
  let tx: { $queryRawUnsafe: jest.Mock; $executeRawUnsafe: jest.Mock };
  let prisma: {
    $queryRawUnsafe: jest.Mock;
    withActor: jest.Mock;
  };

  const actor = { actorId: 'user-1', actorRole: 'finance' };

  const baseDto = (over: Partial<CreateCustomerDto> = {}): CreateCustomerDto => ({
    customerType: 'residential_buyer',
    firstName: 'Tendai',
    lastName: 'Moyo',
    ...actor,
    ...over,
  });

  beforeEach(() => {
    tx = { $queryRawUnsafe: jest.fn(), $executeRawUnsafe: jest.fn() };
    prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]), // detectDuplicates: none by default
      withActor: jest.fn(
        (
          _actorId: string,
          _actorRole: string,
          fn: (t: typeof tx) => Promise<unknown>,
        ) => fn(tx),
      ),
    };
    service = new CustomerService(prisma as unknown as PrismaService);
  });

  describe('createCustomer', () => {
    it('inserts the customer through withActor and returns the new id', async () => {
      tx.$queryRawUnsafe.mockResolvedValue([{ customer_id: 'cust-1' }]);

      const res = await service.createCustomer(baseDto({ dpaConsent: true }));

      expect(res.customerId).toBe('cust-1');
      expect(res.duplicateWarnings).toEqual([]);

      // Audit actor wiring: write went through withActor with the actor.
      expect(prisma.withActor).toHaveBeenCalledWith(
        'user-1',
        'finance',
        expect.any(Function),
      );

      // The INSERT carried the right columns/params.
      const [sql, ...params] = tx.$queryRawUnsafe.mock.calls[0];
      expect(sql).toContain('INSERT INTO fin.customer');
      expect(params[0]).toBe('residential_buyer'); // customer_type
      expect(params[1]).toBe('Tendai'); // first_name
      expect(params[2]).toBe('Moyo'); // last_name
      expect(params[9]).toBe('pending'); // kyc default
      expect(params[10]).toBe(true); // dpa_consent
      expect(typeof params[11]).toBe('string'); // dpa_consent_at stamped (FIN-CUST-003)
      expect(params[12]).toBe('user-1'); // created_by = actor
    });

    it('does not stamp consent time when DPA consent is false', async () => {
      tx.$queryRawUnsafe.mockResolvedValue([{ customer_id: 'cust-2' }]);

      await service.createCustomer(baseDto({ dpaConsent: false }));

      const params = tx.$queryRawUnsafe.mock.calls[0].slice(1);
      expect(params[10]).toBe(false); // dpa_consent
      expect(params[11]).toBeNull(); // dpa_consent_at not set
    });

    it('surfaces likely duplicates as non-blocking warnings (FIN-CUST-004)', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([
        {
          customer_id: 'dup-1',
          full_name: 'Tendai Moyo',
          id_number: '63-123456A00',
          phone: null,
          name_sim: 0.9,
          id_match: true,
          phone_match: false,
        },
      ]);
      tx.$queryRawUnsafe.mockResolvedValue([{ customer_id: 'cust-3' }]);

      const res = await service.createCustomer(
        baseDto({ idNumber: '63-123456A00' }),
      );

      expect(res.customerId).toBe('cust-3'); // still created (warn, not block)
      expect(res.duplicateWarnings).toHaveLength(1);
      expect(res.duplicateWarnings[0]).toMatchObject({
        customerId: 'dup-1',
        matchedOn: ['id_number'],
        nameSimilarity: 0.9,
      });
    });

    it('rejects an invalid customer type without touching the DB', async () => {
      await expect(
        service.createCustomer(
          baseDto({ customerType: 'banker' as unknown as CreateCustomerDto['customerType'] }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.withActor).not.toHaveBeenCalled();
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('requires first and last name', async () => {
      await expect(
        service.createCustomer(baseDto({ firstName: '  ' })),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateCustomer', () => {
    it('builds a dynamic UPDATE for KYC status and DPA consent', async () => {
      tx.$queryRawUnsafe.mockResolvedValue([{ customer_id: 'cust-1' }]);

      const res = await service.updateCustomer('cust-1', {
        kycStatus: 'verified',
        dpaConsent: true,
        ...actor,
      });

      expect(res.customerId).toBe('cust-1');
      expect(prisma.withActor).toHaveBeenCalledWith(
        'user-1',
        'finance',
        expect.any(Function),
      );
      const [sql] = tx.$queryRawUnsafe.mock.calls[0];
      expect(sql).toContain('UPDATE fin.customer SET');
      expect(sql).toContain('kyc_status = $1::fin.kyc_status');
      expect(sql).toContain('dpa_consent');
      expect(sql).toContain('dpa_consent_at');
    });

    it('throws NotFound when the customer does not exist', async () => {
      tx.$queryRawUnsafe.mockResolvedValue([]);
      await expect(
        service.updateCustomer('missing', { phone: '+263772000000', ...actor }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an empty update', async () => {
      await expect(
        service.updateCustomer('cust-1', { ...actor }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.withActor).not.toHaveBeenCalled();
    });

    it('rejects an invalid KYC status', async () => {
      await expect(
        service.updateCustomer('cust-1', {
          kycStatus: 'approved' as unknown as 'verified',
          ...actor,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('linkWallet', () => {
    it('sets the wallet id through withActor', async () => {
      tx.$queryRawUnsafe.mockResolvedValue([
        { customer_id: 'cust-1', wallet_id: 'wallet-xyz' },
      ]);

      const res = await service.linkWallet('cust-1', {
        walletId: 'wallet-xyz',
        ...actor,
      });

      expect(res).toEqual({ customerId: 'cust-1', walletId: 'wallet-xyz' });
      expect(prisma.withActor).toHaveBeenCalledWith(
        'user-1',
        'finance',
        expect.any(Function),
      );
    });

    it('throws NotFound for an unknown customer', async () => {
      tx.$queryRawUnsafe.mockResolvedValue([]);
      await expect(
        service.linkWallet('missing', { walletId: 'w', ...actor }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an empty wallet id', async () => {
      await expect(
        service.linkWallet('cust-1', { walletId: '', ...actor }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.withActor).not.toHaveBeenCalled();
    });
  });
});
