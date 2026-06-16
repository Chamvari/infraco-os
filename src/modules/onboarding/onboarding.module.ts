import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { CustomerModule } from '../customer/customer.module';
import { PrismaService } from '../../prisma.service';

/**
 * OnboardingModule — Module A front door (SRS §4.1a). Builds on CustomerModule
 * for the registry write (FIN-CUST-001..004) and adds document upload, the
 * reviewable KYC step, and the contractor register feed.
 */
@Module({
  imports: [CustomerModule],
  controllers: [OnboardingController],
  providers: [OnboardingService, PrismaService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
