import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UtilityService } from './utility.service';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthPrincipal } from '../auth/auth.types';
import { ROLE_GROUPS } from '../../common/roles';
import {
  CreateLteProductDto,
  CreateMeterDto,
  CreateSubscriberDto,
  CreateTariffDto,
  GridExchangeDto,
  LtePurchaseDto,
  RetryProvisionDto,
  VendDto,
} from './utility.dto';

/**
 * Module D — private-utility operator endpoints (SRS §7).
 * Customer billing plane: meters, tariffs, vending, LTE. Wholesale plane:
 * grid-exchange (kept strictly separate; never a customer account).
 *
 * Identity (actorId/actorRole) is sourced from the verified JWT principal via
 * withActor() and overrides anything in the request body — clients can no longer
 * assert who they are (PLAT-AUTH-003).
 */
@Controller()
export class UtilityController {
  constructor(private readonly utility: UtilityService) {}

  /** Server-side identity, overriding any client-supplied actor fields. */
  private withActor<T>(user: AuthPrincipal, body: T): T {
    return { ...body, actorId: user.actorId, actorRole: user.actorRole };
  }

  // -- Setup ------------------------------------------------------------------

  // POST /meters
  @Roles(...ROLE_GROUPS.operations)
  @Post('meters')
  async createMeter(@CurrentUser() user: AuthPrincipal, @Body() body: CreateMeterDto) {
    return this.utility.createMeter(this.withActor(user, body));
  }

  // GET /meters
  @Roles(...ROLE_GROUPS.read_operations)
  @Get('meters')
  async listMeters() {
    return this.utility.listMeters();
  }

  // POST /tariffs
  @Roles(...ROLE_GROUPS.operations)
  @Post('tariffs')
  async createTariff(@CurrentUser() user: AuthPrincipal, @Body() body: CreateTariffDto) {
    return this.utility.createTariff(this.withActor(user, body));
  }

  // -- Prepaid vending (UTIL-TKN) — customer billing plane --------------------

  // POST /utility/vend  (direct agent/admin vend; the Payments callback also drives this)
  @Roles(...ROLE_GROUPS.operations)
  @Post('utility/vend')
  async vend(@CurrentUser() user: AuthPrincipal, @Body() body: VendDto) {
    return this.utility.vend(this.withActor(user, body));
  }

  // -- Private LTE (UTIL-LTE) — customer billing plane ------------------------

  // POST /lte/products
  @Roles(...ROLE_GROUPS.operations)
  @Post('lte/products')
  async createLteProduct(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: CreateLteProductDto,
  ) {
    return this.utility.createLteProduct(this.withActor(user, body));
  }

  // POST /lte/subscribers
  @Roles(...ROLE_GROUPS.operations)
  @Post('lte/subscribers')
  async createSubscriber(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: CreateSubscriberDto,
  ) {
    return this.utility.createSubscriber(this.withActor(user, body));
  }

  // POST /lte/purchases  (direct purchase; the Payments callback also drives this)
  @Roles(...ROLE_GROUPS.operations)
  @Post('lte/purchases')
  async purchaseLte(@CurrentUser() user: AuthPrincipal, @Body() body: LtePurchaseDto) {
    return this.utility.purchaseLte(this.withActor(user, body));
  }

  // POST /lte/purchases/:id/retry  (UTIL-LTE-003 provisioning retry)
  @Roles(...ROLE_GROUPS.operations)
  @Post('lte/purchases/:id/retry')
  async retryProvision(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body() body: RetryProvisionDto,
  ) {
    return this.utility.retryProvision(id, this.withActor(user, body));
  }

  // -- Wholesale / grid settlement (UTIL-GRID) — SEPARATE plane ---------------

  // POST /grid/exchange  (ZESA net-metering; wholesale only, no customer link)
  @Roles(...ROLE_GROUPS.wholesale)
  @Post('grid/exchange')
  async recordGridExchange(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: GridExchangeDto,
  ) {
    return this.utility.recordGridExchange(this.withActor(user, body));
  }
}
