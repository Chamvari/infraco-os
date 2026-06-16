/**
 * Allowed enum values mirrored from db/infraco_os_schema.sql (Section 2).
 * The database is the source of truth; these arrays let the API validate input
 * before it reaches Postgres and give us literal string-union types.
 */

// fin.customer_type
export const CUSTOMER_TYPES = [
  'residential_buyer',
  'agro_buyer',
  'tenant',
  'contractor',
  'other',
] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

// fin.kyc_status
export const KYC_STATUSES = ['pending', 'submitted', 'verified', 'rejected'] as const;
export type KycStatus = (typeof KYC_STATUSES)[number];

// fin.account_type  (FIN-CUST-002: stand / agro / rental / utility)
export const ACCOUNT_TYPES = [
  'stand_purchase',
  'agro_purchase',
  'rental',
  'utility',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

// fin.account_status
export const ACCOUNT_STATUSES = ['active', 'settled', 'suspended', 'closed'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

// fin.currency_code
export const CURRENCY_CODES = ['USD', 'ZIG', 'GBP', 'ZAR', 'EUR', 'AUD'] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

// sales.plot_status
export const PLOT_STATUSES = [
  'available',
  'reserved',
  'sold',
  'transferred',
  'withheld',
] as const;
export type PlotStatus = (typeof PLOT_STATUSES)[number];

// fin.invoice_type
export const INVOICE_TYPES = [
  'instalment',
  'rent',
  'solar',
  'water',
  'fibre',
  'penalty',
  'other',
] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];

// util.utility_type — billable utility services (FIN-RENT-003 / FIN-UTIL)
export const UTILITY_TYPES = ['solar', 'water', 'fibre'] as const;
export type UtilityType = (typeof UTILITY_TYPES)[number];

// lease.lease_status — lease lifecycle (LEASE-003: Draft → Signed → Active → Renewal → Exit)
export const LEASE_STATUSES = [
  'draft',
  'signed',
  'active',
  'renewal',
  'expired',
  'terminated',
] as const;
export type LeaseStatus = (typeof LEASE_STATUSES)[number];
