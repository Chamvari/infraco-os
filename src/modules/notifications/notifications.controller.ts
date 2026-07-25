/**
 * NotificationsController
 *
 * Inbound carrier webhooks (server-to-server):
 *   POST /notifications/ussd    — USSD session callback
 *   POST /notifications/sms/dlr — SMS delivery report
 *
 * Both are PUBLIC (no JWT). NOTE: the active provider is SMSPop, which is
 * SMS-only and does not drive USSD or post per-message DLRs — so these routes
 * are retained but currently unwired. Keep them behind an Nginx IP allowlist
 * once a provider that calls them is configured.
 */

import { Controller, Post, Body, HttpCode, Logger } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Public } from '../auth/auth.decorators'; // Module Z JWT bypass

@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly svc: NotificationsService) {}

  /**
   * USSD session webhook (provider-agnostic shape).
   * Provider sends: sessionId, phoneNumber, networkCode, serviceCode, text.
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
   * SMS delivery-report webhook (provider-agnostic shape).
   * Provider sends: id (provider message id), status, phoneNumber, failureReason.
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
