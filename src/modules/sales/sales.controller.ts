import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SalesService } from './sales.service';

@Controller('plots')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  // GET /plots?status=available   (inventory listing, STND-INV-002/003)
  @Get()
  async list(@Query('status') status?: string, @Query('limit') limit?: string) {
    return this.sales.listPlots({
      status,
      limit: limit ? parseInt(limit, 10) || undefined : undefined,
    });
  }

  // POST /plots/:id/reserve   (STND-SALE-001)
  @Post(':id/reserve')
  async reserve(
    @Param('id') plotId: string,
    @Body() body: { customerId: string; agentId: string; expiryMinutes?: number; actorId: string; actorRole: string },
  ) {
    return this.sales.reservePlot({ plotId, ...body });
  }
}
