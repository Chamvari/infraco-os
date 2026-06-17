import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { CurrentUser, Roles, Mfa } from '../auth/auth.decorators';
import { AuthPrincipal } from '../auth/auth.types';
import { ROLE_GROUPS } from '../../common/roles';
import { ApprovalStatus, CurrencyCode } from '../../common/enums';

/**
 * Delegation-of-Authority endpoints — Module Z (PLAT-AUTH-005).
 *
 *   POST /approvals             — initiate a request for a high-value transaction
 *   POST /approvals/:id/approve — second signatory approves (must differ from initiator)
 *   POST /approvals/:id/reject  — second signatory rejects
 *   POST /approvals/:id/execute — execute an approved transaction (refused otherwise)
 *   GET  /approvals/:id         — fetch one request
 *   GET  /approvals             — list requests (status / action_code filters)
 *
 * Initiation is a finance write; the decision and execution steps are sensitive
 * (senior finance + MFA). The actor is always taken from the verified JWT, never
 * from the body, so the distinct-signatory rule cannot be spoofed.
 */
@Controller('approvals')
export class ApprovalController {
  constructor(private readonly approvals: ApprovalService) {}

  @Roles(...ROLE_GROUPS.finance)
  @Post()
  async initiate(
    @CurrentUser() user: AuthPrincipal,
    @Body()
    body: {
      actionCode: string;
      amount: number;
      currency?: CurrencyCode;
      entityRef?: string;
      payload?: unknown;
    },
  ) {
    return this.approvals.initiate(
      {
        actionCode: body.actionCode,
        amount: body.amount,
        currency: body.currency,
        entityRef: body.entityRef,
        payload: body.payload,
      },
      { actorId: user.actorId, actorRole: user.actorRole },
    );
  }

  @Roles(...ROLE_GROUPS.finance_senior)
  @Mfa()
  @Post(':id/approve')
  async approve(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') approvalId: string,
    @Body() body: { note?: string },
  ) {
    return this.approvals.approve(
      approvalId,
      { actorId: user.actorId, actorRole: user.actorRole },
      body?.note,
    );
  }

  @Roles(...ROLE_GROUPS.finance_senior)
  @Mfa()
  @Post(':id/reject')
  async reject(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') approvalId: string,
    @Body() body: { reason?: string },
  ) {
    return this.approvals.reject(
      approvalId,
      { actorId: user.actorId, actorRole: user.actorRole },
      body?.reason,
    );
  }

  @Roles(...ROLE_GROUPS.finance_senior)
  @Mfa()
  @Post(':id/execute')
  async execute(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') approvalId: string,
  ) {
    return this.approvals.execute(approvalId, {
      actorId: user.actorId,
      actorRole: user.actorRole,
    });
  }

  @Roles(...ROLE_GROUPS.read_finance)
  @Get(':id')
  async get(@Param('id') approvalId: string) {
    return this.approvals.get(approvalId);
  }

  @Roles(...ROLE_GROUPS.read_finance)
  @Get()
  async list(
    @Query('status') status?: ApprovalStatus,
    @Query('actionCode') actionCode?: string,
  ) {
    return this.approvals.list({ status, actionCode });
  }
}
