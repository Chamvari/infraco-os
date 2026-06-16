import { Controller, Get, Query } from '@nestjs/common';
import { ReportingService } from './reporting.service';

/**
 * Finance dashboard reporting endpoints (FIN-ARR-003 / PLAT-RPT).
 * Served under /api/finance so the web frontend can proxy /api to the backend.
 */
@Controller('api/finance')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  // GET /api/finance/arrears-ageing
  @Get('arrears-ageing')
  async arrearsAgeing() {
    return this.reporting.arrearsAgeing();
  }

  // GET /api/finance/top-debtors?limit=20
  @Get('top-debtors')
  async topDebtors(@Query('limit') limit?: string) {
    const n = limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100) : 20;
    return this.reporting.topDebtors(n);
  }
}
