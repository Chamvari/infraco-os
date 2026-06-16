import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PrismaClient } from '@prisma/client';
import {
  CURRENCY_CODES,
  METER_ADAPTERS,
  TOKEN_KINDS,
  VENDABLE_UTILITY_TYPES,
  CurrencyCode,
  MeterAdapter,
  TokenKind,
  VendableUtilityType,
} from '../../common/enums';
import { MeterAdapterRegistry } from './meter-adapter';
import { EasyMobileClient } from './easymobile.client';
import {
  CreateLteProductDto,
  CreateMeterDto,
  CreateSubscriberDto,
  CreateTariffDto,
  GridExchangeDto,
  LtePurchaseDto,
  RetryProvisionDto,
  VendDto,
} from './utility.dto';

type Tx = PrismaClient;

interface Actor {
  actorId: string;
  actorRole: string;
}

export interface VendOutcome {
  vendId: string;
  meterId: string;
  tokenCode: string | null;
  units: number | null;
  amountPaid: number;
  status: string;
  duplicate: boolean;
}

export interface LtePurchaseOutcome {
  purchaseId: string;
  status: string;
  provisionRef: string | null;
  duplicate: boolean;
}

/**
 * UtilityService — Module D, the private-utility operator (SRS §7).
 *
 *   UTIL-TKN-001..009  prepaid token vending for metered utilities (power/water/gas)
 *   UTIL-LTE-001..005  private-LTE (Easy Mobile/EOS) bundle/subscription provisioning
 *   UTIL-GRID-001..005  wholesale ZESA net-metering settlement
 *
 * Two strictly separate planes (see SRS §7.6):
 *   • CUSTOMER BILLING PLANE — vends and LTE purchases. A customer pays the
 *     Payments Platform; the callback (Module H) drives a vend/purchase here.
 *     Idempotent on platform_txn_id.
 *   • WHOLESALE / GRID PLANE — grid_exchange / generation_log with ZESA. NEVER
 *     linked to a customer account; recorded for settlement only. The grid
 *     methods below touch no fin.* / token_vend / customer row.
 *
 * Raw SQL + withActor() throughout, matching the other modules.
 */
@Injectable()
export class UtilityService {
  private readonly logger = new Logger(UtilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapters: MeterAdapterRegistry,
    private readonly easyMobile: EasyMobileClient,
  ) {}

  // ==========================================================================
  // Setup — meters, tariffs, LTE catalogue, subscribers
  // ==========================================================================

  async createMeter(dto: CreateMeterDto): Promise<{ meterId: string; serialNo: string }> {
    this.requireNonEmpty('serialNo', dto.serialNo);
    const adapter: MeterAdapter = dto.adapter ?? 'mock';
    if (!METER_ADAPTERS.includes(adapter)) {
      throw new BadRequestException(`Invalid adapter '${adapter}'.`);
    }
    try {
      return await this.prisma.withActor(dto.actorId, dto.actorRole, async (tx) => {
        const rows = await tx.$queryRawUnsafe<{ meter_id: string; serial_no: string }[]>(
          `INSERT INTO util.meter
             (serial_no, utility_type, customer_id, premises_id, plot_id,
              development_id, adapter, tariff_id, is_prepaid)
           VALUES ($1, $2::util.utility_type, $3::uuid, $4::uuid, $5::uuid,
                   $6::uuid, $7::util.meter_adapter, $8::uuid, $9)
           RETURNING meter_id, serial_no`,
          dto.serialNo,
          dto.utilityType,
          dto.customerId ?? null,
          dto.premisesId ?? null,
          dto.plotId ?? null,
          dto.developmentId ?? null,
          adapter,
          dto.tariffId ?? null,
          dto.isPrepaid ?? true,
        );
        return { meterId: rows[0].meter_id, serialNo: rows[0].serial_no };
      });
    } catch (err: unknown) {
      if (this.pgMessage(err).includes('meter_serial_no_key')) {
        throw new BadRequestException(`Meter serial '${dto.serialNo}' already exists.`);
      }
      throw err;
    }
  }

