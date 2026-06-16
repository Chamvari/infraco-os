import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { MeterAdapter as MeterAdapterName, TokenKind, VendableUtilityType } from '../../common/enums';

/**
 * Pluggable meter-vending adapter (UTIL-TKN-003).
 *
 * A vend turns a paid amount into a token a prepaid meter accepts. Different
 * estates use different backends — STS token generation, a meter vendor's API,
 * or (here) a deterministic mock. The vend path picks the adapter named on the
 * meter, so swapping a real STS/vendor adapter in later is a registry change,
 * not a service rewrite.
 */
export interface VendRequest {
  meterSerial: string;
  utilityType: VendableUtilityType;
  units: number | null;
  amount: number;
  tokenKind: TokenKind;
  /** Stable reference (platform txn id) so re-issuing yields the same token. */
  reference: string;
}

export interface VendResult {
  tokenCode: string;
  raw?: Record<string, unknown>;
}

export interface MeterAdapter {
  readonly kind: MeterAdapterName;
  vend(req: VendRequest): Promise<VendResult>;
}

/**
 * MockMeterAdapter — deterministic STS-shaped (20-digit) token generator.
 * Same (meterSerial, reference) → same token, so a retried/duplicate vend is
 * idempotent at the adapter layer too. Stands in until a real STS/vendor
 * adapter is wired (SRS §7.1).
 */
@Injectable()
export class MockMeterAdapter implements MeterAdapter {
  readonly kind: MeterAdapterName = 'mock';

  async vend(req: VendRequest): Promise<VendResult> {
    const digest = createHash('sha256')
      .update(`${req.meterSerial}|${req.reference}`)
      .digest('hex');
    // Map the first 20 hex nibbles to decimal digits → a 20-digit token.
    let token = '';
    for (let i = 0; i < 20; i += 1) {
      token += (parseInt(digest[i], 16) % 10).toString();
    }
    const formatted = token.replace(/(\d{4})(?=\d)/g, '$1-');
    return {
      tokenCode: formatted,
      raw: { adapter: 'mock', utilityType: req.utilityType, units: req.units },
    };
  }
}

/**
 * Resolves a meter's adapter name to an implementation. Only 'mock' is wired in
 * Phase 1; 'sts' and 'vendor_api' throw until their backends are configured, so
 * a misconfigured meter fails loudly rather than silently mis-vending.
 */
@Injectable()
export class MeterAdapterRegistry {
  private readonly adapters: Map<MeterAdapterName, MeterAdapter>;

  constructor(mock: MockMeterAdapter) {
    this.adapters = new Map([[mock.kind, mock]]);
  }

  resolve(kind: MeterAdapterName): MeterAdapter {
    const adapter = this.adapters.get(kind);
    if (!adapter) {
      throw new Error(
        `Meter adapter '${kind}' is not configured. Available: ${[...this.adapters.keys()].join(', ')}.`,
      );
    }
    return adapter;
  }
}
