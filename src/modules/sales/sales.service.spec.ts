import { ConflictException, BadRequestException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { PrismaService } from '../../prisma.service';
import { FinancialService } from '../financial/financial.service';

/**
 * Unit tests for the Module B sales workflow (STND-SALE-002/003/004/005):
 * reservation→sale conversion, Registrar approval, and cancellation/rescission.
 * Prisma + the instalment engine are mocked; SQL is routed by substring.
 */
describe('SalesService — sale workflow', () => {
  let service: SalesService;
  let tx: { $queryRawUnsafe: jest.Mock; $executeRawUnsafe: jest.Mock };
  let prisma: { withActor: jest.Mock };
  let financial: { generateInstalmentScheduleTx: jest.Mock };

  const actor = { actorId: 'u-1', actorRole: 'sales_agent' };

  beforeEach(() => {
    tx = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    prisma = {
      withActor: jest.fn(
        (_a: string | null, _r: string, fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    };
    financial = {
      generateInstalmentScheduleTx: jest.fn().mockResolvedValue({
        invoiceIds: ['inv-1', 'inv-2'],
        amounts: [500, 500],
        count: 2,
        structure: 'equal',
        currency: 'USD',
      }),
    };
    service = new SalesService(
      prisma as unknown as PrismaService,
      financial as unknown as FinancialService,
    );
  });

  // -- convertReservationToSale ----------------------------------------------

  it('converts an active reservation: opens account, records sale, builds schedule, registers agreement', async () => {
    tx.$queryRawUnsafe.mockImplementation((sql: string) => {
      if (sql.includes('FROM sales.reservation WHERE reservation_id'))
        return [{ plot_id: 'p-1', customer_id: 'c-1', agent_id: 'a-1', status: 'active' }];
      if (sql.includes('FROM sales.plot WHERE plot_id'))
        return [{ status: 'reserved', plot_type: 'residential', price: '1000', currency: 'USD' }];
      if (sql.includes('INSERT INTO fin.account'))
        return [{ account_id: 'acc-1', reference: 'STD-XYZ' }];
      if (sql.includes('INSERT INTO sales.sale')) return [{ sale_id: 'sale-1' }];
      if (sql.includes('INSERT INTO core.document')) return [{ document_id: 'doc-1' }];
      return [];
    });

    const res = await service.convertReservationToSale({
      reservationId: 'r-1',
      numInstalments: 2,
      deposit: 0,
      ...actor,
    });

    expect(res).toMatchObject({
      saleId: 'sale-1',
      accountId: 'acc-1',
      price: 1000,
      currency: 'USD',
      status: 'pending_approval',
      agreementDocumentId: 'doc-1',
    });
    expect(res.schedule.count).toBe(2);
    // schedule generated atomically on the same tx, against the new account
    expect(financial.generateInstalmentScheduleTx).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ accountId: 'acc-1', totalPrice: 1000, deposit: 0, numInstalments: 2 }),
    );
    // reservation closed out
    const conv = tx.$executeRawUnsafe.mock.calls.find((c) =>
      String(c[0]).includes("UPDATE sales.reservation SET status = 'converted'"),
    );
    expect(conv).toBeDefined();
  });

  it('refuses to convert a non-active reservation', async () => {
    tx.$queryRawUnsafe.mockImplementation((sql: string) =>
      sql.includes('FROM sales.reservation')
        ? [{ plot_id: 'p-1', customer_id: 'c-1', agent_id: 'a-1', status: 'converted' }]
        : [],
    );
    await expect(
      service.convertReservationToSale({ reservationId: 'r-1', numInstalments: 2, deposit: 0, ...actor }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(financial.generateInstalmentScheduleTx).not.toHaveBeenCalled();
  });

  it('refuses to convert when the plot has no price and none is supplied', async () => {
    tx.$queryRawUnsafe.mockImplementation((sql: string) => {
      if (sql.includes('FROM sales.reservation'))
        return [{ plot_id: 'p-1', customer_id: 'c-1', agent_id: 'a-1', status: 'active' }];
      if (sql.includes('FROM sales.plot'))
        return [{ status: 'reserved', plot_type: 'residential', price: null, currency: 'USD' }];
      return [];
    });
    await expect(
      service.convertReservationToSale({ reservationId: 'r-1', numInstalments: 2, deposit: 0, ...actor }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  // -- approveSale ------------------------------------------------------------

  it('approves a pending sale: sale active, plot sold', async () => {
    tx.$queryRawUnsafe.mockImplementation((sql: string) =>
      sql.includes('FROM sales.sale WHERE sale_id')
        ? [{ plot_id: 'p-1', status: 'pending_approval' }]
        : [],
    );
    const res = await service.approveSale({ saleId: 'sale-1', ...actor });
    expect(res).toEqual({ saleId: 'sale-1', status: 'active', plotStatus: 'sold' });
    const soldPlot = tx.$executeRawUnsafe.mock.calls.find((c) =>
      String(c[0]).includes("SET status = 'sold'"),
    );
    expect(soldPlot).toBeDefined();
  });

  it('refuses to approve a sale that is not pending', async () => {
    tx.$queryRawUnsafe.mockImplementation((sql: string) =>
      sql.includes('FROM sales.sale') ? [{ plot_id: 'p-1', status: 'active' }] : [],
    );
    await expect(service.approveSale({ saleId: 'sale-1', ...actor })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  // -- cancelSale -------------------------------------------------------------

  it('cancels a sale: voids unpaid invoices, releases the plot, reports refund due', async () => {
    tx.$queryRawUnsafe.mockImplementation((sql: string) => {
      if (sql.includes('FROM sales.sale WHERE sale_id'))
        return [{ plot_id: 'p-1', account_id: 'acc-1', status: 'active' }];
      if (sql.includes("UPDATE fin.invoice SET status = 'cancelled'"))
        return [{ invoice_id: 'inv-1' }, { invoice_id: 'inv-2' }];
      if (sql.includes('FROM fin.ledger_entry')) return [{ received: '250' }];
      return [];
    });
    const res = await service.cancelSale({ saleId: 'sale-1', reason: 'buyer withdrew', ...actor });
    expect(res).toEqual({
      saleId: 'sale-1',
      status: 'cancelled',
      plotStatus: 'available',
      invoicesCancelled: 2,
      refundDue: 250,
    });
    // money received → account left open (not closed)
    const acctUpd = tx.$executeRawUnsafe.mock.calls.find((c) =>
      String(c[0]).includes('UPDATE fin.account SET status'),
    );
    expect(acctUpd?.[2]).toBe('active');
    const freePlot = tx.$executeRawUnsafe.mock.calls.find((c) =>
      String(c[0]).includes("SET status = 'available'"),
    );
    expect(freePlot).toBeDefined();
  });

  it('requires a cancellation reason', async () => {
    await expect(
      service.cancelSale({ saleId: 'sale-1', reason: '  ', ...actor }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
