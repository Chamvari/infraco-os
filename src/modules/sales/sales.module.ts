import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { PrismaService } from '../../prisma.service';
import { FinancialModule } from '../financial/financial.module';

@Module({
  // Sale conversion composes the instalment engine to build the payment schedule.
  imports: [FinancialModule],
  controllers: [SalesController],
  providers: [SalesService, PrismaService],
  exports: [SalesService],
})
export class SalesModule {}
