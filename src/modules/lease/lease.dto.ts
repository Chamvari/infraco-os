import { CurrencyCode, LeaseStatus, RentalUtilityType } from '../../common/enums';
import { Actor } from '../customer/customer.dto';

/**
 * Request shapes for Module C — Leasing & Tenancy (SRS §6, LEASE-001..005,
 * FIN-RENT-001..004).
 *
 * actorId / actorRole identify WHO performs the write (audit trail, PLAT-AUDIT-
 * 001). In production these come from a Module Z auth guard; the Phase 1
 * scaffold passes them in the request body, matching the existing modules.
 */

/** Create a leasable unit (office, hospitality, business space). */
export interface CreatePremisesDto extends Actor {
  name: string;
  developmentId?: string;
  description?: string;
  areaSqm?: number;
}

/**
 * Digitise / create a lease (LEASE-001). Created in 'draft'; activated via the
 * transition endpoint, which provisions the rental account and starts billing.
 */
export interface CreateLeaseDto extends Actor {
  premisesId: string;
  tenantId: string;
  /** Existing rental account to bill against. Auto-created on activation if omitted. */
  accountId?: string;
  startDate: string; // ISO date
  endDate: string; // ISO date
  rentAmount: number;
  currency?: CurrencyCode;
  /** Annual escalation percentage (FIN-RENT-002). */
  escalationPct?: number;
  /** Date the first escalation applies. Defaults to startDate + 1y on activation. */
  escalationAnniv?: string; // ISO date
  deposit?: number;
  /** LEASE-005 market-rate benchmark to flag under-rented premises. */
  marketRate?: number;
}

/** Move a lease through its lifecycle (LEASE-003). */
export interface TransitionLeaseDto extends Actor {
  toStatus: LeaseStatus;
}

/** Run the monthly rent billing for all active leases (FIN-RENT-001). */
export interface RentRunDto extends Actor {
  /** Bill the month containing this date; defaults to today. */
  asOf?: string;
}

/**
 * Add a utility charge for a tenant (FIN-RENT-003). By default raised as a
 * SEPARATE utility invoice; set separate=false to fold it into the current
 * month's rent invoice instead.
 */
export interface UtilityChargeDto extends Actor {
  utilityType: RentalUtilityType;
  amount: number;
  separate?: boolean; // default true
  asOf?: string;
  description?: string;
}

/** Renewal-alert sweep (LEASE-004). */
export interface RenewalAlertDto extends Actor {
  asOf?: string;
  /** Notice windows in days before expiry. Defaults to [90, 30]. */
  noticeDays?: number[];
}
