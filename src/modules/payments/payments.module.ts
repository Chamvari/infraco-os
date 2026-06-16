import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { LedgerModule } from '../financial/ledger.module';
import { PrismaService } from '../../prisma.service';

@Module({
  // Module H posts callbacks through Module A's ledger + recomputes arrears.
  imports: [LedgerModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PrismaService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
