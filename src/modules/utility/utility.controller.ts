import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UtilityService } from './utility.service';
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
 * actorId / actorRole arrive in the body for now (Phase 1 scaffold).
 */
@Controller()
export class UtilityController {
  constructor(private readonly utility: UtilityService) {}

  // -- Setup ------------------------------------------------------------------

  // POST /meters
  @Post('meters')
  async createMeter(@Body() body: CreateMeterDto) {
    return this.utility.createMeter(body);
  }

  // GET /meters
  @Get('meters')
  async listMeters() {
    return this.utility.listMeters();
  }

  // POST /tariffs
  @Post('tariffs')
  async createTariff(@Body() body: CreateTariffDto) {
    return this.utility.createTariff(body);
  }

  // -- Prepaid vending (UTIL-TKN) — customer billing plane --------------------

  // POST /utility/vend  (direct agent/admin vend; the Payments callback also drives this)
  @Post('utility/vend')
  async vend(@Body() body: VendDto) {
    return this.utility.vend(body);
  }

  // -- Private LTE (UTIL-LTE) — customer billing plane ------------------------

  // POST /lte/products
  @Post('lte/products')
  async createLteProduct(@Body() body: CreateLteProductDto) {
    return this.utility.createLteProduct(body);
  }

  // POST /lte/subscribers
  @Post('lte/subscribers')
  async createSubscriber(@Body() body: CreateSubscriberDto) {
    return this.utility.createSubscriber(body);
  }

  // POST /lte/purchases  (direct purchase; the Payments callback also drives this)
  @Post('lte/purchases')
  async purchaseLte(@Body() body: LtePurchaseDto) {
    return this.utility.purchaseLte(body);
  }

  // POST /lte/purchases/:id/retry  (UTIL-LTE-003 provisioning retry)
  @Post('lte/purchases/:id/retry')
  async retryProvision(@Param('id') id: string, @Body() body: RetryProvisionDto) {
    return this.utility.retryProvision(id, body);
  }

  // -- Wholesale / grid settlement (UTIL-GRID) — SEPARATE plane ---------------

  // POST /grid/exchange  (ZESA net-metering; wholesale only, no customer link)
  @Post('grid/exchange')
  async recordGridExchange(@Body() body: GridExchangeDto) {
    return this.utility.recordGridExchange(body);
  }
}
