import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SalesService } from './sales.service';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthPrincipal } from '../auth/auth.types';
import { ROLE_GROUPS } from '../../common/roles';

@Controller('plots')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  // GET /plots?status=available   (inventory listing, STND-INV-002/003)
  @Roles(...ROLE_GROUPS.read_sales)
  @Get()
  async list(@Query('status') status?: string, @Query('limit') limit?: string) {
    return this.sales.listPlots({
      status,
      limit: limit ? parseInt(limit, 10) || undefined : undefined,
    });
  }

  // POST /plots/:id/reserve   (STND-SALE-001)
  @Roles(...ROLE_GROUPS.sales)
  @Post(':id/reserve')
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
}
