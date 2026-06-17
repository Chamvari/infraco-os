import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PLOT_STATUSES, PlotStatus, CurrencyCode } from '../../common/enums';
import { FinancialService } from '../financial/financial.service';
import { InstalmentStructure } from '../financial/instalment.util';

export interface ConvertReservationParams {
  reservationId: string;
  /** Number of instalments after the deposit (STND-SALE-003 payment schedule). */
  numInstalments: number;
  deposit: number;
  frequency?: 'monthly' | 'quarterly';
  structure?: InstalmentStructure;
  balloonAmount?: number;
  startDate?: Date;
  /** Negotiated price; defaults to the plot's list price. */
  priceOverride?: number;
  actorId: string;
  actorRole: string;
}

/**
 * SalesService — plot reservation and sales workflow.
 *
 * CRITICAL: reservePlot() calls the database stored procedure sales.reserve_plot
 * rather than inserting a reservation directly. The procedure serialises
 * concurrent callers with a transaction advisory lock and SELECT ... FOR UPDATE,
 * and the partial unique index uq_active_reservation is the hard backstop.
 * This is what enforces SRS STND-INV-004 (no double-allocation, no race).
 */
@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financial: FinancialService,
  ) {}

  /**
   * List the plot inventory, optionally filtered by status, with development
   * name and live allocation status (STND-INV-002/003, GIS-001 data source).
   */
  async listPlots(params: { status?: string; limit?: number }): Promise<
    Array<{
      plotId: string;
      plotNumber: string;
      development: string;
      plotType: string;
      areaSqm: number | null;
      areaHa: number | null;
      price: number | null;
      currency: string;
      status: string;
      gpsLat: number | null;
      gpsLng: number | null;
      geojson: Record<string, unknown> | null;
    }>
  > {
    let status: PlotStatus | null = null;
    if (params.status) {
      if (!PLOT_STATUSES.includes(params.status as PlotStatus)) {
        throw new BadRequestException(
          `Invalid status '${params.status}'. Allowed: ${PLOT_STATUSES.join(', ')}.`,
        );
      }
      status = params.status as PlotStatus;
    }
    const limit = Math.min(Math.max(params.limit ?? 200, 1), 1000);

    const rows = await this.prisma.$queryRawUnsafe<
      {
        plot_id: string;
        plot_number: string;
        development: string;
        plot_type: string;
        area_sqm: string | null;
        area_ha: string | null;
        price: string | null;
        currency: string;
        status: string;
        gps_lat: string | null;
        gps_lng: string | null;
        geojson: string | null;
      }[]
    >(
      `SELECT p.plot_id::text AS plot_id, p.plot_number,
              d.name AS development, p.plot_type,
              p.area_sqm::text AS area_sqm, p.area_ha::text AS area_ha,
              p.price::text AS price, p.currency, p.status,
              p.gps_lat::text AS gps_lat, p.gps_lng::text AS gps_lng,
              ST_AsGeoJSON(p.geom) AS geojson
         FROM sales.plot p
         JOIN sales.development d ON d.development_id = p.development_id
        WHERE ($1::sales.plot_status IS NULL OR p.status = $1::sales.plot_status)
        ORDER BY d.name, p.plot_number
        LIMIT $2`,
      status,
      limit,
    );

    const num = (v: string | null) => (v == null ? null : Number(v));
    return rows.map((r) => ({
      plotId: r.plot_id,
      plotNumber: r.plot_number,
      development: r.development,
      plotType: r.plot_type,
      areaSqm: num(r.area_sqm),
      areaHa: num(r.area_ha),
      price: num(r.price),
      currency: r.currency,
      status: r.status,
      gpsLat: num(r.gps_lat),
      gpsLng: num(r.gps_lng),
      // ST_AsGeoJSON returns a JSON string; hand the parsed geometry to clients.
      geojson: r.geojson ? (JSON.parse(r.geojson) as Record<string, unknown>) : null,
    }));
  }

  async reservePlot(params: {
    plotId: string;
    customerId: string;
    agentId: string;
    expiryMinutes?: number;
    actorId: string;
    actorRole: string;
  }): Promise<{ reservationId: string }> {
    const { plotId, customerId, agentId, expiryMinutes = 1440, actorId, actorRole } = params;

    try {
      const reservationId = await this.prisma.withActor(actorId, actorRole, async (tx) => {
        const rows = await tx.$queryRawUnsafe<{ reserve_plot: string }[]>(
          `SELECT sales.reserve_plot($1::uuid, $2::uuid, $3::uuid, $4::int) AS reserve_plot`,
          plotId,
          customerId,
          agentId,
          expiryMinutes,
        );
        return rows[0].reserve_plot;
      });
      return { reservationId };
    } catch (err: any) {
      // The procedure raises typed errors via RAISE EXCEPTION ... USING ERRCODE.
      const msg: string = err?.meta?.message ?? err?.message ?? String(err);
      if (msg.includes('PLOT_NOT_AVAILABLE')) {
        throw new ConflictException('Plot is not available for reservation.');
      }
      if (msg.includes('PLOT_NOT_FOUND')) {
        throw new NotFoundException('Plot not found.');
      }
      // Unique-index backstop (two callers raced past the proc somehow).
      if (msg.includes('uq_active_reservation')) {
        throw new ConflictException('Plot already has an active reservation.');
      }
      throw err;
    }
  }

  /**
   * STND-SALE-002/003 — convert an active reservation into a sale.
   *
   * Atomically (one transaction, advisory-locked on the plot like reserve_plot):
   *   1. validate the reservation is active and the plot is still reserved,
   *   2. open the buyer's instalment account (stand/agro purchase),
   *   3. record the sale as `pending_approval` (uq_active_sale is the backstop
   *      against a second sale on the same plot),
   *   4. mark the reservation `converted`,
   *   5. generate the instalment payment schedule (FIN-INST) on that account,
   *   6. register a `sale_agreement` document against the sale.
   *
   * The sale stays `pending_approval` until a Registrar approves it
   * (approveSale), at which point the plot flips to `sold`. PDF rendering of the
   * agreement itself is Module F (DOC-003); we register the artifact + schedule.
   */
  async convertReservationToSale(params: ConvertReservationParams): Promise<{
    saleId: string;
    accountId: string;
    accountReference: string;
    price: number;
    currency: string;
    status: 'pending_approval';
    schedule: { count: number; amounts: number[]; invoiceIds: string[] };
    agreementDocumentId: string;
  }> {
    const {
      reservationId,
      numInstalments,
      deposit,
      frequency = 'monthly',
      structure = 'equal',
      balloonAmount,
      startDate,
      priceOverride,
      actorId,
      actorRole,
    } = params;

    try {
      return await this.prisma.withActor(actorId, actorRole, async (tx) => {
        const resRows = await tx.$queryRawUnsafe<
          { plot_id: string; customer_id: string | null; agent_id: string | null; status: string }[]
        >(
          `SELECT plot_id::text, customer_id::text, agent_id::text, status
             FROM sales.reservation WHERE reservation_id = $1::uuid`,
          reservationId,
        );
        if (!resRows.length) throw new NotFoundException('Reservation not found.');
        const res = resRows[0];
        if (res.status !== 'active') {
          throw new ConflictException(`Reservation is ${res.status}, not active.`);
        }
        if (!res.customer_id) {
          throw new BadRequestException('Reservation has no customer to sell to.');
        }

        // Serialise on the plot (mirrors sales.reserve_plot, STND-INV-004).
        await tx.$executeRawUnsafe(
          `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
          res.plot_id,
        );

        const plotRows = await tx.$queryRawUnsafe<
          { status: string; plot_type: string; price: string | null; currency: string }[]
        >(
          `SELECT status, plot_type, price::text AS price, currency
             FROM sales.plot WHERE plot_id = $1::uuid FOR UPDATE`,
          res.plot_id,
        );
        const plot = plotRows[0];
        if (plot.status !== 'reserved') {
          throw new ConflictException(`Plot is ${plot.status}, expected reserved.`);
        }

        const listPrice = plot.price == null ? null : Number(plot.price);
        const price = priceOverride ?? listPrice;
        if (price == null) {
          throw new BadRequestException('Plot has no price; supply priceOverride.');
        }
        if (price < 0) throw new BadRequestException('price cannot be negative.');
        const currency = plot.currency as CurrencyCode;
        const accountType = plot.plot_type === 'agro' ? 'agro_purchase' : 'stand_purchase';
        const accountReference = this.generateAccountReference(accountType, res.customer_id);

        // 2. Buyer's instalment account.
        const acctRows = await tx.$queryRawUnsafe<{ account_id: string; reference: string }[]>(
          `INSERT INTO fin.account (customer_id, account_type, reference, status, currency)
           VALUES ($1::uuid, $2::fin.account_type, $3, 'active', $4::fin.currency_code)
           RETURNING account_id::text AS account_id, reference`,
          res.customer_id,
          accountType,
          accountReference,
          currency,
        );
        const accountId = acctRows[0].account_id;

        // 3. The sale (pending_approval). uq_active_sale guards double-sale.
        const saleRows = await tx.$queryRawUnsafe<{ sale_id: string }[]>(
          `INSERT INTO sales.sale
             (plot_id, customer_id, agent_id, account_id, price, currency, status, title_stage)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::fin.currency_code, 'pending_approval', 'agreement')
           RETURNING sale_id::text AS sale_id`,
          res.plot_id,
          res.customer_id,
          res.agent_id,
          accountId,
          price,
          currency,
        );
        const saleId = saleRows[0].sale_id;

        // 4. Close out the reservation.
        await tx.$executeRawUnsafe(
          `UPDATE sales.reservation SET status = 'converted'
            WHERE reservation_id = $1::uuid AND status = 'active'`,
          reservationId,
        );

        // 5. Payment schedule (composed atomically via the instalment engine).
        const schedule = await this.financial.generateInstalmentScheduleTx(tx, {
          accountId,
          totalPrice: price,
          deposit,
          numInstalments,
          frequency,
          structure,
          balloonAmount,
          startDate: startDate ?? new Date(),
          currency,
          actorId,
          actorRole,
        });

        // 6. Register the agreement artifact (storage_ref is a placeholder until
        //    Module F renders the PDF — DOC-003).
        const storageRef = `pending-generation/sale_agreement/${saleId}.pdf`;
        const docRows = await tx.$queryRawUnsafe<{ document_id: string }[]>(
          `INSERT INTO core.document
             (entity_schema, entity_table, entity_id, doc_type, version, storage_ref, access_tag, uploaded_by)
           VALUES ('sales','sale',$1,'sale_agreement',1,$2,'customer',$3::uuid)
           RETURNING document_id::text AS document_id`,
          saleId,
          storageRef,
          actorId || null,
        );

        return {
          saleId,
          accountId,
          accountReference,
          price,
          currency,
          status: 'pending_approval' as const,
          schedule: {
            count: schedule.count,
            amounts: schedule.amounts,
            invoiceIds: schedule.invoiceIds,
          },
          agreementDocumentId: docRows[0].document_id,
        };
      });
    } catch (err: unknown) {
      const msg = this.errMessage(err);
      if (msg.includes('uq_active_sale')) {
        throw new ConflictException('Plot already has an active sale.');
      }
      throw err;
    }
  }

  /**
   * STND-SALE-005 — Registrar approval. A `pending_approval` sale becomes
   * `active` and its plot flips `reserved` → `sold`. The approving user is
   * recorded (approved_by) and the write is audited via withActor.
   */
  async approveSale(params: {
    saleId: string;
    actorId: string;
    actorRole: string;
  }): Promise<{ saleId: string; status: 'active'; plotStatus: 'sold' }> {
    const { saleId, actorId, actorRole } = params;
    return this.prisma.withActor(actorId, actorRole, async (tx) => {
      const saleRows = await tx.$queryRawUnsafe<{ plot_id: string; status: string }[]>(
        `SELECT plot_id::text, status FROM sales.sale WHERE sale_id = $1::uuid FOR UPDATE`,
        saleId,
      );
      if (!saleRows.length) throw new NotFoundException('Sale not found.');
      const sale = saleRows[0];
      if (sale.status !== 'pending_approval') {
        throw new ConflictException(`Sale is ${sale.status}, not pending approval.`);
      }

      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
        sale.plot_id,
      );
      await tx.$executeRawUnsafe(
        `UPDATE sales.sale
            SET status = 'active', approved_by = $2::uuid, approved_at = now(), updated_at = now()
          WHERE sale_id = $1::uuid`,
        saleId,
        actorId || null,
      );
      await tx.$executeRawUnsafe(
        `UPDATE sales.plot SET status = 'sold', updated_at = now()
          WHERE plot_id = $1::uuid AND status = 'reserved'`,
        sale.plot_id,
      );
      return { saleId, status: 'active' as const, plotStatus: 'sold' as const };
    });
  }

  /**
   * STND-SALE-004 — cancellation / rescission. Cancels the sale, releases the
   * plot back to `available`, cancels the originating reservation, and voids
   * every not-yet-paid instalment invoice. If money was already received the
   * account is left open and `refundDue` is returned — automated refunds /
   * credit notes are a Module A gap (not built); a refund is handled manually.
   */
  async cancelSale(params: {
    saleId: string;
    reason: string;
    actorId: string;
    actorRole: string;
  }): Promise<{
    saleId: string;
    status: 'cancelled';
    plotStatus: 'available';
    invoicesCancelled: number;
    refundDue: number;
  }> {
    const { saleId, reason, actorId, actorRole } = params;
    if (!reason || reason.trim() === '') {
      throw new BadRequestException('A cancellation reason is required.');
    }
    return this.prisma.withActor(actorId, actorRole, async (tx) => {
      const saleRows = await tx.$queryRawUnsafe<
        { plot_id: string; account_id: string | null; status: string }[]
      >(
        `SELECT plot_id::text, account_id::text, status
           FROM sales.sale WHERE sale_id = $1::uuid FOR UPDATE`,
        saleId,
      );
      if (!saleRows.length) throw new NotFoundException('Sale not found.');
      const sale = saleRows[0];
      if (sale.status !== 'pending_approval' && sale.status !== 'active') {
        throw new ConflictException(`Cannot cancel a ${sale.status} sale.`);
      }

      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`,
        sale.plot_id,
      );

      // Void all not-yet-paid instalment invoices on the account.
      let invoicesCancelled = 0;
      let refundDue = 0;
      if (sale.account_id) {
        const voided = await tx.$queryRawUnsafe<{ invoice_id: string }[]>(
          `UPDATE fin.invoice SET status = 'cancelled', updated_at = now()
            WHERE account_id = $1::uuid AND invoice_type = 'instalment'
              AND status IN ('draft','issued','overdue')
          RETURNING invoice_id`,
          sale.account_id,
        );
        invoicesCancelled = voided.length;

        // Money already received = net credits posted to the account.
        const recv = await tx.$queryRawUnsafe<{ received: string }[]>(
          `SELECT COALESCE(SUM(amount),0)::text AS received
             FROM fin.ledger_entry
            WHERE account_id = $1::uuid AND txn_type = 'credit'`,
          sale.account_id,
        );
        refundDue = Number(recv[0].received);

        // No money in → close the account; money in → leave open for refund.
        await tx.$executeRawUnsafe(
          `UPDATE fin.account SET status = $2::fin.account_status
            WHERE account_id = $1::uuid`,
          sale.account_id,
          refundDue > 0 ? 'active' : 'closed',
        );
      }

      await tx.$executeRawUnsafe(
        `UPDATE sales.sale
            SET status = 'cancelled', cancelled_reason = $2, updated_at = now()
          WHERE sale_id = $1::uuid`,
        saleId,
        reason.trim(),
      );
      // Cancel the originating reservation (now 'converted').
      await tx.$executeRawUnsafe(
        `UPDATE sales.reservation SET status = 'cancelled'
          WHERE plot_id = $1::uuid AND status IN ('active','converted')`,
        sale.plot_id,
      );
      // Release the plot.
      await tx.$executeRawUnsafe(
        `UPDATE sales.plot SET status = 'available', updated_at = now()
          WHERE plot_id = $1::uuid`,
        sale.plot_id,
      );

      return {
        saleId,
        status: 'cancelled' as const,
        plotStatus: 'available' as const,
        invoicesCancelled,
        refundDue,
      };
    });
  }

  /** Account reference generator (mirrors AccountService). */
  private generateAccountReference(type: 'stand_purchase' | 'agro_purchase', customerId: string): string {
    const prefix = type === 'agro_purchase' ? 'AGR' : 'STD';
    const short = customerId.replace(/-/g, '').slice(0, 8).toUpperCase();
    const stamp = Date.now().toString(36).toUpperCase();
    return `${prefix}-${short}-${stamp}`;
  }

  private errMessage(err: unknown): string {
    const e = err as { meta?: { message?: string }; message?: string };
    return e?.meta?.message ?? e?.message ?? String(err);
  }
}
