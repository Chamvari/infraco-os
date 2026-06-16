import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  CUSTOMER_TYPES,
  KYC_STATUSES,
  CustomerType,
  KycStatus,
} from '../../common/enums';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  LinkWalletDto,
  DuplicateMatch,
} from './customer.dto';

/**
 * CustomerService — Module A, Customer & Account Registry (SRS §4.1).
 *
 *   FIN-CUST-001  unique customer linked to identity, contact, KYC, wallet id
 *   FIN-CUST-002  multiple accounts per customer (see AccountService)
 *   FIN-CUST-003  Data Protection Act: lawful basis (consent) captured + timestamped
 *   FIN-CUST-004  duplicate-customer warning at point of capture (name + id/phone)
 *
 * Every write runs inside prisma.withActor() so the generic audit trigger
 * (core.capture_audit / PLAT-AUDIT-001) records the actor. We use raw SQL — as
 * the other modules do — because the fin enums and triggers live in the DB.
 */
@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a customer. Runs a non-blocking duplicate check first (FIN-CUST-004)
   * and returns any likely matches as warnings alongside the new id.
   */
  async createCustomer(
    dto: CreateCustomerDto,
  ): Promise<{ customerId: string; duplicateWarnings: DuplicateMatch[] }> {
    this.assertCustomerType(dto.customerType);
    this.requireNonEmpty('firstName', dto.firstName);
    this.requireNonEmpty('lastName', dto.lastName);
    if (dto.kycStatus) this.assertKycStatus(dto.kycStatus);

    const fullName = `${dto.firstName} ${dto.lastName}`;
    const duplicateWarnings = await this.detectDuplicates(
      fullName,
      dto.idNumber ?? null,
      dto.phone ?? null,
    );

    const kyc: KycStatus = dto.kycStatus ?? 'pending';
    const dpaConsent = dto.dpaConsent ?? false;
    // FIN-CUST-003: stamp WHEN consent was given so lawful basis is auditable.
    const dpaConsentAt = dpaConsent ? new Date().toISOString() : null;
    const createdBy = dto.actorId ? dto.actorId : null;

    const customerId = await this.prisma.withActor(
      dto.actorId,
      dto.actorRole,
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<{ customer_id: string }[]>(
          `INSERT INTO fin.customer
             (customer_type, first_name, last_name, id_number, phone, email,
              address, country, wallet_id, kyc_status, dpa_consent, dpa_consent_at, created_by)
           VALUES ($1::fin.customer_type, $2, $3, $4, $5, $6,
                   $7, $8, $9, $10::fin.kyc_status, $11, $12::timestamptz, $13::uuid)
           RETURNING customer_id`,
          dto.customerType,
          dto.firstName,
          dto.lastName,
          dto.idNumber ?? null,
          dto.phone ?? null,
          dto.email ?? null,
          dto.address ?? null,
          dto.country ?? null,
          dto.walletId ?? null,
          kyc,
          dpaConsent,
          dpaConsentAt,
          createdBy,
        );
        return rows[0].customer_id;
      },
    );

    return { customerId, duplicateWarnings };
  }

  /** Update mutable customer fields, including KYC status and DPA consent. */
  async updateCustomer(
    customerId: string,
    dto: UpdateCustomerDto,
  ): Promise<{ customerId: string }> {
    if (dto.customerType) this.assertCustomerType(dto.customerType);
    if (dto.kycStatus) this.assertKycStatus(dto.kycStatus);

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    const push = (col: string, val: unknown, cast = ''): void => {
      sets.push(`${col} = $${i}${cast}`);
      vals.push(val);
      i += 1;
    };

    if (dto.customerType !== undefined)
      push('customer_type', dto.customerType, '::fin.customer_type');
    if (dto.firstName !== undefined) {
      this.requireNonEmpty('firstName', dto.firstName);
      push('first_name', dto.firstName);
    }
    if (dto.lastName !== undefined) {
      this.requireNonEmpty('lastName', dto.lastName);
      push('last_name', dto.lastName);
    }
    if (dto.idNumber !== undefined) push('id_number', dto.idNumber);
    if (dto.phone !== undefined) push('phone', dto.phone);
    if (dto.email !== undefined) push('email', dto.email);
    if (dto.address !== undefined) push('address', dto.address);
    if (dto.country !== undefined) push('country', dto.country);
    if (dto.walletId !== undefined) push('wallet_id', dto.walletId);
    if (dto.kycStatus !== undefined)
      push('kyc_status', dto.kycStatus, '::fin.kyc_status');
    if (dto.dpaConsent !== undefined) {
      push('dpa_consent', dto.dpaConsent);
      // Re-stamp consent time on grant; clear it on withdrawal (FIN-CUST-003).
      push('dpa_consent_at', dto.dpaConsent ? new Date().toISOString() : null, '::timestamptz');
    }

    if (sets.length === 0) {
      throw new BadRequestException('No updatable fields supplied.');
    }

    const idParam = i;
    vals.push(customerId);
    const sql = `UPDATE fin.customer SET ${sets.join(', ')}
                 WHERE customer_id = $${idParam}::uuid
                 RETURNING customer_id`;

    return this.prisma.withActor(dto.actorId, dto.actorRole, async (tx) => {
      const rows = await tx.$queryRawUnsafe<{ customer_id: string }[]>(
        sql,
        ...vals,
      );
      if (rows.length === 0) {
        throw new NotFoundException(`Customer ${customerId} not found.`);
      }
      return { customerId: rows[0].customer_id };
    });
  }

  /**
   * Link (or replace) the Payments Platform wallet id on a customer.
   * Placeholder until Module H performs the real POST /wallets/link (PAY-API-007).
   */
  async linkWallet(
    customerId: string,
    dto: LinkWalletDto,
  ): Promise<{ customerId: string; walletId: string }> {
    this.requireNonEmpty('walletId', dto.walletId);

    return this.prisma.withActor(dto.actorId, dto.actorRole, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        { customer_id: string; wallet_id: string }[]
      >(
        `UPDATE fin.customer SET wallet_id = $1
         WHERE customer_id = $2::uuid
         RETURNING customer_id, wallet_id`,
        dto.walletId,
        customerId,
      );
      if (rows.length === 0) {
        throw new NotFoundException(`Customer ${customerId} not found.`);
      }
      return { customerId: rows[0].customer_id, walletId: rows[0].wallet_id };
    });
  }

  /**
   * FIN-CUST-004 — warn on likely duplicates by exact id_number / phone match
   * or trigram name similarity (uses idx_customer_name_trgm). Read-only.
   */
  async detectDuplicates(
    fullName: string,
    idNumber: string | null,
    phone: string | null,
  ): Promise<DuplicateMatch[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      {
        customer_id: string;
        full_name: string;
        id_number: string | null;
        phone: string | null;
        name_sim: number | null;
        id_match: boolean;
        phone_match: boolean;
      }[]
    >(
      `SELECT customer_id,
              first_name || ' ' || last_name AS full_name,
              id_number,
              phone,
              similarity(first_name || ' ' || last_name, $1) AS name_sim,
              ($2 IS NOT NULL AND id_number = $2) AS id_match,
              ($3 IS NOT NULL AND phone = $3)     AS phone_match
         FROM fin.customer
        WHERE ($2 IS NOT NULL AND id_number = $2)
           OR ($3 IS NOT NULL AND phone = $3)
           OR (first_name || ' ' || last_name) % $1
        ORDER BY name_sim DESC NULLS LAST
        LIMIT 10`,
      fullName,
      idNumber,
      phone,
    );

    return rows.map((r) => {
      const matchedOn: DuplicateMatch['matchedOn'] = [];
      if (r.id_match) matchedOn.push('id_number');
      if (r.phone_match) matchedOn.push('phone');
      if (!r.id_match && !r.phone_match) matchedOn.push('name');
      return {
        customerId: r.customer_id,
        fullName: r.full_name,
        idNumber: r.id_number,
        phone: r.phone,
        matchedOn,
        nameSimilarity: r.name_sim === null ? null : Number(r.name_sim),
      };
    });
  }

  // -- validation helpers -----------------------------------------------------

  private assertCustomerType(value: string): asserts value is CustomerType {
    if (!CUSTOMER_TYPES.includes(value as CustomerType)) {
      throw new BadRequestException(
        `Invalid customerType '${value}'. Allowed: ${CUSTOMER_TYPES.join(', ')}.`,
      );
    }
  }

  private assertKycStatus(value: string): asserts value is KycStatus {
    if (!KYC_STATUSES.includes(value as KycStatus)) {
      throw new BadRequestException(
        `Invalid kycStatus '${value}'. Allowed: ${KYC_STATUSES.join(', ')}.`,
      );
    }
  }

  private requireNonEmpty(field: string, value: string): void {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new BadRequestException(`${field} is required.`);
    }
  }
}