  async listMeters(): Promise<
    Array<{
      meterId: string;
      serialNo: string;
      utilityType: string;
      adapter: string;
      status: string;
      lastBalance: number | null;
    }>
  > {
    const rows = await this.prisma.$queryRawUnsafe<
      {
        meter_id: string;
        serial_no: string;
        utility_type: string;
        adapter: string;
        status: string;
        last_balance: string | null;
      }[]
    >(
      `SELECT meter_id::text AS meter_id, serial_no, utility_type::text AS utility_type,
              adapter::text AS adapter, status::text AS status,
              last_balance::text AS last_balance
         FROM util.meter ORDER BY serial_no`,
    );
    return rows.map((r) => ({
      meterId: r.meter_id,
      serialNo: r.serial_no,
      utilityType: r.utility_type,
      adapter: r.adapter,
      status: r.status,
      lastBalance: r.last_balance == null ? null : Number(r.last_balance),
    }));
  }

  async createTariff(dto: CreateTariffDto): Promise<{ tariffId: string }> {
    this.requireNonEmpty('name', dto.name);
    return this.prisma.withActor(dto.actorId, dto.actorRole, async (tx) => {
      const rows = await tx.$queryRawUnsafe<{ tariff_id: string }[]>(
        `INSERT INTO util.tariff
           (utility_type, development_id, name, structure, rate, tiers, fixed_charge,
            currency, effective_from)
         VALUES ($1::util.utility_type, $2::uuid, $3, $4, $5, $6::jsonb, $7,
                 $8::fin.currency_code, COALESCE($9::date, current_date))
         RETURNING tariff_id`,
        dto.utilityType,
        null,
        dto.name,
        dto.structure ?? 'flat',
        dto.ratePerUnit ?? null,
        dto.tiers == null ? null : JSON.stringify(dto.tiers),
        dto.fixedCharge ?? 0,
        dto.currency ?? 'USD',
        dto.effectiveFrom ?? null,
      );
      return { tariffId: rows[0].tariff_id };
    });
  }

  async createLteProduct(dto: CreateLteProductDto): Promise<{ productId: string }> {
    this.requireNonEmpty('name', dto.name);
    if (!(dto.price >= 0)) throw new BadRequestException('price must be 0 or greater.');
    return this.prisma.withActor(dto.actorId, dto.actorRole, async (tx) => {
      const rows = await tx.$queryRawUnsafe<{ product_id: string }[]>(
        `INSERT INTO util.lte_product
           (external_ref, kind, name, price, currency, validity_days)
         VALUES ($1, $2::util.lte_product_kind, $3, $4, $5::fin.currency_code, $6)
         RETURNING product_id`,
        dto.externalRef ?? null,
        dto.kind,
        dto.name,
        dto.price,
        dto.currency ?? 'USD',
        dto.validityDays ?? null,
      );
      return { productId: rows[0].product_id };
    });
  }

  async createSubscriber(dto: CreateSubscriberDto): Promise<{ subscriberId: string }> {
    return this.prisma.withActor(dto.actorId, dto.actorRole, async (tx) => {
      const rows = await tx.$queryRawUnsafe<{ subscriber_id: string }[]>(
        `INSERT INTO util.lte_subscriber
           (customer_id, plot_id, premises_id, msisdn, sim_serial)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5)
         RETURNING subscriber_id`,
        dto.customerId ?? null,
        dto.plotId ?? null,
        dto.premisesId ?? null,
        dto.msisdn ?? null,
        dto.simSerial ?? null,
      );
      return { subscriberId: rows[0].subscriber_id };
    });
  }

  // ==========================================================================
  // Prepaid vending (UTIL-TKN) — customer billing plane
  // ==========================================================================

  /** Direct (agent/admin) vend; opens its own transaction. */
  async vend(dto: VendDto): Promise<VendOutcome> {
    return this.prisma.withActor(dto.actorId, dto.actorRole, (tx) =>
      this.vendCoreTx(tx, dto, { actorId: dto.actorId, actorRole: dto.actorRole }),
    );
  }

  /**
   * Callback-driven vend (UTIL-TKN-001/005). Runs inside the Payments callback
   * transaction so the vend commits atomically with the callback record.
   */
  async vendFromCallbackTx(
    tx: Tx,
    payload: {
      platform_txn_id: string;
      meter_serial?: string;
      meter_id?: string;
      amount_paid: number;
      currency?: string;
      channel?: string;
      customer_id?: string;
      token_kind?: string;
    },
    actor: Actor,
  ): Promise<VendOutcome> {
    return this.vendCoreTx(
      tx,
      {
        ...actor,
        meterSerial: payload.meter_serial,
        meterId: payload.meter_id,
        amountPaid: payload.amount_paid,
        currency: payload.currency,
        channel: payload.channel as VendDto['channel'],
        customerId: payload.customer_id,
        tokenKind: (payload.token_kind as TokenKind) ?? 'credit',
        platformTxnId: payload.platform_txn_id,
      },
      actor,
    );
  }

