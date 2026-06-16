import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { LedgerService } from './ledger.service';

/**
 * Unified ledger & reconciliation endpoints (SRS §4.5, FIN-LED-001..005).
 * actorId / actorRole arrive in the body for now (Phase 1 scaffold).
 */
@Controller()
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  // GET /accounts/:id/ledger  (FIN-LED-001)
  @Get('accounts/:id/ledger')
  async accountLedger(@Param('id') accountId: string) {
    return this.ledger.getAccountLedger(accountId);
  }

  // POST /suspense/:id/resolve  (FIN-LED-003 — manual allocation)
  @Post('suspense/:id/resolve')
  async resolveSuspense(
    @Param('id') suspenseId: string,
    @Body()
    body: {
      accountId: string;
      invoiceId: string;
      narrative?: string;
      actorId: string;
      actorRole: string;
    },
  ) {
    return this.ledger.resolveSuspense(
      {
        suspenseId,
        accountId: body.accountId,
        invoiceId: body.invoiceId,
        narrative: body.narrative,
      },
      { actorId: body.actorId, actorRole: body.actorRole },
    );
  }

  // POST /ledger/adjustment  (FIN-LED-005 — dual authorisation required)
  @Post('ledger/adjustment')
  async adjustment(
    @Body()
    body: {
      accountId: string;
      invoiceId?: string;
      txnType: 'debit' | 'credit';
      amount: number;
      kind: 'credit_note' | 'write_off' | 'correction';
      currency?: 'USD' | 'ZIG' | 'GBP' | 'ZAR' | 'EUR' | 'AUD';
      narrative: string;
      authoriserId: string;
      authoriserRole: string;
      actorId: string;
      actorRole: string;
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
        authoriserId: body.authoriserId,
        authoriserRole: body.authoriserRole,
      },
      { actorId: body.actorId, actorRole: body.actorRole },
    );
  }

  // GET /reconciliation  (FIN-LED-004)
  @Get('reconciliation')
  async reconciliation() {
    return this.ledger.reconciliationReport();
  }

  // POST /accounts/:id/recompute  (FIN-INST-004 — balance/arrears/next-due)
  @Post('accounts/:id/recompute')
  async recompute(
    @Param('id') accountId: string,
    @Body() body: { asOf?: string; actorId: string; actorRole: string },
  ) {
    return this.ledger.recomputeAccount(
      accountId,
      { actorId: body.actorId, actorRole: body.actorRole },
      body.asOf ? new Date(body.asOf) : undefined,
    );
  }
}
