import { Body, Controller, Param, Post } from '@nestjs/common';
import { FinancialService, GenerateScheduleParams } from './financial.service';

/**
 * Instalment-engine endpoints (SRS §4.2, FIN-INST-001..005).
 * actorId / actorRole arrive in the body for now (Phase 1 scaffold); a Module Z
 * auth guard will supply them from the authenticated principal later.
 */
@Controller()
export class FinancialController {
  constructor(private readonly financial: FinancialService) {}

  // POST /accounts/:id/instalment-schedule  (FIN-INST-001/002)
  @Post('accounts/:id/instalment-schedule')
  async generateSchedule(
    @Param('id') accountId: string,
    @Body() body: Omit<GenerateScheduleParams, 'accountId' | 'startDate'> & { startDate: string },
  ) {
    return this.financial.generateInstalmentSchedule({
      ...body,
      accountId,
      startDate: new Date(body.startDate),
    });
  }

  // POST /instalments/raise-due  (FIN-INST-003 — driven by a daily job)
  @Post('instalments/raise-due')
  async raiseDue(
    @Body() body: { asOf?: string; actorId: string; actorRole: string },
  ) {
    return this.financial.raiseDueInstalments({
      asOf: body.asOf ? new Date(body.asOf) : undefined,
      actorId: body.actorId,
      actorRole: body.actorRole,
    });
  }
}
