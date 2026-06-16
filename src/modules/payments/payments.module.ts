import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { LedgerModule } from '../financial/ledger.module';
import { UtilityModule } from '../utility/utility.module';
import { PrismaService } from '../../prisma.service';

@Module({
  // Module H posts callbacks through Module A's ledger + recomputes arrears, and
  // routes utility-vend / LTE callbacks to Module D (UtilityService).
  imports: [LedgerModule, UtilityModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PrismaService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
