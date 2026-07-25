/**
 * NotificationsService — Module Z notifications (PLAT-NOTIF-001/002).
 *
 * Channels:
 *   - SMS  via the active SmsProvider (SMSPop) — see sms-provider.ts
 *   - USSD handler retained (menu logic); its inbound webhook is provider-specific
 *     and currently unwired (SMSPop is SMS-only) — see notifications.controller.ts.
 *
 * Design:
 *   - All sends are async by default — queued via BullMQ (attempts:3, exp backoff),
 *     never block the request thread. enqueue:false forces an immediate send.
 *   - Every send with a known recipient is persisted to core.notification with a
 *     delivery status (queued → sent / failed), updated by the queue processor
 *     (PLAT-NOTIF-002). Per-message carrier DLR from SMSPop is not yet available.
 *   - The concrete carrier lives behind SmsProvider (env-selected); this service
 *     never talks to a carrier SDK directly. Missing provider credentials degrade
 *     to stub/no-send rather than throwing, so the app/tests boot without creds.
 *
 * SRS refs: PLAT-NOTIF-001 (multi-channel notifications), PLAT-NOTIF-002 (delivery
 *           status logging), UTIL-TKN-002 (token SMS), ONB welcome SMS.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma.service';
import { SmsProviderRegistry } from './sms-provider';

// ── Types ────────────────────────────────────────────────────

/** A persisted recipient — core.notification.recipient_id is a NOT NULL uuid. */
export interface NotificationRecipient {
  kind: 'customer' | 'user' | 'contractor';
  id: string; // uuid
}

export interface SmsPayload {
  to: string | string[]; // E.164 format: +263771234567
  message: string;
  senderId?: string; // override default sender
  enqueue?: boolean; // true = queue (default), false = send immediately
  recipient?: NotificationRecipient; // persisted to core.notification when present
  templateCode?: string; // core.notification.template_code (defaults to 'RAW')
}

export interface UssdResponse {
  sessionId: string;
  phoneNumber: string;
  text: string; // accumulated USSD input chain
}

export interface SmsResult {
  messageId: string;
  status: 'queued' | 'sent' | 'failed';
  recipient: string;
  cost?: string; // e.g. "KES 0.8000"
}

export type NotificationTemplate =
  | 'WELCOME'
  | 'TOKEN_VEND'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_DUE'
  | 'PAYMENT_OVERDUE'
  | 'LEASE_RENEWAL'
  | 'UTILITY_LOW_BALANCE'
  | 'LTE_DATA_LOW'
  | 'LTE_DATA_EXHAUSTED'
  | 'SOLAR_CREDIT_UPDATED'
  | 'ONBOARDING_COMPLETE'
  | 'STAND_ALLOCATED'
  | 'OTP';

// ── Template registry ─────────────────────────────────────────

const TEMPLATES: Record<NotificationTemplate, (vars: Record<string, string>) => string> = {
  WELCOME: (v) =>
    `Welcome to InfraCo, ${v.name}! Your account is active. Stand: ${v.standRef}. For support call ${v.supportLine || '0800 INFRACO'}.`,

  TOKEN_VEND: (v) =>
    `InfraCo Power: Token ${v.token} | Units: ${v.units} kWh | Meter: ${v.meterNo} | Amount: ${v.currency}${v.amount}. Valid immediately.`,

  PAYMENT_RECEIVED: (v) =>
    `InfraCo: Payment of ${v.currency}${v.amount} received on ${v.date}. Ref: ${v.ref}. Balance: ${v.currency}${v.balance}. Thank you.`,

  PAYMENT_DUE: (v) =>
    `InfraCo: ${v.currency}${v.amount} due on ${v.dueDate} for ${v.description}. Pay via EcoCash *151*2*5*${v.accountNo}# or the InfraCo app.`,

  PAYMENT_OVERDUE: (v) =>
    `URGENT - InfraCo: ${v.currency}${v.amount} is ${v.daysOverdue} days overdue. Ref: ${v.invoiceNo}. Pay now to avoid service suspension. Call ${v.supportLine || '0800 INFRACO'}.`,

  LEASE_RENEWAL: (v) =>
    `InfraCo Leasing: Your lease for ${v.premises} expires ${v.expiryDate}. Renewal offer: ${v.currency}${v.newRent}/month. Reply YES to accept or call us.`,

  UTILITY_LOW_BALANCE: (v) =>
    `InfraCo Utilities: Low balance alert. Meter ${v.meterNo} has ${v.units} kWh remaining (~${v.daysLeft} days). Top up via the InfraCo app or *${v.ussdCode}#.`,

  LTE_DATA_LOW: (v) =>
    `Easy Mobile: ${v.dataRemaining} MB remaining on your ${v.bundleName} bundle (expires ${v.expiryDate}). Top up: *${v.ussdCode}# or InfraCo app.`,

  LTE_DATA_EXHAUSTED: (v) =>
    `Easy Mobile: Your ${v.bundleName} bundle is exhausted. Top up now to restore data: *${v.ussdCode}# or InfraCo app. Account: ${v.accountNo}.`,

  SOLAR_CREDIT_UPDATED: (v) =>
    `InfraCo Solar: Your net-metering credit updated. Exported: ${v.exported} kWh | Credit: ${v.currency}${v.credit} | Net balance: ${v.currency}${v.netBalance}.`,

  ONBOARDING_COMPLETE: (v) =>
    `Welcome to ${v.estateName}, ${v.name}! Your InfraCo account is fully active. Stand ${v.standRef} | Meter ${v.meterNo} | Support: ${v.supportLine || '0800 INFRACO'}.`,

  STAND_ALLOCATED: (v) =>
    `InfraCo: Stand ${v.standRef} (${v.area}m²) has been allocated to you in ${v.development}. Instalment plan: ${v.currency}${v.monthlyAmount}/month. Welcome!`,

  OTP: (v) =>
    `InfraCo security code: ${v.otp}. Valid for ${v.expiryMins || '10'} minutes. Do not share this code with anyone.`,
};

