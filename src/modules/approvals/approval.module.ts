import { Module } from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { ApprovalController } from './approval.controller';
import { PrismaService } from '../../prisma.service';

/**
 * Module Z — Delegation-of-Authority dual-authorisation (PLAT-AUTH-005). Reads
 * the core.authority_rule matrix and drives the approval workflow. Depends only
 * on the database, so it sits at the base of the dependency graph and can be
 * imported by any module that needs to gate high-value transactions.
 */
@Module({
  controllers: [ApprovalController],
  providers: [ApprovalService, PrismaService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
