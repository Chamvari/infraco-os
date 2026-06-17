import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { CurrentUser, Roles, Mfa } from '../auth/auth.decorators';
import { AuthPrincipal } from '../auth/auth.types';
import { ROLE_GROUPS } from '../../common/roles';

/**
 * Unified ledger & reconciliation endpoints (SRS §4.5, FIN-LED-001..005).
 * actorId / actorRole are taken from the verified JWT principal (PLAT-AUTH-003).
 */
@Controller()
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  // GET /accounts/:id/ledger  (FIN-LED-001)
  @Roles(...ROLE_GROUPS.read_finance)
  @Get('accounts/:id/ledger')
  async accountLedger(@Param('id') accountId: string) {
    return this.ledger.getAccountLedger(accountId);
  }

  // POST /suspense/:id/resolve  (FIN-LED-003 — manual allocation)
  @Roles(...ROLE_GROUPS.finance)
  @Post('suspense/:id/resolve')
  async resolveSuspense(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') suspenseId: string,
    @Body()
    body: {
      accountId: string;
      invoiceId: string;
      narrative?: string;
    },
  ) {
    return this.ledger.resolveSuspense(
      {
        suspenseId,
        accountId: body.accountId,
        invoiceId: body.invoiceId,
        narrative: body.narrative,
      },
      { actorId: user.actorId, actorRole: user.actorRole },
    );
  }

  // POST /ledger/adjustment  (FIN-LED-005 — dual authorisation + sensitive: MFA)
  // Dual authorisation is governed by the DoA workflow (PLAT-AUTH-005): for a
  // high-value adjustment the caller first initiates an approval (POST /approvals),
  // a distinct second signatory approves it, and the resulting approvalId is
  // supplied here. Below-threshold adjustments need no approvalId.
  @Roles(...ROLE_GROUPS.finance_senior)
  @Mfa()
  @Post('ledger/adjustment')
  async adjustment(
    @CurrentUser() user: AuthPrincipal,
    @Body()
    body: {
      accountId: string;
      invoiceId?: string;
      txnType: 'debit' | 'credit';
      amount: number;
      kind: 'credit_note' | 'write_off' | 'correction';
      currency?: 'USD' | 'ZIG' | 'GBP' | 'ZAR' | 'EUR' | 'AUD';
      narrative: string;
      approvalId?: string;
    },
  ) {
    return this.ledger.postManualAdjustment(
      {
        accountId: body.accountId,
        invoiceId: body.invoiceId,
        txnType: body.txnType,
        amount: body.amount,
        kind: body.kind,
        currency: body.currency,
        narrative: body.narrative,
        approvalId: body.approvalId,
      },
      { actorId: user.actorId, actorRole: user.actorRole },
    );
  }

  // GET /reconciliation  (FIN-LED-004)
  @Roles(...ROLE_GROUPS.read_finance)
  @Get('reconciliation')
  async reconciliation() {
    return this.ledger.reconciliationReport();
  }

  // POST /accounts/:id/recompute  (FIN-INST-004 — balance/arrears/next-due)
  @Roles(...ROLE_GROUPS.finance)
  @Post('accounts/:id/recompute')
  async recompute(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') accountId: string,
    @Body() body: { asOf?: string },
  ) {
    return this.ledger.recomputeAccount(
      accountId,
      { actorId: user.actorId, actorRole: user.actorRole },
      body.asOf ? new Date(body.asOf) : undefined,
    );
  }
}
