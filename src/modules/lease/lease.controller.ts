import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { LeaseService } from './lease.service';
import {
  CreateLeaseDto,
  CreatePremisesDto,
  RenewalAlertDto,
  RentRunDto,
  TransitionLeaseDto,
  UtilityChargeDto,
} from './lease.dto';

/**
 * Module C — Leasing & Tenancy endpoints (SRS §6, LEASE-001..005, FIN-RENT-001..004).
 * actorId / actorRole arrive in the body for now (Phase 1 scaffold); a Module Z
 * auth guard will supply them from the authenticated principal later.
 */
@Controller()
export class LeaseController {
  constructor(private readonly lease: LeaseService) {}

  // POST /premises
  @Post('premises')
  async createPremises(@Body() body: CreatePremisesDto) {
    return this.lease.createPremises(body);
  }

  // GET /premises
  @Get('premises')
  async listPremises() {
    return this.lease.listPremises();
  }

  // POST /leases  (LEASE-001)
  @Post('leases')
  async createLease(@Body() body: CreateLeaseDto) {
    return this.lease.createLease(body);
  }

  // GET /leases?status=active
  @Get('leases')
  async listLeases(@Query('status') status?: string) {
    return this.lease.listLeases({ status });
  }

  // GET /api/leases/rent-roll  (LEASE-INV-003 — monthly Finance report)
  @Get('api/leases/rent-roll')
  async rentRoll(@Query('asOf') asOf?: string) {
    return this.lease.getRentRoll(asOf);
  }

  // GET /leases/:id/statement  (FIN-RENT-004)
  @Get('leases/:id/statement')
  async statement(@Param('id') leaseId: string) {
    return this.lease.getLeaseStatement(leaseId);
  }

  // POST /leases/:id/transition  (LEASE-003 lifecycle)
  @Post('leases/:id/transition')
  async transition(@Param('id') leaseId: string, @Body() body: TransitionLeaseDto) {
    return this.lease.transitionLease(leaseId, body);
  }

  // POST /leases/:id/utility-charge  (FIN-RENT-003)
  @Post('leases/:id/utility-charge')
  async utilityCharge(@Param('id') leaseId: string, @Body() body: UtilityChargeDto) {
    return this.lease.addUtilityCharge(leaseId, body);
  }

  // POST /rent/run  (FIN-RENT-001 — driven by a monthly job)
  @Post('rent/run')
  async rentRun(@Body() body: RentRunDto) {
    return this.lease.runRentBilling(body);
  }

  // POST /leases/renewal-alerts  (LEASE-004)
  @Post('leases/renewal-alerts')
  async renewalAlerts(@Body() body: RenewalAlertDto) {
    return this.lease.renewalAlerts(body);
  }
}
