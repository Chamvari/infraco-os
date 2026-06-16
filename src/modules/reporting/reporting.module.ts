import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [ReportingController],
  providers: [ReportingService, PrismaService],
  exports: [ReportingService],
})
export class ReportingModule {}
