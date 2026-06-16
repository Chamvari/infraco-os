import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CustomerService } from '../customer/customer.service';
import { KycStatus } from '../../common/enums';
import {
  AttachDocumentDto,
  KycReviewDto,
  LinkWalletDto,
  OnboardPartyDto,
} from './onboarding.dto';
import { DuplicateMatch } from '../customer/customer.dto';

/**
 * OnboardingService — the "front door" guided workflow (SRS §4.1a, ONB-001..008).
 *
 *   ONB-001  guided party capture → fin.customer (KYC 'pending')
 *   ONB-002  document upload → core.document against the party
 *   ONB-003  optional Payments Platform wallet link (delegates to Customer/Module H)
 *   ONB-004  reviewable KYC step: staff moves pending → verified | rejected, with reason
 *   ONB-005/006  the same fin.customer is reused by Sales (reservation/sale) and
 *                Lease (Module C) — no re-keying; nothing extra needed here
 *   ONB-007  contractor onboarding also feeds dev.contractor (procurement register)
 *   ONB-008  diaspora: country + online docs + wallet link, no in-person step
 *
 * Builds on CustomerService for the registry write (FIN-CUST-001..004) so the
 * duplicate check and DPA-consent stamping are reused, then layers the
 * onboarding-specific document, KYC-review, and contractor steps. Raw SQL +
 * withActor() throughout, matching the other modules.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomerService,
  ) {}

  /** ONB-001 (+ ONB-007 for contractors) — onboard a party. */
  async onboardParty(dto: OnboardPartyDto): Promise<{
    customerId: string;
    contractorId: string | null;
    kycStatus: KycStatus;
    duplicateWarnings: DuplicateMatch[];
  }> {
    // Reuse the registry write (validates type/name, runs the duplicate check,
    // stamps DPA consent). KYC always starts at 'pending' for an onboarding.
    const { customerId, duplicateWarnings } = await this.customers.createCustomer({
      actorId: dto.actorId,
      actorRole: dto.actorRole,
      customerType: dto.customerType,
      firstName: dto.firstName,
      lastName: dto.lastName,
      idNumber: dto.idNumber,
      phone: dto.phone,
      email: dto.email,
      address: dto.address,
      country: dto.country,
      walletId: dto.walletId,
      kycStatus: 'pending',
      dpaConsent: dto.dpaConsent,
    });

    // ONB-007 — a contractor party also lands in the procurement register.
    let contractorId: string | null = null;
    if (dto.customerType === 'contractor') {
      contractorId = await this.prisma.withActor(
        dto.actorId,
        dto.actorRole,
        async (tx) => {
          const rows = await tx.$queryRawUnsafe<{ contractor_id: string }[]>(
            `INSERT INTO dev.contractor
               (name, reg_number, tax_clearance, category, prequalified, customer_id)
             VALUES ($1, $2, $3, $4, $5, $6::uuid)
             RETURNING contractor_id`,
            `${dto.firstName} ${dto.lastName}`,
            dto.contractor?.regNumber ?? null,
            dto.contractor?.taxClearance ?? null,
            dto.contractor?.category ?? null,
            dto.contractor?.prequalified ?? false,
            customerId,
          );
          return rows[0].contractor_id;
        },
      );
    }

    return { customerId, contractorId, kycStatus: 'pending', duplicateWarnings };
  }

  /** ONB-002 — attach an uploaded document to the party (core.document). */
  async attachDocument(
    customerId: string,
    dto: AttachDocumentDto,
  ): Promise<{ documentId: string; docType: string; version: number }> {
    if (!dto.docType || dto.docType.trim() === '') {
      throw new BadRequestException('docType is required.');
    }
    if (!dto.storageRef || dto.storageRef.trim() === '') {
      throw new BadRequestException('storageRef is required.');
    }
    await this.assertCustomerExists(customerId);

    return this.prisma.withActor(dto.actorId, dto.actorRole, async (tx) => {
      // Next version for this (party, docType) — versioned uploads (DOC layer).
      const verRows = await tx.$queryRawUnsafe<{ next_version: number }[]>(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
           FROM core.document
          WHERE entity_schema='fin' AND entity_table='customer'
            AND entity_id=$1 AND doc_type=$2`,
        customerId,
        dto.docType,
      );
      const version = Number(verRows[0].next_version);

      const rows = await tx.$queryRawUnsafe<{ document_id: string }[]>(
        `INSERT INTO core.document
           (entity_schema, entity_table, entity_id, doc_type, version,
            storage_ref, access_tag, uploaded_by)
         VALUES ('fin','customer',$1,$2,$3,$4,$5,$6::uuid)
         RETURNING document_id`,
        customerId,
        dto.docType,
        version,
        dto.storageRef,
        dto.accessTag ?? 'internal',
        dto.actorId || null,
      );
      return { documentId: rows[0].document_id, docType: dto.docType, version };
    });
  }

  /**
   * ONB-004 — reviewable KYC step. A staff role moves the party from 'pending'
   * to 'verified' or 'rejected'. Rejection requires a reason. The status change
   * is captured by the audit trigger (actor + before/after); the reason is
   * recorded durably as a notification (there is no reason column on customer).
   */
  async reviewKyc(
    customerId: string,
    dto: KycReviewDto,
  ): Promise<{ customerId: string; kycStatus: KycStatus }> {
    if (dto.decision !== 'verified' && dto.decision !== 'rejected') {
      throw new BadRequestException(
        "decision must be 'verified' or 'rejected'.",
      );
    }
    if (dto.decision === 'rejected' && (!dto.reason || dto.reason.trim() === '')) {
      throw new BadRequestException('A reason is required to reject KYC.');
    }
    const current = await this.assertCustomerExists(customerId);
    if (current.kyc_status === 'verified' && dto.decision === 'verified') {
      return { customerId, kycStatus: 'verified' };
    }

    const next: KycStatus = dto.decision;
    return this.prisma.withActor(dto.actorId, dto.actorRole, async (tx) => {
      const rows = await tx.$queryRawUnsafe<{ customer_id: string; kyc_status: string }[]>(
        `UPDATE fin.customer SET kyc_status = $2::fin.kyc_status
          WHERE customer_id = $1::uuid
          RETURNING customer_id, kyc_status`,
        customerId,
        next,
      );
      if (rows.length === 0) {
        throw new NotFoundException(`Customer ${customerId} not found.`);
      }
      // Durable record of the decision + reason (ONB-004 "with reason").
      await tx.$executeRawUnsafe(
        `INSERT INTO core.notification
           (recipient_kind, recipient_id, channel, template_code, payload)
         VALUES ('customer', $1::uuid, 'email', 'kyc_decision', $2::jsonb)`,
        customerId,
        JSON.stringify({
          decision: next,
          reason: dto.reason ?? null,
          reviewedBy: dto.actorId || null,
        }),
      );
      return { customerId: rows[0].customer_id, kycStatus: rows[0].kyc_status as KycStatus };
    });
  }

  /** ONB-003 — optionally link a Payments Platform wallet on completion. */
  async linkWallet(customerId: string, dto: LinkWalletDto) {
    return this.customers.linkWallet(customerId, dto);
  }

  /** Onboarding status view for the guided screen / verification queue. */
  async getParty(customerId: string): Promise<{
    customerId: string;
    customerType: string;
    fullName: string;
    country: string | null;
    kycStatus: string;
    dpaConsent: boolean;
    walletId: string | null;
    contractorId: string | null;
    documents: Array<{
      documentId: string;
      docType: string;
      version: number;
      storageRef: string;
      accessTag: string;
      uploadedAt: string;
    }>;
  }> {
    const head = await this.prisma.$queryRawUnsafe<
      {
        customer_id: string;
        customer_type: string;
        full_name: string;
        country: string | null;
        kyc_status: string;
        dpa_consent: boolean;
        wallet_id: string | null;
        contractor_id: string | null;
      }[]
    >(
      `SELECT c.customer_id::text AS customer_id, c.customer_type::text AS customer_type,
              c.first_name || ' ' || c.last_name AS full_name, c.country,
              c.kyc_status::text AS kyc_status, c.dpa_consent, c.wallet_id,
              ct.contractor_id::text AS contractor_id
         FROM fin.customer c
         LEFT JOIN dev.contractor ct ON ct.customer_id = c.customer_id
        WHERE c.customer_id = $1::uuid`,
      customerId,
    );
    if (head.length === 0) {
      throw new NotFoundException(`Customer ${customerId} not found.`);
    }
    const h = head[0];

    const docs = await this.prisma.$queryRawUnsafe<
      {
        document_id: string;
        doc_type: string;
        version: number;
        storage_ref: string;
        access_tag: string;
        uploaded_at: string;
      }[]
    >(
      `SELECT document_id::text AS document_id, doc_type, version,
              storage_ref, access_tag, uploaded_at::text AS uploaded_at
         FROM core.document
        WHERE entity_schema='fin' AND entity_table='customer' AND entity_id=$1
        ORDER BY doc_type, version`,
      customerId,
    );

    return {
      customerId: h.customer_id,
      customerType: h.customer_type,
      fullName: h.full_name,
      country: h.country,
      kycStatus: h.kyc_status,
      dpaConsent: h.dpa_consent,
      walletId: h.wallet_id,
      contractorId: h.contractor_id,
      documents: docs.map((d) => ({
        documentId: d.document_id,
        docType: d.doc_type,
        version: Number(d.version),
        storageRef: d.storage_ref,
        accessTag: d.access_tag,
        uploadedAt: d.uploaded_at,
      })),
    };
  }

  // -- helpers ----------------------------------------------------------------

  private async assertCustomerExists(
    customerId: string,
  ): Promise<{ customer_id: string; kyc_status: string }> {
    const rows = await this.prisma.$queryRawUnsafe<
      { customer_id: string; kyc_status: string }[]
    >(
      `SELECT customer_id::text AS customer_id, kyc_status::text AS kyc_status
         FROM fin.customer WHERE customer_id = $1::uuid`,
      customerId,
    );
    if (rows.length === 0) {
      throw new NotFoundException(`Customer ${customerId} not found.`);
    }
    return rows[0];
  }
}
