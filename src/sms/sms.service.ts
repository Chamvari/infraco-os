import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';

/**
 * InfraCo OS :: SmsService
 *
 * Default rail: the EOS SMS Gateway (eFIS-CPAY) — central sender ID (CPAY202),
 * per-key daily limits, delivery logging. Provider abstraction and MNO handling
 * live in the gateway, not here.
 *
 *   SMS_MODE=gateway (default)
 *     SMS_GATEWAY_URL   e.g. http://<gateway-host>:9070
 *     SMS_GATEWAY_KEY   API key issued by the gateway (label it "InfraCo OS")
 *
 * Fallback rail: direct SMSPop (only if the gateway is unreachable from this
 * network) — SMS_MODE=smspop with SMSPOP_TOKEN / SMSPOP_SENDER_ID.
 * Note: SMSPop's TLS cert is self-signed; rejectUnauthorized is disabled for
 * that request only (never globally).
 *
 * send() never throws — it always resolves { ok, id?, error? }; callers check ok.
 */
@Injectable()
export class SmsService {
  private readonly log = new Logger(SmsService.name);
  private readonly mode = (process.env.SMS_MODE || 'gateway').toLowerCase();

  async send(
    to: string,
    message: string,
  ): Promise<{ ok: boolean; id?: string; error?: string }> {
    const phone = this.normalize(to);
    if (!phone) return { ok: false, error: 'invalid phone number' };
    try {
      return this.mode === 'smspop'
        ? await this.viaSmspop(phone, message)
        : await this.viaGateway(phone, message);
    } catch (e: any) {
      this.log.error(`SMS send failed (${this.mode}): ${e.message}`);
      return { ok: false, error: String(e.message).slice(0, 120) };
    }
  }

  /** Zimbabwe MSISDN normalisation: 07…, 263…, +263… -> +2637… */
  private normalize(p: string): string | null {
    let s = String(p || '').replace(/[^\d+]/g, '');
    if (s.startsWith('0')) s = '263' + s.slice(1);
    if (!s.startsWith('+')) s = '+' + s;
    return /^\+263(7\d{8}|8\d{7,8})$/.test(s) ? s : s.length >= 11 ? s : null;
  }

  /* ── default: EOS SMS Gateway ─────────────────────────────────── */
  private viaGateway(to: string, message: string) {
    const base = process.env.SMS_GATEWAY_URL || '';
    const key = process.env.SMS_GATEWAY_KEY || '';
    if (!base || !key) {
      this.log.warn(`[SMS STUB] gateway not configured — would send to ${to}`);
      return Promise.resolve({ ok: true, id: 'stub' });
    }
    const u = new URL('/api/sms/gateway/send', base);
    const payload = JSON.stringify({ to, message });
    const lib = u.protocol === 'https:' ? https : http;
    return new Promise<{ ok: boolean; id?: string; error?: string }>((resolve) => {
      const req = lib.request(
        {
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname,
          method: 'POST',
          timeout: 20000,
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': key,
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let b = '';
          res.on('data', (c) => (b += c));
          res.on('end', () => {
            try {
              const d = JSON.parse(b);
              if (d.status === 'SENT') {
                this.log.log(`SMS SENT to ${to} (${d.id})`);
                resolve({ ok: true, id: d.id });
              } else {
                resolve({
                  ok: false,
                  id: d.id,
                  error: d.providerStatus || d.error || `HTTP ${res.statusCode}`,
                });
              }
            } catch {
              resolve({ ok: false, error: `gateway non-JSON HTTP ${res.statusCode}` });
            }
          });
        },
      );
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'gateway timeout' });
      });
      req.write(payload);
      req.end();
    });
  }

  /* ── fallback: direct SMSPop (self-signed cert on their host) ──── */
  private viaSmspop(to: string, message: string) {
    const token = process.env.SMSPOP_TOKEN || '';
    const sender = process.env.SMSPOP_SENDER_ID || '';
    if (!token) {
      this.log.warn(`[SMS STUB] smspop not configured — would send to ${to}`);
      return Promise.resolve({ ok: true, id: 'stub' });
    }
    const payload = JSON.stringify({
      name: 'InfraCo ' + new Date().toISOString().slice(0, 19),
      message,
      sender_id: sender,
      contact_import_method: 'manual',
      manual_contacts: to.replace('+', ''),
    });
    return new Promise<{ ok: boolean; id?: string; error?: string }>((resolve) => {
      const req = https.request(
        {
          hostname: 'smspop.co.zw',
          port: 443,
          path: '/api/campaigns',
          method: 'POST',
          rejectUnauthorized: false, // self-signed cert on smspop.co.zw ONLY
          timeout: 20000,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let b = '';
          res.on('data', (c) => (b += c));
          res.on('end', () => {
            try {
              const d = JSON.parse(b);
              if (d.success !== false && res.statusCode! < 300) {
                this.log.log(`SMS SENT via smspop to ${to}`);
                resolve({ ok: true, id: 'smspop' });
              } else {
                resolve({ ok: false, error: d.message || `HTTP ${res.statusCode}` });
              }
            } catch {
              resolve({ ok: false, error: `smspop non-JSON HTTP ${res.statusCode}` });
            }
          });
        },
      );
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'smspop timeout' });
      });
      req.write(payload);
      req.end();
    });
  }
}