  private async vendCoreTx(tx: Tx, dto: VendDto, actor: Actor): Promise<VendOutcome> {
    if (!(dto.amountPaid >= 0)) {
      throw new BadRequestException('amountPaid must be 0 or greater.');
    }
    const tokenKind: TokenKind = dto.tokenKind ?? 'credit';
    if (!TOKEN_KINDS.includes(tokenKind)) {
      throw new BadRequestException(`Invalid tokenKind '${tokenKind}'.`);
    }
    const currency = (dto.currency ?? 'USD') as CurrencyCode;
    if (!CURRENCY_CODES.includes(currency)) {
      throw new BadRequestException(`Invalid currency '${currency}'.`);
    }

    // Idempotency (UTIL-TKN-005): a prior vend for this platform txn wins.
    if (dto.platformTxnId) {
      const existing = await tx.$queryRawUnsafe<
        { vend_id: string; meter_id: string; token_code: string | null; units: string | null; amount_paid: string; status: string }[]
      >(
        `SELECT vend_id::text AS vend_id, meter_id::text AS meter_id, token_code,
                units::text AS units, amount_paid::text AS amount_paid, status::text AS status
           FROM util.token_vend WHERE platform_txn_id = $1`,
        dto.platformTxnId,
      );
      if (existing.length) {
        const e = existing[0];
        return {
          vendId: e.vend_id,
          meterId: e.meter_id,
          tokenCode: e.token_code,
          units: e.units == null ? null : Number(e.units),
          amountPaid: Number(e.amount_paid),
          status: e.status,
          duplicate: true,
        };
      }
    }

    const meter = await this.resolveMeterTx(tx, dto.meterId, dto.meterSerial);
    if (!meter.is_prepaid) {
      throw new BadRequestException(`Meter ${meter.serial_no} is not a prepaid meter.`);
    }
    const utilityType = meter.utility_type as VendableUtilityType;
    if (!VENDABLE_UTILITY_TYPES.includes(utilityType)) {
      throw new BadRequestException(
        `Utility '${utilityType}' is not vendable. Vendable: ${VENDABLE_UTILITY_TYPES.join(', ')}.`,
      );
    }

    // Convert amount → units via the meter's tariff (UTIL-TKN-006).
    const { units, unitCalc, tariffId } = await this.computeUnitsTx(
      tx,
      meter.tariff_id,
      dto.amountPaid,
    );

    // Generate the token via the meter's configured adapter (UTIL-TKN-003).
    const adapter = this.adapters.resolve(meter.adapter as MeterAdapter);
    const reference = dto.platformTxnId ?? `${meter.serial_no}:${dto.amountPaid}`;
    const vended = await adapter.vend({
      meterSerial: meter.serial_no,
      utilityType,
      units,
      amount: dto.amountPaid,
      tokenKind,
      reference,
    });

    try {
      const rows = await tx.$queryRawUnsafe<{ vend_id: string }[]>(
        `INSERT INTO util.token_vend
           (meter_id, customer_id, utility_type, token_kind, amount_paid, currency,
            units, tariff_id, unit_calc, token_code, adapter, channel, platform_txn_id,
            status, issued_by, reason)
         VALUES ($1::uuid, $2::uuid, $3::util.utility_type, $4::util.token_kind, $5,
                 $6::fin.currency_code, $7, $8::uuid, $9::jsonb, $10,
                 $11::util.meter_adapter, $12::pay.pay_channel, $13, 'issued', $14::uuid, $15)
         RETURNING vend_id`,
        meter.meter_id,
        dto.customerId ?? meter.customer_id ?? null,
        utilityType,
        tokenKind,
        dto.amountPaid,
        currency,
        units,
        tariffId,
        JSON.stringify(unitCalc),
        vended.tokenCode,
        meter.adapter,
        dto.channel ?? null,
        dto.platformTxnId ?? null,
        actor.actorId || null,
        dto.reason ?? null,
      );
      const vendId = rows[0].vend_id;

      // Reflect the top-up on the meter's last reported balance (UTIL-METER-004).
      if (units != null) {
        await tx.$executeRawUnsafe(
          `UPDATE util.meter
              SET last_balance = COALESCE(last_balance,0) + $2, last_balance_at = now()
            WHERE meter_id = $1::uuid`,
          meter.meter_id,
          units,
        );
      }

      return {
        vendId,
        meterId: meter.meter_id,
        tokenCode: vended.tokenCode,
        units,
        amountPaid: dto.amountPaid,
        status: 'issued',
        duplicate: false,
      };
    } catch (err: unknown) {
      // Idempotency backstop: a concurrent duplicate lost the unique-index race.
      if (this.isUniqueViolation(err) && dto.platformTxnId) {
        const dup = await tx.$queryRawUnsafe<
          { vend_id: string; meter_id: string; token_code: string | null; units: string | null; amount_paid: string; status: string }[]
        >(
          `SELECT vend_id::text AS vend_id, meter_id::text AS meter_id, token_code,
                  units::text AS units, amount_paid::text AS amount_paid, status::text AS status
             FROM util.token_vend WHERE platform_txn_id = $1`,
          dto.platformTxnId,
        );
        if (dup.length) {
          const e = dup[0];
          return {
            vendId: e.vend_id,
            meterId: e.meter_id,
            tokenCode: e.token_code,
            units: e.units == null ? null : Number(e.units),
            amountPaid: Number(e.amount_paid),
            status: e.status,
            duplicate: true,
          };
        }
      }
      throw err;
    }
  }

