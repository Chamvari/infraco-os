import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AccountService } from './account.service';
import { CreateAccountDto } from './account.dto';

/**
 * Account registry endpoints (SRS §4.1, FIN-CUST-002).
 */
@Controller()
export class AccountController {
  constructor(private readonly accounts: AccountService) {}

  // POST /accounts  (FIN-CUST-002 — one of stand/agro/rental/utility)
  @Post('accounts')
  async create(@Body() body: CreateAccountDto) {
    return this.accounts.createAccount(body);
  }

  // GET /customers/:id/accounts
  @Get('customers/:id/accounts')
  async listForCustomer(@Param('id') customerId: string) {
    return this.accounts.listForCustomer(customerId);
  }
}
