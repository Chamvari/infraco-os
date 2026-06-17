import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AccountingService, JournalEntry } from './accounting.service';
import { CurrentUser, Roles, Mfa } from '../auth/auth.decorators';
import { AuthPrincipal } from '../auth/auth.types';
import { ROLE_GROUPS } from '../../common/roles';
import { AccountClass, AssetClass } from '../../common/enums';

/**
 * Accounting-layer endpoints — Module A (FIN-ACC-001..009). Management accounts
 * (trial balance, P&L, balance sheet) are read-side and visible to read_finance
 * (finance, exec, internal_audit). Posting/reversing journals and closing
 * periods are finance writes; closing a period is senior + MFA (FIN-ACC-007).
 */
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  // ---- Chart of accounts (FIN-ACC-001) -------------------------------------

  @Roles(...ROLE_GROUPS.read_finance)
  @Get('accounts')
  async accounts(
    @Query('accountClass') accountClass?: AccountClass,
    @Query('assetClass') assetClass?: AssetClass,
  ) {
    return this.accounting.listAccounts({ accountClass, assetClass });
  }

  @Roles(...ROLE_GROUPS.finance_senior)
  @Post('accounts')
  async createAccount(
    @CurrentUser() user: AuthPrincipal,
    @Body()
    body: {
      code: string;
      name: string;
      accountClass: AccountClass;
      assetClass?: AssetClass;
      parentCode?: string;
      isPostable?: boolean;
    },
  ) {
    return this.accounting.createAccount(body, {
      actorId: user.actorId,
      actorRole: user.actorRole,
    });
  }

  // ---- Journals (FIN-ACC-002/006) ------------------------------------------

  @Roles(...ROLE_GROUPS.finance)
  @Post('journals')
  async postJournal(@CurrentUser() user: AuthPrincipal, @Body() body: JournalEntry) {
    return this.accounting.postJournal(body, {
      actorId: user.actorId,
      actorRole: user.actorRole,
    });
  }

  // FIN-ACC-006 — reversal only; no deletion. Sensitive → MFA.
  @Roles(...ROLE_GROUPS.finance_senior)
  @Mfa()
  @Post('journals/:id/reverse')
  async reverse(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') journalId: string,
    @Body() body: { reason?: string },
  ) {
    return this.accounting.reverseJournal(
      journalId,
      { actorId: user.actorId, actorRole: user.actorRole },
      body?.reason,
    );
  }

  // ---- Management accounts (FIN-ACC-003/004/007/009) -----------------------

  @Roles(...ROLE_GROUPS.read_finance)
  @Get('trial-balance')
  async trialBalance(@Query('year') year: string, @Query('month') month?: string) {
    return this.accounting.trialBalance({
      year: Number(year),
      month: month ? Number(month) : undefined,
    });
  }

  @Roles(...ROLE_GROUPS.read_finance)
  @Get('pnl')
  async pnl(
    @Query('year') year: string,
    @Query('month') month?: string,
    @Query('assetClass') assetClass?: AssetClass,
  ) {
    return this.accounting.profitAndLoss({
      year: Number(year),
      month: month ? Number(month) : undefined,
      assetClass,
    });
  }

  @Roles(...ROLE_GROUPS.read_finance)
  @Get('balance-sheet')
  async balanceSheet(
    @Query('asOf') asOf?: string,
    @Query('assetClass') assetClass?: AssetClass,
  ) {
    return this.accounting.balanceSheet({ asOf, assetClass });
  }

  // FIN-ACC-008 — journal export for external consolidation.
  @Roles(...ROLE_GROUPS.read_finance)
  @Get('journals/export')
  async exportJournals(@Query('year') year: string, @Query('month') month?: string) {
    return this.accounting.exportJournalsCsv({
      year: Number(year),
      month: month ? Number(month) : undefined,
    });
  }

  // FIN-ACC-007 — close (lock) a period. Senior finance + MFA.
  @Roles(...ROLE_GROUPS.finance_senior)
  @Mfa()
  @Post('periods/:year/:month/close')
  async closePeriod(
    @CurrentUser() user: AuthPrincipal,
    @Param('year') year: string,
    @Param('month') month: string,
  ) {
    return this.accounting.closePeriod(
      { year: Number(year), month: Number(month) },
      { actorId: user.actorId, actorRole: user.actorRole },
    );
  }
}