  // ==========================================================================
  // Private LTE (UTIL-LTE) — customer billing plane
  // ==========================================================================

  /** Direct (agent/admin) LTE purchase; opens its own transaction. */
  async purchaseLte(dto: LtePurchaseDto): Promise<LtePurchaseOutcome> {
    const actor = { actorId: dto.actorId, actorRole: dto.actorRole };
    return this.prisma.withActor(dto.actorId, dto.actorRole, (tx) =>
      this.purchaseLteCoreTx(tx, dto, actor),
    );
  }

  /** Callback-driven LTE purchase (UTIL-LTE-003), inside the callback tx. */
  async purchaseLteFromCallbackTx(
    tx: Tx,
    payload: {
      platform_txn_id: string;
      subscriber_id: string;
      product_id: string;
      amount_paid: number;
      currency?: string;
      channel?: string;
      customer_id?: string;
    },
    actor: Actor,
  ): Promise<LtePurchaseOutcome> {
    return this.purchaseLteCoreTx(
      tx,
      {
        ...actor,
        subscriberId: payload.subscriber_id,
        productId: payload.product_id,
        amountPaid: payload.amount_paid,
        currency: payload.currency,
        channel: payload.channel as LtePurchaseDto['channel'],
        customerId: payload.customer_id,
        platformTxnId: payload.platform_txn_id,
      },
      actor,
    );
  }

  private async purchaseLteCoreTx(
    tx: Tx,
    dto: LtePurchaseDto,
    actor: Actor,
  ): Promise<LtePurchaseOutcome> {
    if (!(dto.amountPaid >= 0)) {
      throw new BadRequestException('amountPaid must be 0 or greater.');
    }
    const currency = (dto.currency ?? 'USD') as CurrencyCode;

    // Idempotency (UTIL-LTE-003): an existing purchase for this txn wins.
    if (dto.platformTxnId) {
      const existing = await this.findPurchaseByTxnTx(tx, dto.platformTxnId);
      if (existing) return { ...existing, duplicate: true };
    }

    let purchaseId: string;
    try {
      const rows = await tx.$queryRawUnsafe<{ purchase_id: string }[]>(
        `INSERT INTO util.lte_purchase
           (subscriber_id, product_id, customer_id, amount_paid, currency, channel,
            platform_txn_id, status)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::fin.currency_code,
                 $6::pay.pay_channel, $7, 'pending')
         RETURNING purchase_id`,
        dto.subscriberId,
        dto.productId,
        dto.customerId ?? null,
        dto.amountPaid,
        currency,
        dto.channel ?? null,
        dto.platformTxnId ?? null,
      );
      purchaseId = rows[0].purchase_id;
    } catch (err: unknown) {
      if (this.isUniqueViolation(err) && dto.platformTxnId) {
        const dup = await this.findPurchaseByTxnTx(tx, dto.platformTxnId);
        if (dup) return { ...dup, duplicate: true };
      }
      throw err;
    }

    // First provisioning attempt against EOS (UTIL-LTE-003).
    const outcome = await this.attemptProvisionTx(tx, purchaseId, 1);
    return { ...outcome, duplicate: false };
  }

