import { Body, Controller, Param, Post } from '@nestjs/common';
import { FinancialService, GenerateScheduleParams } from './financial.service';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthPrincipal } from '../auth/auth.types';
import { ROLE_GROUPS } from '../../common/roles';

/**
 * Instalment-engine endpoints (SRS §4.2, FIN-INST-001..005).
 * actorId / actorRole are taken from the verified JWT principal (PLAT-AUTH-003),
 * never the request body.
 */
@Controller()
export class FinancialController {
  constructor(private readonly financial: FinancialService) {}

  // POST /accounts/:id/instalment-schedule  (FIN-INST-001/002)
  @Roles(...ROLE_GROUPS.finance)
  @Post('accounts/:id/instalment-schedule')
  async generateSchedule(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') accountId: string,
    @Body()
    body: Omit<GenerateScheduleParams, 'accountId' | 'startDate' | 'actorId' | 'actorRole'> & {
      startDate: string;
    },
  ) {
    return this.financial.generateInstalmentSchedule({
      ...body,
      accountId,
      startDate: new Date(body.startDate),
      actorId: user.actorId,
      actorRole: user.actorRole,
    });
  }

  // POST /instalments/raise-due  (FIN-INST-003 — driven by a daily job)
  @Roles(...ROLE_GROUPS.finance)
  @Post('instalments/raise-due')
  async raiseDue(@CurrentUser() user: AuthPrincipal, @Body() body: { asOf?: string }) {
    return this.financial.raiseDueInstalments({
      asOf: body.asOf ? new Date(body.asOf) : undefined,
      actorId: user.actorId,
      actorRole: user.actorRole,
    });
  }
}
