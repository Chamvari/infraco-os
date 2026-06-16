import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  ACCOUNT_TYPES,
  ACCOUNT_STATUSES,
  CURRENCY_CODES,
  AccountType,
  AccountStatus,
  CurrencyCode,
} from '../../common/enums';
import { CreateAccountDto } from './account.dto';

/** Short prefixes for generated account references, per account type. */
const REF_PREFIX: Record<AccountType, string> = {
  stand_purchase: 'STD',
  agro_purchase: 'AGR',
  rental: 'RNT',
  utility: 'UTL',
};

/**
 * AccountService — Module A, Account registry (SRS §4.1 / FIN-CUST-002).
 *
 * Creates accounts of each type for a customer. A customer may hold many
 * accounts. Writes run inside prisma.withActor() so the audit trigger captures
 * the actor (PLAT-AUDIT-001).
 */
@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async createAccount(
    dto: CreateAccountDto,
  ): Promise<{ accountId: string; reference: string }> {
    this.assertAccountType(dto.accountType);
    if (dto.status) this.assertAccountStatus(dto.status);
    if (dto.currency) this.assertCurrency(dto.currency);
    if (!dto.customerId || dto.customerId.trim() === '') {
      throw new BadRequestException('customerId is required.');
    }

    const status: AccountStatus = dto.status ?? 'active';
    const currency: CurrencyCode = dto.currency ?? 'USD';
    const reference =
      dto.reference && dto.reference.trim() !== ''
        ? dto.reference.trim()
        : this.generateReference(dto.accountType, dto.customerId);

    try {
      return await this.prisma.withActor(
        dto.actorId,
        dto.actorRole,
        async (tx) => {
          const rows = await tx.$queryRawUnsafe<
            { account_id: string; reference: string }[]
          >(
            `INSERT INTO fin.account
               (customer_id, account_type, reference, status, currency)
             VALUES ($1::uuid, $2::fin.account_type, $3, $4::fin.account_status, $5::fin.currency_code)
             RETURNING account_id, reference`,
            dto.customerId,
            dto.accountType,
            reference,
            status,
            currency,
          );
          return { accountId: rows[0].account_id, reference: rows[0].reference };
        },
      );
    } catch (err: unknown) {
      const code = this.pgCode(err);
      const msg = this.pgMessage(err);
      // 23503 foreign_key_violation — customer_id has no matching customer.
      if (code === '23503' || msg.includes('account_customer_id_fkey')) {
        throw new NotFoundException(`Customer ${dto.customerId} not found.`);
      }
      // 23505 unique_violation — duplicate account reference.
      if (code === '23505' || msg.includes('account_reference_key')) {
        throw new ConflictException(
          `Account reference '${reference}' already exists.`,
        );
      }
      throw err;
    }
  }

  /** List a customer's accounts (read-only). */
  async listForCustomer(customerId: string): Promise<
    Array<{
      accountId: string;
      accountType: string;
      reference: string;
      status: string;
      balance: string;
      currency: string;
    }>
  > {
    const rows = await this.prisma.$queryRawUnsafe<
      {
        account_id: string;
        account_type: string;
        reference: string;
        status: string;
        balance: string;
        currency: string;
      }[]
    >(
      `SELECT account_id, account_type, reference, status, balance::text AS balance, currency
         FROM fin.account
        WHERE customer_id = $1::uuid
        ORDER BY opened_at`,
      customerId,
    );
    return rows.map((r) => ({
      accountId: r.account_id,
      accountType: r.account_type,
      reference: r.reference,
      status: r.status,
      balance: r.balance,
      currency: r.currency,
    }));
  }

  // -- helpers ----------------------------------------------------------------

  private generateReference(type: AccountType, customerId: string): string {
    const short = customerId.replace(/-/g, '').slice(0, 8).toUpperCase();
    const stamp = Date.now().toString(36).toUpperCase();
    return `${REF_PREFIX[type]}-${short}-${stamp}`;
  }

  private assertAccountType(value: string): asserts value is AccountType {
    if (!ACCOUNT_TYPES.includes(value as AccountType)) {
      throw new BadRequestException(
        `Invalid accountType '${value}'. Allowed: ${ACCOUNT_TYPES.join(', ')}.`,
      );
    }
  }

  private assertAccountStatus(value: string): asserts value is AccountStatus {
    if (!ACCOUNT_STATUSES.includes(value as AccountStatus)) {
      throw new BadRequestException(
        `Invalid status '${value}'. Allowed: ${ACCOUNT_STATUSES.join(', ')}.`,
      );
    }
  }

  private assertCurrency(value: string): asserts value is CurrencyCode {
    if (!CURRENCY_CODES.includes(value as CurrencyCode)) {
      throw new BadRequestException(
        `Invalid currency '${value}'. Allowed: ${CURRENCY_CODES.join(', ')}.`,
      );
    }
  }

  /** Pull the Postgres SQLSTATE out of a Prisma raw-query error. */
  private pgCode(err: unknown): string | undefined {
    const e = err as { code?: string; meta?: { code?: string } };
    return e?.meta?.code ?? e?.code;
  }

  private pgMessage(err: unknown): string {
    const e = err as { meta?: { message?: string }; message?: string };
    return e?.meta?.message ?? e?.message ?? String(err);
  }
}
