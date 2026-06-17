import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CreateCustomerDto, UpdateCustomerDto, LinkWalletDto } from './customer.dto';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthPrincipal } from '../auth/auth.types';
import { ROLE_GROUPS } from '../../common/roles';

/**
 * Customer registry endpoints (SRS §4.1, FIN-CUST-001..004).
 * actorId / actorRole are taken from the verified JWT principal (PLAT-AUTH-003)
 * and override anything in the request body.
 */
@Controller('customers')
export class CustomerController {
  constructor(private readonly customers: CustomerService) {}

  private withActor<T>(user: AuthPrincipal, body: T): T {
    return { ...body, actorId: user.actorId, actorRole: user.actorRole };
  }

  // POST /customers  (FIN-CUST-001/003/004)
  @Roles(...ROLE_GROUPS.registry)
  @Post()
  async create(@CurrentUser() user: AuthPrincipal, @Body() body: CreateCustomerDto) {
    return this.customers.createCustomer(this.withActor(user, body));
  }

  // PATCH /customers/:id  (FIN-CUST-001/003 — incl. KYC + DPA consent updates)
  @Roles(...ROLE_GROUPS.registry)
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() body: UpdateCustomerDto,
  ) {
    return this.customers.updateCustomer(id, this.withActor(user, body));
  }

  // POST /customers/:id/wallet  (FIN-CUST-001 / PAY-API-007 wallet linking)
  @Roles(...ROLE_GROUPS.registry)
  @Post(':id/wallet')
  async linkWallet(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() body: LinkWalletDto,
  ) {
    return this.customers.linkWallet(id, this.withActor(user, body));
  }
}
