import { PaymentsService } from './payments.service';
import { PrismaService } from '../../prisma.service';
import { LedgerService } from '../financial/ledger.service';

/**
 * Unit tests for PaymentsService.handleCallback (PAY-API-003/005 + FIN-LED-002/003).
 * Covers matched, unmatched, duplicate (callback-level and ledger-backstop), and
 * partial payments. Prisma/Ledger/Financial are mocked.
 */
describe('PaymentsService.handleCallback', () => {
  let service: PaymentsService;
  let tx: { $queryRawUnsafe: jest.Mock; $executeRawUnsafe: jest.Mock };
  let prisma: { withActor: jest.Mock };
  let ledger: {
    postPaymentTx: jest.Mock;
    parkSuspenseTx: jest.Mock;
    recomputeAccount: jest.Mock;
  };

  const callback = (over: Record<string, unknown> = {}) => ({
    platform_txn_id: 'TX-1',
    bill_ref: 'INV-AAA-001',
    amount_paid: 1000,
    currency: 'USD',
    channel: 'ussd',
    signatureValid: true,
    ...over,
  });

  beforeEach(() => {
    tx = {
      $queryRawUnsafe: jest.fn(),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    prisma = {
      withActor: jest.fn(
        (_a: string | null, _r: string, fn: (t: typeof tx) => Promise<unknown>) =>
          fn(tx),
      ),
    };
    ledger = {
      postPaymentTx: jest.fn(),
      parkSuspenseTx: jest.fn().mockResolvedValue(undefined),
      recomputeAccount: jest.fn().mockResolvedValue({}),
    };
    service = new PaymentsService(
      prisma as unknown as PrismaService,
      ledger as unknown as LedgerService,
    );
  });

  it('matched: posts to the ledger and recomputes arrears in real time', async () => {
    tx.$queryRawUnsafe.mockResolvedValue([
      { invoice_id: 'inv-1', account_id: 'acc-1' },
    ]);
    ledger.postPaymentTx.mockResolvedValue({
      ledgerId: '5',
      duplicate: false,
      invoiceStatus: 'paid',
    });

    const res = await service.handleCallback(callback());

    expect(res).toBe('matched');
    expect(ledger.postPaymentTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        accountId: 'acc-1',
        invoiceId: 'inv-1',
        amount: 1000,
        platformTxnId: 'TX-1',
      }),
    );
    // callback row marked matched with the ledger id
    const mark = tx.$executeRawUnsafe.mock.calls.find((c) =>
      String(c[0]).includes("SET status = 'matched'"),
    );
    expect(mark).toBeDefined();
    // FIN-LED-002 real-time arrears recompute
    expect(ledger.recomputeAccount).toHaveBeenCalledWith('acc-1', {
      actorId: '',
      actorRole: 'system',
    });
  });

  it('partial: still matched; ledger records partially_paid', async () => {
    tx.$queryRawUnsafe.mockResolvedValue([
      { invoice_id: 'inv-1', account_id: 'acc-1' },
    ]);
    ledger.postPaymentTx.mockResolvedValue({
      ledgerId: '6',
      duplicate: false,
      invoiceStatus: 'partially_paid',
    });

    const res = await service.handleCallback(callback({ amount_paid: 400 }));

    expect(res).toBe('matched');
    expect(ledger.postPaymentTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ amount: 400 }),
    );
    expect(ledger.recomputeAccount).toHaveBeenCalled();
  });

  it('unmatched: parks in suspense, no ledger post, no recompute', async () => {
    tx.$queryRawUnsafe.mockResolvedValue([]); // no invoice matches bill_ref

    const res = await service.handleCallback(callback({ bill_ref: 'UNKNOWN' }));

    expect(res).toBe('unmatched');
    expect(ledger.parkSuspenseTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ platformTxnId: 'TX-1', amount: 1000 }),
    );
    expect(ledger.postPaymentTx).not.toHaveBeenCalled();
    expect(ledger.recomputeAccount).not.toHaveBeenCalled();
  });

  it('duplicate callback: rejected at the callback unique index, never posts', async () => {
    tx.$executeRawUnsafe.mockRejectedValueOnce({
      meta: { message: 'duplicate key value violates unique constraint "uq_callback_txn"' },
    });

    const res = await service.handleCallback(callback());

    expect(res).toBe('duplicate');
    expect(ledger.postPaymentTx).not.toHaveBeenCalled();
    expect(ledger.recomputeAccount).not.toHaveBeenCalled();
  });

  it('duplicate at the ledger backstop: marks duplicate, does not double-post', async () => {
    tx.$queryRawUnsafe.mockResolvedValue([
      { invoice_id: 'inv-1', account_id: 'acc-1' },
    ]);
    ledger.postPaymentTx.mockResolvedValue({
      ledgerId: null,
      duplicate: true,
      invoiceStatus: null,
    });

    const res = await service.handleCallback(callback());

    expect(res).toBe('duplicate');
    const mark = tx.$executeRawUnsafe.mock.calls.find((c) =>
      String(c[0]).includes("SET status = 'duplicate'"),
    );
    expect(mark).toBeDefined();
    expect(ledger.recomputeAccount).not.toHaveBeenCalled();
  });
});
