import { Module } from '@nestjs/common';
import { FinancialService } from './financial.service';
import { FinancialController } from './financial.controller';
import { PaymentsModule } from '../payments/payments.module';
import { LedgerModule } from './ledger.module';
import { AccountingModule } from './accounting.module';
import { PrismaService } from '../../prisma.service';

@Module({
  // Instalment engine raises bills via Module H, recomputes via the ledger, and
  // auto-posts revenue journals via the accounting layer (FIN-ACC-002).
  imports: [PaymentsModule, LedgerModule, AccountingModule],
  controllers: [FinancialController],
  providers: [FinancialService, PrismaService],
  exports: [FinancialService],
})
export class FinancialModule {}
