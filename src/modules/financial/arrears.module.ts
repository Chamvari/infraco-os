import { Module } from '@nestjs/common';
import { ArrearsService } from './arrears.service';
import { ArrearsController } from './arrears.controller';
import { PrismaService } from '../../prisma.service';

/**
 * Module A — arrears escalation engine (FIN-ARR-002). Depends only on the
 * database (reads live invoice state, writes fin.arrears_action + notifications),
 * so it has no circular imports.
 */
@Module({
  controllers: [ArrearsController],
  providers: [ArrearsService, PrismaService],
  exports: [ArrearsService],
})
export class ArrearsModule {}
