import { CustomerType } from '../../common/enums';

/**
 * Request shapes for the Onboarding workflow (SRS §4.1a, ONB-001..008).
 * actorId / actorRole identify who is performing the write (Phase 1 scaffold
 * passes them in the body, matching the other modules).
 */
export interface Actor {
  actorId: string;
  actorRole: string;
}

/** Standard onboarding document types (ONB-002). Free-text is allowed too. */
export const ONBOARDING_DOC_TYPES = [
  'id_passport',
  'proof_of_address',
  'company_registration',
  'tax_clearance',
] as const;
export type OnboardingDocType = (typeof ONBOARDING_DOC_TYPES)[number];

/**
 * ONB-001 — guided party onboarding. Captures identity, contacts, address,
 * country (diaspora), and DPA consent; KYC starts at 'pending'.
 * For customerType 'contractor', the contractor.* fields feed dev.contractor
 * (ONB-007).
 */
export interface OnboardPartyDto extends Actor {
  customerType: CustomerType;
  firstName: string;
  lastName: string;
  /** ID/passport number, or company registration for an entity/contractor. */
  idNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  /** Country of residence — set for diaspora buyers (ONB-008). */
  country?: string;
  dpaConsent?: boolean;
  /** Optional Payments Platform wallet to link immediately (ONB-003). */
  walletId?: string;

  // -- Contractor extras (ONB-007), used only when customerType==='contractor'
  contractor?: {
    regNumber?: string;
    taxClearance?: string;
    category?: string;
    prequalified?: boolean;
  };
}

/** ONB-002 — attach an uploaded document to a party record. */
export interface AttachDocumentDto extends Actor {
  docType: OnboardingDocType | string;
  /** Object-store key returned by the upload step. */
  storageRef: string;
  accessTag?: string;
}

/** ONB-004 — KYC review decision by a staff role. */
export interface KycReviewDto extends Actor {
  decision: 'verified' | 'rejected';
  /** Required when rejecting; recorded for audit (ONB-004). */
  reason?: string;
}

/** ONB-003 — optional wallet link/create on completion. */
export interface LinkWalletDto extends Actor {
  walletId: string;
}
