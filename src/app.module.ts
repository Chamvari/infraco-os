import { Module } from '@nestjs/common';
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

@Module({
  imports: [
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
  ],
})
export class AppModule {}