  /**
   * UTIL-LTE-003 — retry provisioning for a purchase that failed (transient EOS
   * outage). Idempotent: an already-provisioned purchase is returned unchanged.
   */
  async retryProvision(
    purchaseId: string,
    dto: RetryProvisionDto,
  ): Promise<LtePurchaseOutcome> {
    return this.prisma.withActor(dto.actorId, dto.actorRole, async (tx) => {
      const cur = await tx.$queryRawUnsafe<
        { purchase_id: string; status: string; provision_ref: string | null }[]
      >(
        `SELECT purchase_id::text AS purchase_id, status::text AS status, provision_ref
           FROM util.lte_purchase WHERE purchase_id = $1::uuid`,
        purchaseId,
      );
      if (cur.length === 0) {
        throw new NotFoundException(`LTE purchase ${purchaseId} not found.`);
      }
      if (cur[0].status === 'provisioned') {
        return {
          purchaseId,
          status: 'provisioned',
          provisionRef: cur[0].provision_ref,
          duplicate: true,
        };
      }
      const outcome = await this.attemptProvisionTx(tx, purchaseId, 2);
      return { ...outcome, duplicate: false };
    });
  }

  /** Call EOS once and persist the resulting provisioning state. */
  private async attemptProvisionTx(
    tx: Tx,
    purchaseId: string,
    attempt: number,
  ): Promise<Omit<LtePurchaseOutcome, 'duplicate'>> {
    const ctx = await tx.$queryRawUnsafe<
      { msisdn: string | null; external_ref: string | null }[]
    >(
      `SELECT s.msisdn, p.external_ref
         FROM util.lte_purchase lp
         JOIN util.lte_subscriber s ON s.subscriber_id = lp.subscriber_id
         JOIN util.lte_product p    ON p.product_id    = lp.product_id
        WHERE lp.purchase_id = $1::uuid`,
      purchaseId,
    );
    const c = ctx[0] ?? { msisdn: null, external_ref: null };

    let result: { ok: boolean; provisionRef?: string; error?: string };
    try {
      result = await this.easyMobile.provision({
        purchaseId,
        msisdn: c.msisdn,
        productExternalRef: c.external_ref,
        attempt,
      });
    } catch (e: unknown) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    if (result.ok) {
      await tx.$executeRawUnsafe(
        `UPDATE util.lte_purchase
            SET status = 'provisioned', provision_ref = $2, provisioned_at = now()
          WHERE purchase_id = $1::uuid`,
        purchaseId,
        result.provisionRef ?? null,
      );
      return { purchaseId, status: 'provisioned', provisionRef: result.provisionRef ?? null };
    }

    await tx.$executeRawUnsafe(
      `UPDATE util.lte_purchase SET status = 'failed' WHERE purchase_id = $1::uuid`,
      purchaseId,
    );
    this.logger.warn(`LTE provisioning failed for ${purchaseId}: ${result.error ?? 'unknown'}`);
    return { purchaseId, status: 'failed', provisionRef: null };
  }

  // ==========================================================================
  // Wholesale / grid settlement (UTIL-GRID) — SEPARATE plane, no customer link
  // ==========================================================================

  /**
   * Record a period grid exchange with ZESA (UTIL-GRID-001/002). This is the
   * wholesale plane: it writes only to util.grid_exchange and is NEVER attached
   * to a customer account or invoice. Customer solar export credits net off
   * backup draw at settlement and are never exposed to customers.
   */
  async recordGridExchange(dto: GridExchangeDto): Promise<{ exchangeId: string }> {
    if (dto.periodMonth < 1 || dto.periodMonth > 12) {
      throw new BadRequestException('periodMonth must be 1..12.');
    }
    if (!(dto.energyKwh >= 0)) {
      throw new BadRequestException('energyKwh must be 0 or greater.');
    }
    return this.prisma.withActor(dto.actorId, dto.actorRole, async (tx) => {
      const rows = await tx.$queryRawUnsafe<{ exchange_id: string }[]>(
        `INSERT INTO util.grid_exchange
           (development_id, period_year, period_month, direction, energy_kwh, rate,
            amount, currency)
         VALUES ($1::uuid, $2, $3, $4::util.grid_direction, $5, $6, $7, $8::fin.currency_code)
         RETURNING exchange_id`,
        dto.developmentId,
        dto.periodYear,
        dto.periodMonth,
        dto.direction,
        dto.energyKwh,
        dto.rate ?? null,
        dto.amount ?? null,
        dto.currency ?? 'USD',
      );
      return { exchangeId: rows[0].exchange_id };
    });
  }

  // ==========================================================================
  // helpers
  // ==========================================================================

