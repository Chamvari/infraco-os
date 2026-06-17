import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { PrismaService } from '../../prisma.service';

/**
 * Module A — accounting layer (FIN-ACC-001..010). Depends only on the database,
 * so it sits at the base of the dependency graph alongside the ledger: the
 * instalment engine and the payment callback both auto-post journals through it
 * (FIN-ACC-002) with no circular imports.
 */
@Module({
  controllers: [AccountingController],
  providers: [AccountingService, PrismaService],
  exports: [AccountingService],
})
export class AccountingModule {}
