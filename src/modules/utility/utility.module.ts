import { Module } from '@nestjs/common';
import { UtilityController } from './utility.controller';
import { UtilityService } from './utility.service';
import { MeterAdapterRegistry, MockMeterAdapter } from './meter-adapter';
import { EasyMobileClient } from './easymobile.client';
import { PrismaService } from '../../prisma.service';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * UtilityModule — Module D (private-utility operator, SRS §7): prepaid vending,
 * private LTE, and wholesale grid settlement. Exports UtilityService so Module H
 * (Payments) can drive vends/LTE purchases from the payment callback.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [UtilityController],
  providers: [
    UtilityService,
    MockMeterAdapter,
    MeterAdapterRegistry,
    EasyMobileClient,
    PrismaService,
  ],
  exports: [UtilityService],
})
export class UtilityModule {}
