import { Injectable, Logger } from '@nestjs/common';

/**
 * EasyMobileClient — integration stub for the EOS / Easy Mobile private-LTE
 * platform (SRS §7.5, UTIL-LTE). InfraCo OS sells bundles/subscriptions through
 * its storefront and calls EOS to activate them on the subscriber's line.
 *
 * The real outbound call is a clearly-marked TODO until EOS confirms the API
 * contract. The default stub provisions successfully and returns a deterministic
 * reference; provisioning is retryable (UTIL-LTE-003), so a transient EOS outage
 * leaves the purchase 'failed' and a later retry can complete it.
 */
export interface ProvisionRequest {
  purchaseId: string;
  msisdn: string | null;
  productExternalRef: string | null;
  /** 1 on the first attempt, incremented on each retry (for logging/tracing). */
  attempt: number;
}

export interface ProvisionResult {
  ok: boolean;
  provisionRef?: string;
  error?: string;
}

@Injectable()
export class EasyMobileClient {
  private readonly logger = new Logger(EasyMobileClient.name);

  async provision(req: ProvisionRequest): Promise<ProvisionResult> {
    // TODO(EOS): POST to the Easy Mobile provisioning API per SRS §7.5 once the
    // contract is confirmed; map its activation id to provisionRef, and surface
    // a transient failure as { ok: false } so the purchase stays retryable.
    this.logger.log(
      `provision attempt ${req.attempt} for purchase ${req.purchaseId} (msisdn=${req.msisdn ?? 'n/a'})`,
    );
    const provisionRef = `EOS-${req.purchaseId.slice(0, 8).toUpperCase()}`;
    return { ok: true, provisionRef };
  }
}
