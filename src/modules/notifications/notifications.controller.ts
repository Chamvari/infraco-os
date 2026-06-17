/**
 * NotificationsController
 *
 * Webhook endpoints that Africa's Talking calls server-to-server:
 *   POST /notifications/ussd    — USSD session callback
 *   POST /notifications/sms/dlr — SMS delivery report
 *
 * Both are PUBLIC (no JWT) — AT calls them server-to-server; in production they
 * are additionally protected by an Nginx IP allowlist (AT IP ranges).
 */

import { Controller, Post, Body, HttpCode, Logger } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Public } from '../auth/auth.decorators'; // Module Z JWT bypass

@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly svc: NotificationsService) {}

  /**
   * Africa's Talking USSD webhook.
   * AT sends: sessionId, phoneNumber, networkCode, serviceCode, text.
   * We respond with plain text: "CON ..." (continue) or "END ..." (terminate).
   */
  @Public()
  @Post('ussd')
  @HttpCode(200)
  async handleUssd(
    @Body('sessionId') sessionId: string,
    @Body('phoneNumber') phoneNumber: string,
    @Body('text') text: string,
  ): Promise<string> {
    this.logger.debug(`USSD: session=${sessionId} phone=${phoneNumber} text="${text}"`);
    return this.svc.handleUssd({ sessionId, phoneNumber, text });
  }

  /**
   * Africa's Talking SMS delivery report webhook.
   * AT sends: id (provider message id), status, phoneNumber, failureReason.
   * Updates the matching core.notification row (PLAT-NOTIF-002).
   */
  @Public()
  @Post('sms/dlr')
  @HttpCode(200)
  async handleDeliveryReport(
    @Body('id') messageId: string,
    @Body('status') status: string,
    @Body('phoneNumber') phoneNumber: string,
    @Body('failureReason') failureReason?: string,
  ) {
    this.logger.log(
      `SMS DLR: id=${messageId} status=${status} to=${phoneNumber}${failureReason ? ` reason=${failureReason}` : ''}`,
    );
    const { updated } = await this.svc.recordDeliveryReport(messageId, status, failureReason);
    return { received: true, updated };
  }
}
