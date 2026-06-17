/**
 * NotificationsProcessor
 *
 * BullMQ worker that processes queued SMS jobs off the main API thread.
 *
 * Queue jobs:
 *   'sms'      — single SMS send (carries notificationId for status updates)
 *   'sms_bulk' — batch SMS (up to 1,000 recipients per job)
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationsService } from './notifications.service';

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private readonly svc: NotificationsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'sms':
        await this.processSingleSms(job);
        break;
      case 'sms_bulk':
        await this.processBulkSms(job);
        break;
      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
    }
  }

  private async processSingleSms(
    job: Job<{
      to: string | string[];
      message: string;
      senderId?: string;
      notificationId?: string | null;
    }>,
  ) {
    const { to, message, senderId, notificationId } = job.data;
    this.logger.debug(`Processing SMS job=${job.id} to=${JSON.stringify(to)}`);

    const result = await this.svc._sendImmediate(to, message, senderId);

    // PLAT-NOTIF-002 — reflect the delivery outcome on the persisted record.
    if (notificationId) {
      await this.svc.recordDeliveryResult(
        notificationId,
        result.status === 'sent' ? 'sent' : 'failed',
        result.messageId,
      );
    }

    if (result.status === 'failed') {
      throw new Error(`SMS send failed for job=${job.id}`); // triggers BullMQ retry
    }
    this.logger.log(`SMS job=${job.id} delivered msgId=${result.messageId} cost=${result.cost}`);
  }

  private async processBulkSms(
    job: Job<{ to: string[]; message: string; senderId?: string }>,
  ) {
    const { to, message, senderId } = job.data;
    this.logger.log(`Processing bulk SMS job=${job.id} recipients=${to.length}`);
    const result = await this.svc._sendImmediate(to, message, senderId);
    this.logger.log(`Bulk SMS job=${job.id} status=${result.status}`);
  }
}
