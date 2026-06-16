import { ArrearsService } from './arrears.service';
import { PrismaService } from '../../prisma.service';

/**
 * Unit tests for ArrearsService (FIN-ARR-002). Prisma is mocked; withActor()
 * runs its callback with a fake tx so we can assert the rung selection, the
 * conditional-insert idempotency, and the notification fan-out — without a DB.
 */
describe('ArrearsService', () => {
  let service: ArrearsService;
  let tx: { $queryRawUnsafe: jest.Mock; $executeRawUnsafe: jest.Mock };
  let prisma: { $queryRawUnsafe: jest.Mock; withActor: jest.Mock };

  const actor = { actorId: 'user-1', actorRole: 'finance' };

  const account = (over: Record<string, unknown> = {}) => ({
    account_id: 'acc-1',
    customer_id: 'cust-1',
    currency: 'USD',
    overdue_amount: '1320',
    oldest_due: '2026-03-01',
    days_overdue: '40',
    ...over,
  });

  beforeEach(() => {
    tx = { $queryRawUnsafe: jest.fn(), $executeRawUnsafe: jest.fn() };
    prisma = {
      $queryRawUnsafe: jest.fn(),
      withActor: jest.fn(
        (_a: string, _r: string, fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    };
    service = new ArrearsService(prisma as unknown as PrismaService);
  });

  it('fires the highest due rung and queues a notification', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([account({ days_overdue: '40' })]);
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ action_id: 'act-1' }]); // inserted

    const res = await service.runEscalation({ asOf: '2026-04-10', ...actor });

    expect(res.scanned).toBe(1);
    expect(res.counts).toEqual({ reminder: 0, formal_notice: 1, legal_referral: 0 });
    expect(res.actions[0]).toMatchObject({
      accountId: 'acc-1',
      stage: 'formal_notice',
      daysOverdue: 40,
      overdueAmount: 1320,
    });
    // Notification queued with the rung's template.
    const notifySql = tx.$executeRawUnsafe.mock.calls[0][0] as string;
    expect(notifySql).toMatch(/core\.notification/);
    expect(tx.$executeRawUnsafe.mock.calls[0]).toContain('arrears_formal_notice');
  });

  it('escalates a years-overdue legacy account straight to legal referral', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([
      account({ days_overdue: '1800', oldest_due: '2021-06-01' }),
    ]);
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ action_id: 'act-2' }]);

    const res = await service.runEscalation({ asOf: '2026-06-16', ...actor });
    expect(res.actions[0].stage).toBe('legal_referral');
    expect(res.counts.legal_referral).toBe(1);
  });

  it('is idempotent: a rung already fired this episode logs nothing', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([account()]);
    tx.$queryRawUnsafe.mockResolvedValueOnce([]); // conditional insert affected 0 rows

    const res = await service.runEscalation({ asOf: '2026-04-10', ...actor });
    expect(res.actions).toHaveLength(0);
    expect(res.counts.formal_notice).toBe(0);
    // No notification when nothing was logged.
    expect(tx.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('passes the episode anchor (oldest overdue due date) to the dedupe guard', async () => {
    prisma.$queryRawUnsafe.mockResolvedValueOnce([account({ oldest_due: '2026-03-01' })]);
    tx.$queryRawUnsafe.mockResolvedValueOnce([{ action_id: 'act-3' }]);

    await service.runEscalation({ asOf: '2026-04-10', ...actor });
    expect(tx.$queryRawUnsafe.mock.calls[0]).toContain('2026-03-01');
  });
});
