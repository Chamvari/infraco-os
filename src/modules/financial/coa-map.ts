import { AccountType, AssetClass, InvoiceType } from '../../common/enums';

/**
 * Chart-of-accounts mapping helpers — FIN-ACC-001/002.
 *
 * The seeded COA (db/infraco_os_schema.sql §"Chart of accounts") is the source
 * of truth; these constants reference its `code` values so the auto-posting
 * engine maps each domain transaction to the right ledger account. Keep in sync
 * with the seed if codes change.
 */
export const COA = {
  RECEIVABLES: '1200', // Trade & Instalment Receivables (asset, group)
  CASH: '1300', // Cash & Bank (asset, group)
  DEFERRED_REVENUE: '2000', // Deferred Revenue — Instalments (liability, group)
  REV_STAND: '4000', // Revenue — Stand Sales (residential)
  REV_AGRO: '4100', // Revenue — Agro-Plot Sales (agro)
  REV_RENTAL: '4200', // Revenue — Rentals (commercial)
  REV_UTILITY: '4300', // Revenue — Utilities (utilities)
  REV_INTEREST: '4400', // Revenue — Instalment Interest (group)
  OPEX: '6000', // Operating Expenses (opex, group) — bad-debt write-offs
} as const;

/**
 * Map an account's type to its accounting asset class — used to tag journal
 * lines and segment the P&L (FIN-ACC-003). Utilities/commercial follow the
 * lease/rental and prepaid domains; group is the safe default.
 */
export function assetClassForAccountType(type: AccountType | string): AssetClass {
  switch (type) {
    case 'stand_purchase':
      return 'residential';
    case 'agro_purchase':
      return 'agro';
    case 'rental':
      return 'commercial';
    case 'utility':
      return 'utilities';
    default:
      return 'group';
  }
}

/**
 * Pick the revenue account for an invoice. Instalment/penalty revenue is split
 * by the buyer's asset class (stand vs agro); rent and utility invoices map to
 * their dedicated revenue lines regardless of asset class.
 */
export function revenueCoaForInvoice(
  invoiceType: InvoiceType | string,
  assetClass: AssetClass,
): string {
  switch (invoiceType) {
    case 'rent':
      return COA.REV_RENTAL;
    case 'solar':
    case 'water':
    case 'fibre':
      return COA.REV_UTILITY;
    case 'penalty':
      return COA.REV_INTEREST;
    case 'instalment':
    case 'other':
    default:
      if (assetClass === 'agro') return COA.REV_AGRO;
      if (assetClass === 'commercial') return COA.REV_RENTAL;
      if (assetClass === 'utilities') return COA.REV_UTILITY;
      return COA.REV_STAND;
  }
}
