import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PLOT_STATUSES, PlotStatus } from '../../common/enums';

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
  constructor(private readonly prisma: PrismaService) {}

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
}
