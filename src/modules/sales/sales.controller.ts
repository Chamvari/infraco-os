import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SalesService } from './sales.service';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthPrincipal } from '../auth/auth.types';
import { ROLE_GROUPS } from '../../common/roles';
import type { Role } from '../../common/roles';
import { InstalmentStructure } from '../financial/instalment.util';

// Approving and cancelling/rescinding a sale are Registrar-level acts
// (STND-SALE-005) — a sales agent cannot sign off their own sale.
const SALE_APPROVERS: Role[] = ['registrar', 'sales_manager', 'sys_admin'];

@Controller()
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  // GET /plots?status=available   (inventory listing, STND-INV-002/003)
  @Roles(...ROLE_GROUPS.read_sales)
  @Get('plots')
  async list(@Query('status') status?: string, @Query('limit') limit?: string) {
    return this.sales.listPlots({
      status,
      limit: limit ? parseInt(limit, 10) || undefined : undefined,
    });
  }

  // POST /plots/:id/reserve   (STND-SALE-001)
  @Roles(...ROLE_GROUPS.sales)
  @Post('plots/:id/reserve')
  async reserve(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') plotId: string,
    @Body() body: { customerId: string; agentId: string; expiryMinutes?: number },
  ) {
    // Identity comes from the verified token, NEVER the request body.
    return this.sales.reservePlot({
      plotId,
      customerId: body.customerId,
      agentId: body.agentId,
      expiryMinutes: body.expiryMinutes,
      actorId: user.actorId,
      actorRole: user.actorRole,
    });
  }

  // POST /reservations/:id/convert   (STND-SALE-002/003)
  @Roles(...ROLE_GROUPS.sales)
  @Post('reservations/:id/convert')
  async convert(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') reservationId: string,
    @Body()
    body: {
      numInstalments: number;
      deposit: number;
      frequency?: 'monthly' | 'quarterly';
      structure?: InstalmentStructure;
      balloonAmount?: number;
      startDate?: string;
      priceOverride?: number;
    },
  ) {
    return this.sales.convertReservationToSale({
      reservationId,
      numInstalments: body.numInstalments,
      deposit: body.deposit,
      frequency: body.frequency,
      structure: body.structure,
      balloonAmount: body.balloonAmount,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      priceOverride: body.priceOverride,
      actorId: user.actorId,
      actorRole: user.actorRole,
    });
  }

  // POST /sales/:id/approve   (STND-SALE-005 Registrar sign-off)
  @Roles(...SALE_APPROVERS)
  @Post('sales/:id/approve')
  async approve(@CurrentUser() user: AuthPrincipal, @Param('id') saleId: string) {
    return this.sales.approveSale({
      saleId,
      actorId: user.actorId,
      actorRole: user.actorRole,
    });
  }

  // POST /sales/:id/cancel   (STND-SALE-004 cancellation / rescission)
  @Roles(...SALE_APPROVERS)
  @Post('sales/:id/cancel')
  async cancel(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') saleId: string,
    @Body() body: { reason: string },
  ) {
    return this.sales.cancelSale({
      saleId,
      reason: body?.reason,
      actorId: user.actorId,
      actorRole: user.actorRole,
    });
  }
}
