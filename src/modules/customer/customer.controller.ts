import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CreateCustomerDto, UpdateCustomerDto, LinkWalletDto } from './customer.dto';

/**
 * Customer registry endpoints (SRS §4.1, FIN-CUST-001..004).
 * actorId / actorRole arrive in the body for now (Phase 1 scaffold); a Module Z
 * auth guard will supply them from the authenticated principal later.
 */
@Controller('customers')
export class CustomerController {
  constructor(private readonly customers: CustomerService) {}

  // POST /customers  (FIN-CUST-001/003/004)
  @Post()
  async create(@Body() body: CreateCustomerDto) {
    return this.customers.createCustomer(body);
  }

  // PATCH /customers/:id  (FIN-CUST-001/003 — incl. KYC + DPA consent updates)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: UpdateCustomerDto) {
    return this.customers.updateCustomer(id, body);
  }

  // POST /customers/:id/wallet  (FIN-CUST-001 / PAY-API-007 wallet linking)
  @Post(':id/wallet')
  async linkWallet(@Param('id') id: string, @Body() body: LinkWalletDto) {
    return this.customers.linkWallet(id, body);
  }
}
