import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsProcessor } from './notifications.processor';
import { PrismaService } from '../../prisma.service';

/**
 * Module Z — notifications (PLAT-NOTIF-001/002). SMS/USSD via Africa's Talking,
 * with async delivery off the request thread (BullMQ) and delivery-status
 * logging to core.notification. The processor MUST be registered as a provider
 * or queued jobs would never be consumed.
 */
@Module({
  imports: [
    // Async SMS jobs processed off the main request thread.
    BullModule.registerQueue({
      name: 'notifications',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }),
  ],
  providers: [NotificationsService, NotificationsProcessor, PrismaService],
  controllers: [NotificationsController],
  exports: [NotificationsService], // re-exported so any module can inject it
})
export class NotificationsModule {}
