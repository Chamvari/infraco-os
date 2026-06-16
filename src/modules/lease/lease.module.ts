import { Module } from '@nestjs/common';
import { LeaseController } from './lease.controller';
import { LeaseService } from './lease.service';
import { AccountModule } from '../account/account.module';
import { PaymentsModule } from '../payments/payments.module';
import { LedgerModule } from '../financial/ledger.module';
import { PrismaService } from '../../prisma.service';

/**
 * Module C — Leasing & Tenancy (SRS §6).
 *
 * Builds on the financial core: provisions rental accounts (AccountModule),
 * raises bills on the Payments Platform (PaymentsModule / Module H), and posts
 * rent invoices into the unified ledger with arrears recompute (LedgerModule).
 */
@Module({
  imports: [AccountModule, PaymentsModule, LedgerModule],
  controllers: [LeaseController],
  providers: [LeaseService, PrismaService],
  exports: [LeaseService],
})
export class LeaseModule {}
