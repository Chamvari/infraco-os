import { Module } from '@nestjs/common';
import { FinancialService } from './financial.service';
import { FinancialController } from './financial.controller';
import { PaymentsModule } from '../payments/payments.module';
import { LedgerModule } from './ledger.module';
import { PrismaService } from '../../prisma.service';

@Module({
  // Instalment engine raises bills via Module H and recomputes via the ledger.
  imports: [PaymentsModule, LedgerModule],
  controllers: [FinancialController],
  providers: [FinancialService, PrismaService],
  exports: [FinancialService],
})
export class FinancialModule {}
