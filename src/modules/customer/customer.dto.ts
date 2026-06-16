import { CustomerType, KycStatus } from '../../common/enums';

/**
 * Request shapes for the Customer registry (SRS §4.1, FIN-CUST-001..004).
 *
 * actorId / actorRole identify WHO is performing the write. In production these
 * come from the authenticated principal (a Module Z auth guard); the Phase 1
 * scaffold passes them in the request body, matching the existing modules.
 */
export interface Actor {
  actorId: string;
  actorRole: string;
}

export interface CreateCustomerDto extends Actor {
  customerType: CustomerType;
  firstName: string;
  lastName: string;
  idNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  country?: string;
  /** Payments Platform wallet id placeholder (PAY-API-007 / FIN-CUST-001). */
  walletId?: string;
  kycStatus?: KycStatus;
  /** Data Protection Act lawful-basis consent (FIN-CUST-003). */
  dpaConsent?: boolean;
}

export interface UpdateCustomerDto extends Actor {
  customerType?: CustomerType;
  firstName?: string;
  lastName?: string;
  idNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
  country?: string;
  walletId?: string;
  kycStatus?: KycStatus;
  dpaConsent?: boolean;
}

export interface LinkWalletDto extends Actor {
  walletId: string;
}

/** A possible duplicate surfaced at point of capture (FIN-CUST-004). */
export interface DuplicateMatch {
  customerId: string;
  fullName: string;
  idNumber: string | null;
  phone: string | null;
  matchedOn: Array<'id_number' | 'phone' | 'name'>;
  nameSimilarity: number | null;
}
