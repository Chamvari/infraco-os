import { Injectable, Logger } from '@nestjs/common';

/**
 * PaymentsPlatformClient — outbound integration with the standalone Payments
 * Platform (SRS §15.1, PAY-API-001/002/004). InfraCo OS holds the initiative on
 * bill creation: it POSTs /bills and stores the returned platform_bill_id +
 * short_code/QR against the invoice.
 *
 * When PAYMENTS_API_BASE_URL is unset (local/dev/test, and until the platform
 * team confirms the live contract — SRS §18) the client degrades gracefully:
 * it reports `configured: false` so the caller records the bill locally and can
 * push it later, rather than failing the instalment run.
 */
export interface CreateBillRequest {
  /** OS invoice reference — the unique matching key (== invoice.reference). */
  bill_ref: string;
  amount: number;
  currency: string;
  /** Wallet linked at onboarding; null → customer pays via USSD/QR. */
  customer_wallet_id: string | null;
  description: string;
  /** ISO date. */
  due_date: string;
  channels: string[];
  callback_url: string;
}

export interface CreateBillResult {
  ok: boolean;
  /** False when no platform is configured (degraded local-only path). */
  configured: boolean;
  httpStatus?: number;
  platformBillId?: string;
  platformStatus?: string;
  shortCodeOrQr?: string;
  error?: string;
}

@Injectable()
export class PaymentsPlatformClient {
  private readonly logger = new Logger(PaymentsPlatformClient.name);

  isConfigured(): boolean {
    return !!process.env.PAYMENTS_API_BASE_URL;
  }

  async createBill(req: CreateBillRequest): Promise<CreateBillResult> {
    const base = process.env.PAYMENTS_API_BASE_URL;
    if (!base) {
      this.logger.warn(
        `PAYMENTS_API_BASE_URL not set — bill ${req.bill_ref} recorded locally, not pushed.`,
      );
      return { ok: false, configured: false };
    }

    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/bills`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.PAYMENTS_API_KEY ?? ''}`,
        },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        this.logger.error(`Create-bill ${req.bill_ref} failed: HTTP ${res.status}`);
        return { ok: false, configured: true, httpStatus: res.status, error: `HTTP ${res.status}` };
      }
      const data = (await res.json()) as {
        platform_bill_id?: string;
        status?: string;
        short_code_or_qr?: string;
      };
      return {
        ok: true,
        configured: true,
        httpStatus: res.status,
        platformBillId: data.platform_bill_id,
        platformStatus: data.status,
        shortCodeOrQr: data.short_code_or_qr,
      };
    } catch (e: unknown) {
      this.logger.error(`Create-bill ${req.bill_ref} threw: ${String(e)}`);
      return { ok: false, configured: true, error: String(e) };
    }
  }
}
