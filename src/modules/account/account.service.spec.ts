import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { AccountService } from './account.service';
import { PrismaService } from '../../prisma.service';
import { CreateAccountDto } from './account.dto';

/**
 * Unit tests for AccountService (FIN-CUST-002).
 * PrismaService is mocked; withActor() runs its callback with a fake tx.
 */
describe('AccountService', () => {
  let service: AccountService;
  let tx: { $queryRawUnsafe: jest.Mock };
  let prisma: { $queryRawUnsafe: jest.Mock; withActor: jest.Mock };

  const actor = { actorId: 'user-1', actorRole: 'finance' };

  const baseDto = (over: Partial<CreateAccountDto> = {}): CreateAccountDto => ({
    customerId: 'cust-1',
    accountType: 'stand_purchase',
    ...actor,
    ...over,
  });

  beforeEach(() => {
    tx = { $queryRawUnsafe: jest.fn() };
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
    service = new AccountService(prisma as unknown as PrismaService);
  });

  describe('createAccount', () => {
    it('creates an account through withActor and returns id + reference', async () => {
      tx.$queryRawUnsafe.mockResolvedValue([
        { account_id: 'acc-1', reference: 'STD-AAAA-1' },
      ]);

      const res = await service.createAccount(
        baseDto({ reference: 'STD-AAAA-1' }),
      );

      expect(res).toEqual({ accountId: 'acc-1', reference: 'STD-AAAA-1' });
      expect(prisma.withActor).toHaveBeenCalledWith(
        'user-1',
        'finance',
        expect.any(Function),
      );

      const [sql, ...params] = tx.$queryRawUnsafe.mock.calls[0];
      expect(sql).toContain('INSERT INTO fin.account');
      expect(params[0]).toBe('cust-1'); // customer_id
      expect(params[1]).toBe('stand_purchase'); // account_type
      expect(params[2]).toBe('STD-AAAA-1'); // reference
      expect(params[3]).toBe('active'); // default status
      expect(params[4]).toBe('USD'); // default currency
    });

    it('auto-generates a typed reference when none is supplied', async () => {
      tx.$queryRawUnsafe.mockResolvedValue([
        { account_id: 'acc-2', reference: 'RNT-CUST1-X' },
      ]);

      await service.createAccount(baseDto({ accountType: 'rental' }));

      const params = tx.$queryRawUnsafe.mock.calls[0].slice(1);
      expect(params[1]).toBe('rental');
      expect(typeof params[2]).toBe('string');
      expect(params[2]).toMatch(/^RNT-/); // rental prefix
    });

    it.each(['stand_purchase', 'agro_purchase', 'rental', 'utility'] as const)(
      'accepts account type %s',
      async (accountType) => {
        tx.$queryRawUnsafe.mockResolvedValue([
          { account_id: 'acc', reference: 'R' },
        ]);
        await expect(
          service.createAccount(baseDto({ accountType })),
        ).resolves.toBeDefined();
      },
    );

    it('rejects an invalid account type without touching the DB', async () => {
      await expect(
        service.createAccount(
          baseDto({
            accountType: 'savings' as unknown as CreateAccountDto['accountType'],
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.withActor).not.toHaveBeenCalled();
    });

    it('maps a foreign-key violation to NotFound (customer missing)', async () => {
      tx.$queryRawUnsafe.mockRejectedValue({
        meta: { code: '23503', message: 'account_customer_id_fkey' },
      });
      await expect(service.createAccount(baseDto())).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('maps a unique violation to Conflict (duplicate reference)', async () => {
      tx.$queryRawUnsafe.mockRejectedValue({
        meta: { code: '23505', message: 'account_reference_key' },
      });
      await expect(
        service.createAccount(baseDto({ reference: 'DUP-1' })),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects an invalid currency', async () => {
      await expect(
        service.createAccount(
          baseDto({
            currency: 'BTC' as unknown as CreateAccountDto['currency'],
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listForCustomer', () => {
    it('maps account rows for a customer', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([
        {
          account_id: 'acc-1',
          account_type: 'utility',
          reference: 'UTL-1',
          status: 'active',
          balance: '0.00',
          currency: 'USD',
        },
      ]);

      const res = await service.listForCustomer('cust-1');

      expect(res).toEqual([
        {
          accountId: 'acc-1',
          accountType: 'utility',
          reference: 'UTL-1',
          status: 'active',
          balance: '0.00',
          currency: 'USD',
        },
      ]);
    });
  });
});
