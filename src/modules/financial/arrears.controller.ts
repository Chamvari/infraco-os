import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ArrearsService } from './arrears.service';

/**
 * Arrears escalation endpoints (SRS §5.6, FIN-ARR-002; reused by LEASE-INV-002).
 * actorId / actorRole arrive in the body for now (Phase 1 scaffold); a Module Z
 * auth guard will supply them from the authenticated principal later.
 */
@Controller()
export class ArrearsController {
  constructor(private readonly arrears: ArrearsService) {}

  // POST /arrears/run  (FIN-ARR-002 — driven by a daily job)
  @Post('arrears/run')
  async run(@Body() body: { asOf?: string; actorId: string; actorRole: string }) {
    return this.arrears.runEscalation({
      asOf: body.asOf,
      actorId: body.actorId,
      actorRole: body.actorRole,
    });
  }

  // GET /accounts/:id/arrears-actions  (escalation history)
  @Get('accounts/:id/arrears-actions')
  async actions(@Param('id') accountId: string) {
    return this.arrears.getAccountActions(accountId);
  }
}
