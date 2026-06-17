import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { PrismaService } from '../../prisma.service';
import { AccountingModule } from './accounting.module';
import { ApprovalModule } from '../approvals/approval.module';

/**
 * Module A — unified ledger & reconciliation (SRS §4.5). Depends on the
 * accounting layer and on the Delegation-of-Authority workflow (PLAT-AUTH-005),
 * which governs dual authorisation for manual adjustments (FIN-LED-005).
 */
@Module({
  imports: [AccountingModule, ApprovalModule],
  controllers: [LedgerController],
  providers: [LedgerService, PrismaService],
  exports: [LedgerService],
})
export class LedgerModule {}
