import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';

/**
 * SMS provider abstraction (PLAT-NOTIF-001), mirroring the Module D meter-adapter
 * pattern (src/modules/utility/meter-adapter.ts): one SmsProvider interface, a
 * concrete implementation per backend, and a registry that resolves the active
 * one by env var. Today only SMSPop is wired; adding a backend later is a
 * registry change, not a service rewrite.
 *
 * send() never throws — it resolves { ok, providerMessageId?, error? }; the queue
 * processor maps that to the persisted delivery status (PLAT-NOTIF-002).
 */

export const SMS_PROVIDERS = ['smspop'] as const;
export type SmsProviderName = (typeof SMS_PROVIDERS)[number];

export interface SmsSendResult {
  ok: boolean;
  /** Provider-side id when available. SMSPop's campaign API returns none per message. */
  providerMessageId?: string;
  error?: string;
}

export interface SmsProvider {
  readonly name: SmsProviderName;
  send(to: string, message: string, senderId?: string): Promise<SmsSendResult>;
}

/** Zimbabwe MSISDN normalisation: 07…, 263…, +263… -> +2637… */
export function normalizeMsisdn(p: string): string | null {
  let s = String(p || '').replace(/[^\d+]/g, '');
  if (s.startsWith('0')) s = '263' + s.slice(1);
  if (!s.startsWith('+')) s = '+' + s;
  return /^\+263(7\d{8}|8\d{7,8})$/.test(s) ? s : s.length >= 11 ? s : null;
}

/**
 * SMSPopProvider — direct integration with SMSPop (smspop.co.zw), the sole SMS
 * rail. No gateway hop. Config (all from env):
 *   SMSPOP_API_BASE_URL   default https://smspop.co.zw
 *   SMSPOP_TOKEN          bearer token (blank => stub/no-send; never throws)
 *   SMSPOP_SENDER_ID      registered sender id
 *   SMSPOP_TLS_INSECURE   'true' (default) accepts SMSPop's self-signed cert —
 *                         scoped to this request only, never global.
 */
@Injectable()
export class SmsPopProvider implements SmsProvider {
  readonly name: SmsProviderName = 'smspop';
  private readonly log = new Logger(SmsPopProvider.name);

  async send(to: string, message: string, senderId?: string): Promise<SmsSendResult> {
    const phone = normalizeMsisdn(to);
    if (!phone) return { ok: false, error: 'invalid phone number' };

    const token = process.env.SMSPOP_TOKEN || '';
    const sender = senderId || process.env.SMSPOP_SENDER_ID || 'InfraCo';
    const base = process.env.SMSPOP_API_BASE_URL || 'https://smspop.co.zw';
    const insecure = (process.env.SMSPOP_TLS_INSECURE || 'true').toLowerCase() === 'true';

    if (!token) {
      this.log.warn(`[SMS STUB] SMSPop not configured (SMSPOP_TOKEN) — would send to ${phone}`);
      return { ok: true, providerMessageId: 'stub' };
    }

    const u = new URL('/api/campaigns', base);
    const isHttps = u.protocol === 'https:';
    const payload = JSON.stringify({
      name: 'InfraCo ' + new Date().toISOString().slice(0, 19),
      message,
      sender_id: sender,
      contact_import_method: 'manual',
      manual_contacts: phone.replace('+', ''),
    });

    const options: https.RequestOptions = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname,
      method: 'POST',
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    // Self-signed cert on smspop.co.zw — scoped to this request only, never global.
    if (isHttps) options.rejectUnauthorized = !insecure;

    return new Promise<SmsSendResult>((resolve) => {
      const handler = (res: http.IncomingMessage) => {
        let b = '';
        res.on('data', (c) => (b += c));
        res.on('end', () => {
          try {
            const d = JSON.parse(b);
            if (d.success !== false && (res.statusCode ?? 500) < 300) {
              this.log.log(`SMS accepted by SMSPop to ${phone}`);
              resolve({ ok: true, providerMessageId: d.id ? String(d.id) : 'smspop' });
            } else {
              resolve({ ok: false, error: d.message || `HTTP ${res.statusCode}` });
            }
          } catch {
            resolve({ ok: false, error: `SMSPop non-JSON HTTP ${res.statusCode}` });
          }
        });
      };
      const req = isHttps ? https.request(options, handler) : http.request(options, handler);
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'SMSPop timeout' });
      });
      req.write(payload);
      req.end();
    });
  }
}

/**
 * Resolves the active SMS provider by env (SMS_PROVIDER, default 'smspop'),
 * mirroring MeterAdapterRegistry: an unknown name fails loud rather than
 * silently no-op'ing.
 */
@Injectable()
export class SmsProviderRegistry {
  private readonly providers: Map<SmsProviderName, SmsProvider>;

  constructor(smspop: SmsPopProvider) {
    this.providers = new Map([[smspop.name, smspop]]);
  }

  active(): SmsProvider {
    const name = (process.env.SMS_PROVIDER || 'smspop').toLowerCase() as SmsProviderName;
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(
        `SMS provider '${name}' is not configured. Available: ${[...this.providers.keys()].join(', ')}.`,
      );
    }
    return provider;
  }
}
