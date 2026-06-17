import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ArrearsService } from './arrears.service';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthPrincipal } from '../auth/auth.types';
import { ROLE_GROUPS } from '../../common/roles';

/**
 * Arrears escalation endpoints (SRS §5.6, FIN-ARR-002; reused by LEASE-INV-002).
 * actorId / actorRole are taken from the verified JWT principal (PLAT-AUTH-003).
 */
@Controller()
export class ArrearsController {
  constructor(private readonly arrears: ArrearsService) {}

  // POST /arrears/run  (FIN-ARR-002 — driven by a daily job)
  @Roles(...ROLE_GROUPS.finance)
  @Post('arrears/run')
  async run(@CurrentUser() user: AuthPrincipal, @Body() body: { asOf?: string }) {
    return this.arrears.runEscalation({
      asOf: body.asOf,
      actorId: user.actorId,
      actorRole: user.actorRole,
    });
  }

  // GET /accounts/:id/arrears-actions  (escalation history)
  @Roles(...ROLE_GROUPS.read_finance)
  @Get('accounts/:id/arrears-actions')
  async actions(@Param('id') accountId: string) {
    return this.arrears.getAccountActions(accountId);
  }
}
