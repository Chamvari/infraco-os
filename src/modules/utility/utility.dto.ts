import {
  GridDirection,
  LteProductKind,
  MeterAdapter,
  PayChannel,
  TokenKind,
  UtilityType,
  VendableUtilityType,
} from '../../common/enums';

export interface Actor {
  actorId: string;
  actorRole: string;
}

// -- Meter / tariff setup -----------------------------------------------------

export interface CreateMeterDto extends Actor {
  serialNo: string;
  utilityType: UtilityType;
  customerId?: string;
  premisesId?: string;
  plotId?: string;
  developmentId?: string;
  /** Vending backend (UTIL-TKN-003). Defaults to 'mock' in Phase 1. */
  adapter?: MeterAdapter;
  tariffId?: string;
  isPrepaid?: boolean;
}

export interface CreateTariffDto extends Actor {
  utilityType: UtilityType;
  name: string;
  /** flat | tiered | stepped. Phase 1 vend math implements 'flat' fully. */
  structure?: string;
  ratePerUnit?: number;
  tiers?: unknown;
  fixedCharge?: number;
  currency?: string;
  effectiveFrom?: string;
}

// -- Prepaid vending (UTIL-TKN) ----------------------------------------------

/**
 * A prepaid vend. Normally arrives via the Payments callback (purpose
 * 'utility_vend'); this DTO also backs a direct agent/admin vend. Idempotent on
 * platformTxnId (UTIL-TKN-005).
 */
export interface VendDto extends Actor {
  meterSerial?: string;
  meterId?: string;
  amountPaid: number;
  currency?: string;
  utilityType?: VendableUtilityType;
  tokenKind?: TokenKind;
  channel?: PayChannel;
  customerId?: string;
  platformTxnId?: string;
  /** For staff-issued adjustment/free tokens (UTIL-TKN-008). */
  reason?: string;
}

// -- Private LTE (UTIL-LTE) ---------------------------------------------------

export interface CreateLteProductDto extends Actor {
  kind: LteProductKind;
  name: string;
  price: number;
  externalRef?: string;
  currency?: string;
  validityDays?: number;
}

export interface CreateSubscriberDto extends Actor {
  customerId?: string;
  plotId?: string;
  premisesId?: string;
  msisdn?: string;
  simSerial?: string;
}

/** Purchase + provision an LTE product. Idempotent on platformTxnId (UTIL-LTE-003). */
export interface LtePurchaseDto extends Actor {
  subscriberId: string;
  productId: string;
  amountPaid: number;
  currency?: string;
  channel?: PayChannel;
  customerId?: string;
  platformTxnId?: string;
}

export interface RetryProvisionDto extends Actor {}

// -- Wholesale / grid settlement (UTIL-GRID) — separate plane -----------------

export interface GridExchangeDto extends Actor {
  developmentId: string;
  periodYear: number;
  periodMonth: number;
  direction: GridDirection;
  energyKwh: number;
  rate?: number;
  amount?: number;
  currency?: string;
}