  private async resolveMeterTx(
    tx: Tx,
    meterId?: string,
    serialNo?: string,
  ): Promise<{
    meter_id: string;
    serial_no: string;
    utility_type: string;
    adapter: string;
    is_prepaid: boolean;
    tariff_id: string | null;
    customer_id: string | null;
  }> {
    if (!meterId && !serialNo) {
      throw new BadRequestException('A meterId or meterSerial is required.');
    }
    const rows = await tx.$queryRawUnsafe<
      {
        meter_id: string;
        serial_no: string;
        utility_type: string;
        adapter: string;
        is_prepaid: boolean;
        tariff_id: string | null;
        customer_id: string | null;
      }[]
    >(
      `SELECT meter_id::text AS meter_id, serial_no, utility_type::text AS utility_type,
              adapter::text AS adapter, is_prepaid, tariff_id::text AS tariff_id,
              customer_id::text AS customer_id
         FROM util.meter
        WHERE ($1::uuid IS NOT NULL AND meter_id = $1::uuid)
           OR ($2 IS NOT NULL AND serial_no = $2)
        LIMIT 1`,
      meterId ?? null,
      serialNo ?? null,
    );
    if (rows.length === 0) {
      throw new NotFoundException(
        `Meter ${meterId ?? serialNo} not found.`,
      );
    }
    return rows[0];
  }

  /** Amount → units using a flat tariff (UTIL-TKN-006). Records an audit blob. */
  private async computeUnitsTx(
    tx: Tx,
    tariffId: string | null,
    amount: number,
  ): Promise<{ units: number | null; unitCalc: Record<string, unknown>; tariffId: string | null }> {
    if (!tariffId) {
      return { units: null, unitCalc: { method: 'amount_only', note: 'no tariff on meter' }, tariffId: null };
    }
    const rows = await tx.$queryRawUnsafe<
      { tariff_id: string; structure: string; rate: string | null; fixed_charge: string | null }[]
    >(
      `SELECT tariff_id::text AS tariff_id, structure, rate::text AS rate,
              fixed_charge::text AS fixed_charge
         FROM util.tariff WHERE tariff_id = $1::uuid`,
      tariffId,
    );
    if (rows.length === 0) {
      return { units: null, unitCalc: { method: 'amount_only', note: 'tariff not found' }, tariffId: null };
    }
    const t = rows[0];
    const rate = t.rate == null ? null : Number(t.rate);
    const fixed = t.fixed_charge == null ? 0 : Number(t.fixed_charge);
    // Phase 1 implements 'flat' fully; tiered/stepped use the flat rate as the
    // effective rate until the tier walker lands (tracked against UTIL-TKN-006).
    if (rate && rate > 0) {
      const billable = Math.max(amount - fixed, 0);
      const units = Math.round((billable / rate) * 1000) / 1000;
      return {
        units,
        unitCalc: { method: t.structure, rate, fixedCharge: fixed, amount, units },
        tariffId: t.tariff_id,
      };
    }
    return { units: null, unitCalc: { method: t.structure, note: 'no positive rate' }, tariffId: t.tariff_id };
  }

  private async findPurchaseByTxnTx(
    tx: Tx,
    platformTxnId: string,
  ): Promise<{ purchaseId: string; status: string; provisionRef: string | null } | null> {
    const rows = await tx.$queryRawUnsafe<
      { purchase_id: string; status: string; provision_ref: string | null }[]
    >(
      `SELECT purchase_id::text AS purchase_id, status::text AS status, provision_ref
         FROM util.lte_purchase WHERE platform_txn_id = $1`,
      platformTxnId,
    );
    if (rows.length === 0) return null;
    return {
      purchaseId: rows[0].purchase_id,
      status: rows[0].status,
      provisionRef: rows[0].provision_ref,
    };
  }

  private requireNonEmpty(field: string, value: string): void {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new BadRequestException(`${field} is required.`);
    }
  }

  private pgMessage(err: unknown): string {
    const e = err as { meta?: { message?: string }; message?: string };
    return e?.meta?.message ?? e?.message ?? String(err);
  }

  /** Postgres unique-constraint violation (SQLSTATE 23505); index name is not
   * exposed by Prisma, so match on the code. */
  private isUniqueViolation(e: unknown): boolean {
    const x = e as { meta?: { code?: string; message?: string }; message?: string };
    const blob = `${x?.meta?.code ?? ''} ${x?.meta?.message ?? ''} ${x?.message ?? ''}`;
    return x?.meta?.code === '23505' || /\b23505\b|unique constraint|already exists|duplicate key/i.test(blob);
  }
}
