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

// util.utility_type — full utility-service domain (meters/vending, Module D)
export const UTILITY_TYPES = ['solar', 'power', 'water', 'fibre', 'gas'] as const;
export type UtilityType = (typeof UTILITY_TYPES)[number];

// Rental-billable utilities — the subset addable to a rent invoice (FIN-RENT-003).
// Must stay within fin.invoice_type ('solar','water','fibre'); power/gas are
// prepaid-vended (Module D), never charged on a rent invoice.
export const RENTAL_UTILITY_TYPES = ['solar', 'water', 'fibre'] as const;
export type RentalUtilityType = (typeof RENTAL_UTILITY_TYPES)[number];

// Prepaid-vendable utilities (UTIL-TKN-001): token-metered services only.
export const VENDABLE_UTILITY_TYPES = ['power', 'water', 'gas'] as const;
export type VendableUtilityType = (typeof VENDABLE_UTILITY_TYPES)[number];

// util.meter_adapter — pluggable token-vending backends (UTIL-TKN-003)
export const METER_ADAPTERS = ['sts', 'vendor_api', 'mock'] as const;
export type MeterAdapter = (typeof METER_ADAPTERS)[number];

// util.meter_status (also reused by util.lte_subscriber.status)
export const METER_STATUSES = ['active', 'inactive', 'faulty'] as const;
export type MeterStatus = (typeof METER_STATUSES)[number];

// util.token_kind — what a vend token represents (UTIL-TKN-002/008)
export const TOKEN_KINDS = [
  'credit',
  'key_change',
  'clear_tamper',
  'adjustment',
  'free',
] as const;
export type TokenKind = (typeof TOKEN_KINDS)[number];

// util.token_status
export const TOKEN_STATUSES = ['issued', 'delivered', 'failed', 'reversed'] as const;
export type TokenStatus = (typeof TOKEN_STATUSES)[number];

// util.lte_product_kind — Easy Mobile catalogue (UTIL-LTE-001)
export const LTE_PRODUCT_KINDS = ['data_bundle', 'voice_bundle', 'subscription'] as const;
export type LteProductKind = (typeof LTE_PRODUCT_KINDS)[number];

// util.provision_status — LTE provisioning lifecycle (UTIL-LTE-003)
export const PROVISION_STATUSES = ['pending', 'provisioned', 'failed', 'reversed'] as const;
export type ProvisionStatus = (typeof PROVISION_STATUSES)[number];

// util.grid_direction — wholesale ZESA net-metering (UTIL-GRID-001)
export const GRID_DIRECTIONS = ['export', 'import'] as const;
export type GridDirection = (typeof GRID_DIRECTIONS)[number];

// pay.pay_channel — Payments Platform channels (PAY-API / UTIL-TKN-001)
export const PAY_CHANNELS = ['ussd', 'app', 'qr', 'agent', 'remittance', 'merchant'] as const;
export type PayChannel = (typeof PAY_CHANNELS)[number];

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
