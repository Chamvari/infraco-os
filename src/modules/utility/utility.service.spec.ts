import { UtilityService } from './utility.service';
import { PrismaService } from '../../prisma.service';
import { MeterAdapterRegistry } from './meter-adapter';
import { EasyMobileClient } from './easymobile.client';

/**
 * Unit tests for UtilityService (Module D, SRS §7).
 * Covers: a prepaid vend (UTIL-TKN), vend idempotency on platform_txn_id
 * (UTIL-TKN-005 — the "duplicate callback" guarantee), and LTE provisioning
 * retry after a transient EOS failure (UTIL-LTE-003).
 * Prisma / adapter / EOS client are mocked.
 */
describe('UtilityService', () => {
  let service: UtilityService;
  let tx: { $queryRawUnsafe: jest.Mock; $executeRawUnsafe: jest.Mock };
  let prisma: { withActor: jest.Mock; $queryRawUnsafe: jest.Mock };
  let adapterVend: jest.Mock;
  let adapters: { resolve: jest.Mock };
  let easyMobile: { provision: jest.Mock };

  const actor = { actorId: '', actorRole: 'system' };
  const METER = {
    meter_id: 'm-1',
    serial_no: 'PWR-001',
    utility_type: 'power',
    adapter: 'mock',
    is_prepaid: true,
    tariff_id: 'tar-1',
    customer_id: null,
  };

  beforeEach(() => {
    tx = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    prisma = {
      withActor: jest.fn((_a, _r, fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
      $queryRawUnsafe: jest.fn(),
    };
    adapterVend = jest.fn().mockResolvedValue({ tokenCode: '1111-2222-3333-4444-5555' });
    adapters = { resolve: jest.fn().mockReturnValue({ vend: adapterVend }) };
    easyMobile = { provision: jest.fn() };
    service = new UtilityService(
      prisma as unknown as PrismaService,
      adapters as unknown as MeterAdapterRegistry,
      easyMobile as unknown as EasyMobileClient,
    );
  });

  it('UTIL-TKN: vends a token and converts amount→units via the tariff', async () => {
    tx.$queryRawUnsafe
      .mockResolvedValueOnce([]) // no prior vend for this txn
      .mockResolvedValueOnce([METER]) // resolve meter
      .mockResolvedValueOnce([
        { tariff_id: 'tar-1', structure: 'flat', rate: '0.50', fixed_charge: '0' },
      ]) // tariff
      .mockResolvedValueOnce([{ vend_id: 'v-1' }]); // insert token_vend

    const res = await service.vend({
      ...actor,
      meterSerial: 'PWR-001',
      amountPaid: 50,
      platformTxnId: 'PTX-1',
    });

    expect(res.duplicate).toBe(false);
    expect(res.tokenCode).toBe('1111-2222-3333-4444-5555');
    expect(res.units).toBe(100); // 50 / 0.50
    expect(adapterVend).toHaveBeenCalledTimes(1);
    // meter last_balance is topped up by the vended units
    expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE util.meter'),
      'm-1',
      100,
    );
  });

  it('UTIL-TKN-005: a duplicate callback (same platform_txn_id) does NOT vend twice', async () => {
    // A prior vend already exists for this platform transaction.
    tx.$queryRawUnsafe.mockResolvedValueOnce([
      {
        vend_id: 'v-1',
        meter_id: 'm-1',
        token_code: '1111-2222-3333-4444-5555',
        units: '100',
        amount_paid: '50',
        status: 'issued',
      },
    ]);

    const res = await service.vend({
      ...actor,
      meterSerial: 'PWR-001',
      amountPaid: 50,
      platformTxnId: 'PTX-1',
    });

    expect(res.duplicate).toBe(true);
    expect(res.vendId).toBe('v-1');
    expect(res.tokenCode).toBe('1111-2222-3333-4444-5555');
    // No new token generated, no second insert.
    expect(adapterVend).not.toHaveBeenCalled();
  });

  it('UTIL-LTE-003: a failed provisioning is retryable and completes on retry', async () => {
    easyMobile.provision
      .mockResolvedValueOnce({ ok: false, error: 'EOS timeout' }) // first attempt fails
      .mockResolvedValueOnce({ ok: true, provisionRef: 'EOS-ABC12345' }); // retry succeeds

    // --- initial purchase (from callback path) ---
    tx.$queryRawUnsafe
      .mockResolvedValueOnce([]) // no prior purchase for txn
      .mockResolvedValueOnce([{ purchase_id: 'p-1' }]) // insert purchase
      .mockResolvedValueOnce([{ msisdn: '+263770000000', external_ref: 'EM-DATA-1' }]); // provision ctx

    const first = await service.purchaseLte({
      ...actor,
      subscriberId: 's-1',
      productId: 'prod-1',
      amountPaid: 10,
      platformTxnId: 'PTX-LTE-1',
    });
    expect(first.status).toBe('failed');
    expect(first.provisionRef).toBeNull();

    // --- retry ---
    tx.$queryRawUnsafe
      .mockResolvedValueOnce([{ purchase_id: 'p-1', status: 'failed', provision_ref: null }]) // load
      .mockResolvedValueOnce([{ msisdn: '+263770000000', external_ref: 'EM-DATA-1' }]); // provision ctx

    const retry = await service.retryProvision('p-1', actor);
    expect(retry.status).toBe('provisioned');
    expect(retry.provisionRef).toBe('EOS-ABC12345');
    expect(easyMobile.provision).toHaveBeenCalledTimes(2);
  });

  it('UTIL-LTE-003: retrying an already-provisioned purchase is a no-op', async () => {
    tx.$queryRawUnsafe.mockResolvedValueOnce([
      { purchase_id: 'p-1', status: 'provisioned', provision_ref: 'EOS-ABC12345' },
    ]);

    const res = await service.retryProvision('p-1', actor);

    expect(res.status).toBe('provisioned');
    expect(res.duplicate).toBe(true);
    expect(easyMobile.provision).not.toHaveBeenCalled();
  });
});
