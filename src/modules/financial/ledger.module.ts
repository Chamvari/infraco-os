import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { PrismaService } from '../../prisma.service';
import { AccountingModule } from './accounting.module';

/**
 * Module A — unified ledger & reconciliation (SRS §4.5). Depends only on the
 * database, so it sits at the base of the dependency graph (Payments and the
 * instalment engine both build on it) with no circular imports.
 */
@Module({
  imports: [AccountingModule],
  controllers: [LedgerController],
  providers: [LedgerService, PrismaService],
  exports: [LedgerService],
})
export class LedgerModule {}
