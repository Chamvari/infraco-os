import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuthModule } from './modules/auth/auth.module';
import { CustomerModule } from './modules/customer/customer.module';
import { AccountModule } from './modules/account/account.module';
import { FinancialModule } from './modules/financial/financial.module';
import { AccountingModule } from './modules/financial/accounting.module';
import { SalesModule } from './modules/sales/sales.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { LeaseModule } from './modules/lease/lease.module';
import { ArrearsModule } from './modules/financial/arrears.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { UtilityModule } from './modules/utility/utility.module';
import { ApprovalModule } from './modules/approvals/approval.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    // Redis-backed job queue (SMS delivery, future billing/utility events).
    // Connection is read from process.env directly (no @nestjs/config), matching
    // the rest of the codebase. Defaults to localhost for dev.
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
        retryStrategy: (times: number) => Math.min(times * 500, 5000),
      },
    }),
    AuthModule,
    CustomerModule,
    AccountModule,
    FinancialModule,
    AccountingModule,
    SalesModule,
    PaymentsModule,
    ReportingModule,
    LeaseModule,
    ArrearsModule,
    OnboardingModule,
    UtilityModule,
    ApprovalModule,
    NotificationsModule,
  ],
})
export class AppModule {}
