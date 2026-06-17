import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { LeaseService } from './lease.service';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthPrincipal } from '../auth/auth.types';
import { ROLE_GROUPS } from '../../common/roles';
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
 * actorId / actorRole are taken from the verified JWT principal (PLAT-AUTH-003)
 * and override anything in the request body.
 */
@Controller()
export class LeaseController {
  constructor(private readonly lease: LeaseService) {}

  private withActor<T>(user: AuthPrincipal, body: T): T {
    return { ...body, actorId: user.actorId, actorRole: user.actorRole };
  }

  // POST /premises
  @Roles(...ROLE_GROUPS.operations)
  @Post('premises')
  async createPremises(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: CreatePremisesDto,
  ) {
    return this.lease.createPremises(this.withActor(user, body));
  }

  // GET /premises
  @Roles(...ROLE_GROUPS.read_operations)
  @Get('premises')
  async listPremises() {
    return this.lease.listPremises();
  }

  // POST /leases  (LEASE-001)
  @Roles(...ROLE_GROUPS.operations)
  @Post('leases')
  async createLease(@CurrentUser() user: AuthPrincipal, @Body() body: CreateLeaseDto) {
    return this.lease.createLease(this.withActor(user, body));
  }

  // GET /leases?status=active
  @Roles(...ROLE_GROUPS.read_operations)
  @Get('leases')
  async listLeases(@Query('status') status?: string) {
    return this.lease.listLeases({ status });
  }

  // GET /api/leases/rent-roll  (LEASE-INV-003 — monthly Finance report)
  @Roles(...ROLE_GROUPS.read_finance)
  @Get('api/leases/rent-roll')
  async rentRoll(@Query('asOf') asOf?: string) {
    return this.lease.getRentRoll(asOf);
  }

  // GET /leases/:id/statement  (FIN-RENT-004)
  @Roles(...ROLE_GROUPS.read_finance)
  @Get('leases/:id/statement')
  async statement(@Param('id') leaseId: string) {
    return this.lease.getLeaseStatement(leaseId);
  }

  // POST /leases/:id/transition  (LEASE-003 lifecycle)
  @Roles(...ROLE_GROUPS.operations)
  @Post('leases/:id/transition')
  async transition(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') leaseId: string,
    @Body() body: TransitionLeaseDto,
  ) {
    return this.lease.transitionLease(leaseId, this.withActor(user, body));
  }

  // POST /leases/:id/utility-charge  (FIN-RENT-003)
  @Roles(...ROLE_GROUPS.operations)
  @Post('leases/:id/utility-charge')
  async utilityCharge(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') leaseId: string,
    @Body() body: UtilityChargeDto,
  ) {
    return this.lease.addUtilityCharge(leaseId, this.withActor(user, body));
  }

  // POST /rent/run  (FIN-RENT-001 — driven by a monthly job)
  @Roles(...ROLE_GROUPS.finance)
  @Post('rent/run')
  async rentRun(@CurrentUser() user: AuthPrincipal, @Body() body: RentRunDto) {
    return this.lease.runRentBilling(this.withActor(user, body));
  }

  // POST /leases/renewal-alerts  (LEASE-004)
  @Roles(...ROLE_GROUPS.operations)
  @Post('leases/renewal-alerts')
  async renewalAlerts(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: RenewalAlertDto,
  ) {
    return this.lease.renewalAlerts(this.withActor(user, body));
  }
}