// ── USSD menu tree ────────────────────────────────────────────

const USSD_MENU = {
  root: `CON Welcome to InfraCo
1. Check balance
2. Buy electricity token
3. Buy data bundle
4. Pay instalment
5. My account`,

  balance: (name: string, balance: string, units: string) =>
    `END ${name}'s balances:
Wallet: USD ${balance}
Power: ${units} kWh remaining`,

  tokenMenu: `CON Buy electricity token
Enter amount in USD (min $1):`,

  tokenConfirm: (amount: string, units: string) =>
    `CON Buy ${units} kWh for USD ${amount}?
1. Confirm
2. Cancel`,

  tokenProcessing: `END Processing your token purchase. You will receive an SMS with your token within 30 seconds.`,

  dataMenu: `CON Easy Mobile data bundles:
1. Daily 100MB - $0.50
2. Weekly 500MB - $2.00
3. Monthly 2GB - $7.00
4. Monthly 5GB - $15.00`,

  payMenu: `CON Pay instalment
Enter your account number:`,

  invalid: `END Invalid option. Please dial again.`,
};

// ── Service ───────────────────────────────────────────────────

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly defaultSenderId = process.env.SMSPOP_SENDER_ID ?? 'InfraCo';
  private readonly ussdCode = process.env.USSD_CODE ?? '*384*57#';

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notifications') private readonly queue: Queue,
    private readonly providers: SmsProviderRegistry,
  ) {}

  // ── Public API ─────────────────────────────────────────────

  /**
   * Send an SMS using a named template. Enqueues by default; set enqueue:false
   * for critical immediate sends (e.g. prepaid token delivery, OTP).
   */
  async sendTemplate(
    template: NotificationTemplate,
    vars: Record<string, string>,
    payload: Omit<SmsPayload, 'message' | 'templateCode'>,
  ): Promise<SmsResult> {
    const message = TEMPLATES[template](vars);
    return this.sendSms({ ...payload, message, templateCode: template });
  }

  /**
   * Raw SMS send. Prefer sendTemplate() for consistency. When a recipient is
   * supplied the send is persisted to core.notification (PLAT-NOTIF-002).
   */
  async sendSms(payload: SmsPayload): Promise<SmsResult> {
    const { to, message, senderId, enqueue = true, recipient, templateCode } = payload;
    const recipientStr = Array.isArray(to) ? to.join(',') : to;

    const notificationId = await this.recordNotification({
      recipient,
      channel: 'sms',
      templateCode: templateCode ?? 'RAW',
      payload: { to, message },
      status: 'queued',
    });

    if (enqueue) {
      const job = await this.queue.add('sms', { to, message, senderId, notificationId });
      this.logger.debug(`SMS queued job=${job.id} to=${JSON.stringify(to)}`);
      return { messageId: String(job.id), status: 'queued', recipient: recipientStr };
    }

    const result = await this._sendImmediate(to, message, senderId);
    if (notificationId) {
      await this.recordDeliveryResult(
        notificationId,
        result.status === 'sent' ? 'sent' : 'failed',
        result.messageId,
      );
    }
    return result;
  }

  /**
   * Bulk SMS — e.g. estate-wide alerts, payment reminders for all debtors.
   * Chunks into batches of 1,000 (AT limit) and queues each batch. Bulk sends go
   * to raw phone lists (no per-recipient uuid), so they are not individually
   * persisted to core.notification.
   */
  async sendBulk(
    recipients: string[],
    message: string,
    senderId?: string,
  ): Promise<{ batches: number; totalRecipients: number }> {
    const BATCH_SIZE = 1000;
    const batches: string[][] = [];

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      batches.push(recipients.slice(i, i + BATCH_SIZE));
    }

    for (const batch of batches) {
      await this.queue.add(
        'sms_bulk',
        { to: batch, message, senderId },
        { priority: 2 }, // lower priority than individual sends
      );
    }

    this.logger.log(
      `Bulk SMS queued: ${batches.length} batches, ${recipients.length} recipients`,
    );
    return { batches: batches.length, totalRecipients: recipients.length };
  }

  /**
   * USSD session handler — called by the AT webhook on each user input.
   * Returns CON (continue) or END (terminate) response string.
   */
  async handleUssd(session: UssdResponse): Promise<string> {
    const { text } = session;
    const steps = text.split('*').filter(Boolean);

    this.logger.debug(`USSD session=${session.sessionId} steps=${JSON.stringify(steps)}`);

    if (!text || text === '') return USSD_MENU.root;

    const [step1, step2, step3] = steps;

    switch (step1) {
      case '1': // Check balance
        return USSD_MENU.balance('Resident', '45.00', '12.4');

      case '2': // Buy token
        if (!step2) return USSD_MENU.tokenMenu;
        if (!step3) return USSD_MENU.tokenConfirm(step2, (parseFloat(step2) * 10).toFixed(1));
        if (step3 === '1') return USSD_MENU.tokenProcessing;
        return `END Token purchase cancelled.`;

      case '3': // Data bundle
        if (!step2) return USSD_MENU.dataMenu;
        return `END Processing bundle purchase. You will receive an SMS confirmation shortly.`;

      case '4': // Pay instalment
        if (!step2) return USSD_MENU.payMenu;
        return `END Payment initiated for account ${step2}. You will receive an SMS confirmation.`;

      case '5': // My account
        return `END InfraCo Account\nFor account details, download the InfraCo app or call 0800 INFRACO.`;

      default:
        return USSD_MENU.invalid;
    }
  }

  // ── Persistence (PLAT-NOTIF-002) ───────────────────────────

  /**
   * Persist a notification to core.notification. recipient_id is NOT NULL, so we
   * only record when a recipient uuid is known; raw phone-only sends skip the log
   * (and a warning is left to the caller). Returns the notification_id, or null.
   */
  private async recordNotification(p: {
    recipient?: NotificationRecipient;
    channel: string;
    templateCode: string;
    payload: Record<string, unknown>;
    status: 'queued' | 'sent' | 'failed';
  }): Promise<string | null> {
    if (!p.recipient) return null;
    try {
      const rows = await this.prisma.$queryRawUnsafe<{ notification_id: string }[]>(
        `INSERT INTO core.notification
           (recipient_kind, recipient_id, channel, template_code, payload, status, sent_at)
         VALUES ($1, $2::uuid, $3, $4, $5::jsonb, $6, CASE WHEN $6 = 'sent' THEN now() ELSE NULL END)
         RETURNING notification_id::text AS notification_id`,
        p.recipient.kind,
        p.recipient.id,
        p.channel,
        p.templateCode,
        JSON.stringify(p.payload),
        p.status,
      );
      return rows[0]?.notification_id ?? null;
    } catch (err) {
      this.logger.error('Failed to record notification to core.notification', err as Error);
      return null;
    }
  }

  /**
   * Update a notification's delivery status after a send attempt. Called by the
   * queue processor and by the immediate-send path.
   */
  async recordDeliveryResult(
    notificationId: string,
    status: 'sent' | 'failed',
    providerMessageId?: string,
  ): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `UPDATE core.notification
          SET status = $2,
              sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END,
              payload = jsonb_set(coalesce(payload, '{}'::jsonb), '{providerMessageId}', to_jsonb($3::text))
        WHERE notification_id = $1::uuid`,
      notificationId,
      status,
      providerMessageId ?? null,
    );
  }

  /**
   * Apply a carrier delivery report (DLR webhook) to the matching notification,
   * correlated by the provider message id stored in payload. Provider-neutral;
   * SMSPop does not yet post per-message DLRs, so this path is currently unwired
   * for the active provider (retained for when SMSPop DLR is available).
   * Returns the number of rows updated.
   */
  async recordDeliveryReport(
    providerMessageId: string,
    atStatus: string,
    failureReason?: string,
  ): Promise<{ updated: number }> {
    const delivered = ['Success', 'Sent', 'Delivered', 'Buffered'].includes(atStatus);
    const status = delivered ? 'sent' : 'failed';
    const count = await this.prisma.$executeRawUnsafe(
      `UPDATE core.notification
          SET status = $2,
              sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END,
              payload = jsonb_set(
                jsonb_set(coalesce(payload, '{}'::jsonb), '{dlrStatus}', to_jsonb($3::text)),
                '{failureReason}', to_jsonb($4::text))
        WHERE payload->>'providerMessageId' = $1`,
      providerMessageId,
      status,
      atStatus,
      failureReason ?? null,
    );
    return { updated: Number(count) };
  }

  // ── Convenience shortcuts ──────────────────────────────────

  async sendTokenVendSms(
    to: string,
    token: string,
    units: string,
    meterNo: string,
    amount: string,
    currency = 'USD',
    recipient?: NotificationRecipient,
  ) {
    return this.sendTemplate(
      'TOKEN_VEND',
      { token, units, meterNo, amount, currency },
      // Queued: retry + persisted delivery status. The worker runs in-process,
      // so delivery is still effectively immediate — but never inline in the
      // vend/payment transaction.
      { to, recipient },
    );
  }

  async sendWelcomeSms(to: string, name: string, standRef: string, recipient?: NotificationRecipient) {
    return this.sendTemplate('WELCOME', { name, standRef }, { to, recipient });
  }

  async sendPaymentReceivedSms(
    to: string,
    amount: string,
    ref: string,
    balance: string,
    currency = 'USD',
    recipient?: NotificationRecipient,
  ) {
    return this.sendTemplate(
      'PAYMENT_RECEIVED',
      { amount, ref, balance, currency, date: new Date().toLocaleDateString('en-ZW') },
      { to, recipient },
    );
  }

  async sendPaymentDueSms(
    to: string,
    amount: string,
    dueDate: string,
    description: string,
    accountNo: string,
    currency = 'USD',
    recipient?: NotificationRecipient,
  ) {
    return this.sendTemplate(
      'PAYMENT_DUE',
      { amount, dueDate, description, accountNo, currency },
      { to, recipient },
    );
  }

  async sendLowBalanceSms(
    to: string,
    meterNo: string,
    units: string,
    daysLeft: string,
    recipient?: NotificationRecipient,
  ) {
    return this.sendTemplate(
      'UTILITY_LOW_BALANCE',
      { meterNo, units, daysLeft, ussdCode: this.ussdCode },
      { to, recipient },
    );
  }

  async sendOtp(to: string, otp: string, expiryMins = '10', recipient?: NotificationRecipient) {
    return this.sendTemplate('OTP', { otp, expiryMins }, {
      to,
      recipient,
      enqueue: false, // OTPs must arrive immediately
    });
  }

  // ── Internal ───────────────────────────────────────────────

  async _sendImmediate(
    to: string | string[],
    message: string,
    senderId?: string,
  ): Promise<SmsResult> {
    const recipients = Array.isArray(to) ? to : [to];
    const sender = senderId ?? this.defaultSenderId;
    const provider = this.providers.active();

    // One send per recipient so each gets an independent accept/fail outcome.
    const results = await Promise.all(
      recipients.map((r) => provider.send(r, message, sender)),
    );
    const ok = results.every((r) => r.ok);
    const messageId = results.find((r) => r.providerMessageId)?.providerMessageId ?? 'unknown';

    if (ok) {
      this.logger.log(`SMS sent via ${provider.name} to=${recipients.join(',')}`);
    } else {
      const err = results.find((r) => !r.ok)?.error;
      this.logger.warn(
        `SMS send failed via ${provider.name} to=${recipients.join(',')}: ${err}`,
      );
    }

    return {
      messageId,
      status: ok ? 'sent' : 'failed',
      recipient: recipients.join(','),
    };
  }
}
