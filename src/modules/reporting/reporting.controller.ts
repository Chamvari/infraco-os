import { Controller, Get, Query } from '@nestjs/common';
import { ReportingService } from './reporting.service';
import { Roles } from '../auth/auth.decorators';
import { ROLE_GROUPS } from '../../common/roles';

/**
 * Finance dashboard reporting endpoints (FIN-ARR-003 / PLAT-RPT).
 * Served under /api/finance so the web frontend can proxy /api to the backend.
 * Read-only finance + oversight roles (PLAT-AUTH-002).
 */
@Controller('api/finance')
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  // GET /api/finance/collections-summary
  @Roles(...ROLE_GROUPS.read_finance)
  @Get('collections-summary')
  async collectionsSummary() {
    return this.reporting.collectionsSummary();
  }

  // GET /api/finance/arrears-ageing
  @Roles(...ROLE_GROUPS.read_finance)
  @Get('arrears-ageing')
  async arrearsAgeing() {
    return this.reporting.arrearsAgeing();
  }

  // GET /api/finance/top-debtors?limit=20
  @Roles(...ROLE_GROUPS.read_finance)
  @Get('top-debtors')
  async topDebtors(@Query('limit') limit?: string) {
    const n = limit ? Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100) : 20;
    return this.reporting.topDebtors(n);
  }
}
