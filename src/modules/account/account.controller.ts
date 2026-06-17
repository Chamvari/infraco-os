import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AccountService } from './account.service';
import { CreateAccountDto } from './account.dto';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthPrincipal } from '../auth/auth.types';
import { ROLE_GROUPS } from '../../common/roles';

/**
 * Account registry endpoints (SRS §4.1, FIN-CUST-002).
 * actorId / actorRole are taken from the verified JWT principal (PLAT-AUTH-003).
 */
@Controller()
export class AccountController {
  constructor(private readonly accounts: AccountService) {}

  // POST /accounts  (FIN-CUST-002 — one of stand/agro/rental/utility)
  @Roles(...ROLE_GROUPS.finance)
  @Post('accounts')
  async create(@CurrentUser() user: AuthPrincipal, @Body() body: CreateAccountDto) {
    return this.accounts.createAccount({
      ...body,
      actorId: user.actorId,
      actorRole: user.actorRole,
    });
  }

  // GET /customers/:id/accounts
  @Roles(...ROLE_GROUPS.read_finance)
  @Get('customers/:id/accounts')
  async listForCustomer(@Param('id') customerId: string) {
    return this.accounts.listForCustomer(customerId);
  }
}
