import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ApprovalService } from './approval.service';
import { PrismaService } from '../../prisma.service';

/**
 * Unit tests for ApprovalService (PLAT-AUTH-005 — Delegation-of-Authority dual
 * authorisation). Prisma is mocked: $queryRawUnsafe (reads: rule lookup, get,
 * list) and withActor (audited writes) route their fake responses by SQL text,
 * so we can assert the threshold logic, the distinct-signatory rule, and the
 * "unapproved high-value transaction cannot execute" guard without a database.
 */
describe('ApprovalService', () => {
  let service: ApprovalService;
  let tx: { $queryRawUnsafe: jest.Mock; $executeRawUnsafe: jest.Mock };
  let prisma: { $queryRawUnsafe: jest.Mock; withActor: jest.Mock };

  const initiator = { actorId: 'user-init', actorRole: 'finance' };
  const approver = { actorId: 'user-appr', actorRole: 'finance_mgr' };

  // A full approval_request row as returned by INSERT/UPDATE ... RETURNING.
  const makeRow = (over: Record<string, unknown> = {}) => ({
    approval_id: 'appr-1',
    action_code: 'ledger.adjustment',
    entity_ref: null,
    amount: '6000',
    currency: 'USD',
    status: 'pending',
    threshold: '5000',
    initiated_by: 'user-init',
    initiated_at: '2026-06-17T00:00:00Z',
    decided_by: null,
    decided_at: null,
    decision_note: null,
    executed_at: null,
    payload: null,
    ...over,
  });

  /**
   * Wire up the mocks for one scenario.
   *  - rule:    the resolved core.authority_rule row (or null for "no rule")
   *  - current: the FOR-UPDATE snapshot {status, initiated_by, payload}
   *  - readRows: rows returned by get()/list()
   */
  function wire(opts: {
    rule?: { rule_id: string; max_amount: string | null; dual_auth: boolean } | null;
    current?: { status: string; initiated_by: string; payload?: unknown };
    readRows?: unknown[];
  } = {}) {
    tx = {
      $queryRawUnsafe: jest.fn().mockImplementation(async (sql: string, ...args: unknown[]) => {
        if (sql.includes('INSERT INTO core.approval_request')) {
          return [
            makeRow({
              action_code: args[0],
              entity_ref: args[1] ?? null,
              amount: String(args[2]),
              currency: args[3],
              threshold: args[5] === null ? null : String(args[5]),
              initiated_by: args[7],
              status: 'pending',
            }),
          ];
        }
        if (sql.includes('FOR UPDATE')) {
          return opts.current ? [opts.current] : [];
        }
        if (sql.includes("SET status = 'executed'")) {
          return [makeRow({ status: 'executed', executed_at: '2026-06-17T01:00:00Z' })];
        }
        if (sql.includes('SET status = $2::core.approval_status')) {
          return [
            makeRow({
              status: args[1],
              decided_by: args[2],
              decided_at: '2026-06-17T01:00:00Z',
              decision_note: args[3] ?? null,
            }),
          ];
        }
        return [];
      }),
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    };
    prisma = {
      $queryRawUnsafe: jest.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('FROM core.authority_rule')) {
          return opts.rule === undefined ? [] : opts.rule === null ? [] : [opts.rule];
        }
        if (sql.includes('FROM core.approval_request')) {
          return opts.readRows ?? [];
        }
        return [];
      }),
      withActor: jest.fn((_a: string, _r: string, fn: (x: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    service = new ApprovalService(prisma as unknown as PrismaService);
  }

  const dualRule = { rule_id: 'rule-1', max_amount: '5000', dual_auth: true };
  const anyAmountRule = { rule_id: 'rule-2', max_amount: null, dual_auth: true };

  // ---- requiresApproval (threshold per transaction type + currency) --------

  describe('requiresApproval', () => {
    it('requires dual auth when the amount exceeds the threshold', async () => {
      wire({ rule: dualRule });
      const d = await service.requiresApproval('ledger.adjustment', 6000, 'USD');
      expect(d).toEqual({ required: true, threshold: 5000, ruleId: 'rule-1' });
    });

    it('does not require dual auth at or below the threshold', async () => {
      wire({ rule: dualRule });
      const d = await service.requiresApproval('ledger.adjustment', 5000, 'USD');
      expect(d.required).toBe(false);
    });

    it('requires dual auth for any amount when max_amount is null', async () => {
      wire({ rule: anyAmountRule });
      const d = await service.requiresApproval('ledger.writeoff', 1, 'USD');
      expect(d).toEqual({ required: true, threshold: null, ruleId: 'rule-2' });
    });

    it('does not require dual auth when no rule is configured', async () => {
      wire({ rule: null });
      const d = await service.requiresApproval('unknown.action', 999999, 'USD');
      expect(d.required).toBe(false);
    });
  });

  // ---- initiate ------------------------------------------------------------

  describe('initiate', () => {
    it('creates a pending request for an above-threshold transaction', async () => {
      wire({ rule: dualRule });
      const rec = await service.initiate(
        { actionCode: 'ledger.adjustment', amount: 6000, currency: 'USD' },
        initiator,
      );
      expect(rec.status).toBe('pending');
      expect(rec.amount).toBe(6000);
      expect(rec.threshold).toBe(5000);
      expect(rec.initiatedBy).toBe('user-init');
      // The write went through withActor (audit context set).
      expect(prisma.withActor).toHaveBeenCalledWith('user-init', 'finance', expect.any(Function));
    });

    it('serialises payload as jsonb and stores the rule threshold', async () => {
      wire({ rule: dualRule });
      await service.initiate(
        { actionCode: 'ledger.adjustment', amount: 6000, payload: { foo: 'bar' } },
        initiator,
      );
      const insert = tx.$queryRawUnsafe.mock.calls.find((c) =>
        String(c[0]).includes('INSERT INTO core.approval_request'),
      );
      expect(insert![5]).toBe(JSON.stringify({ foo: 'bar' })); // payload jsonb
      expect(insert![6]).toBe(5000); // threshold from rule
    });

    it('rejects a transaction below the dual-auth threshold', async () => {
      wire({ rule: dualRule });
      await expect(
        service.initiate({ actionCode: 'ledger.adjustment', amount: 4000 }, initiator),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when no rule requires dual auth', async () => {
      wire({ rule: null });
      await expect(
        service.initiate({ actionCode: 'unknown.action', amount: 1000000 }, initiator),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a non-positive amount', async () => {
      wire({ rule: dualRule });
      await expect(
        service.initiate({ actionCode: 'ledger.adjustment', amount: 0 }, initiator),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an empty action code', async () => {
      wire({ rule: dualRule });
      await expect(
        service.initiate({ actionCode: '   ', amount: 6000 }, initiator),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an invalid currency', async () => {
      wire({ rule: dualRule });
      await expect(
        service.initiate(
          { actionCode: 'ledger.adjustment', amount: 6000, currency: 'XXX' as never },
          initiator,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ---- approve / reject (two distinct signatories) -------------------------

  describe('approve', () => {
    it('approves a pending request by a distinct second signatory', async () => {
      wire({ current: { status: 'pending', initiated_by: 'user-init' } });
      const rec = await service.approve('appr-1', approver, 'looks good');
      expect(rec.status).toBe('approved');
      expect(rec.decidedBy).toBe('user-appr');
      expect(rec.decisionNote).toBe('looks good');
    });

    it('refuses approval by the initiator (must be a different user)', async () => {
      wire({ current: { status: 'pending', initiated_by: 'user-init' } });
      await expect(service.approve('appr-1', initiator)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses to approve a request that is not pending', async () => {
      wire({ current: { status: 'approved', initiated_by: 'user-init' } });
      await expect(service.approve('appr-1', approver)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws when the request does not exist', async () => {
      wire({});
      await expect(service.approve('missing', approver)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('reject', () => {
    it('rejects a pending request by a distinct signatory', async () => {
      wire({ current: { status: 'pending', initiated_by: 'user-init' } });
      const rec = await service.reject('appr-1', approver, 'over budget');
      expect(rec.status).toBe('rejected');
      expect(rec.decisionNote).toBe('over budget');
    });

    it('refuses rejection by the initiator', async () => {
      wire({ current: { status: 'pending', initiated_by: 'user-init' } });
      await expect(service.reject('appr-1', initiator)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // ---- execute (unapproved high-value transaction cannot execute) ----------

  describe('execute', () => {
    it('executes an approved request and returns the payload', async () => {
      wire({ current: { status: 'approved', initiated_by: 'user-init', payload: { x: 1 } } });
      const res = await service.execute('appr-1', approver);
      expect(res.record.status).toBe('executed');
      expect(res.record.executedAt).toBeTruthy();
      expect(res.payload).toEqual({ x: 1 });
    });

    it('REFUSES to execute a pending (unapproved) request', async () => {
      wire({ current: { status: 'pending', initiated_by: 'user-init' } });
      await expect(service.execute('appr-1', approver)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses to execute a rejected request', async () => {
      wire({ current: { status: 'rejected', initiated_by: 'user-init' } });
      await expect(service.execute('appr-1', approver)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses to execute an already-executed request', async () => {
      wire({ current: { status: 'executed', initiated_by: 'user-init' } });
      await expect(service.execute('appr-1', approver)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws when the request does not exist', async () => {
      wire({});
      await expect(service.execute('missing', approver)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ---- reads ---------------------------------------------------------------

  describe('get / list', () => {
    it('returns a mapped record for get', async () => {
      wire({ readRows: [makeRow({ status: 'approved', decided_by: 'user-appr' })] });
      const rec = await service.get('appr-1');
      expect(rec.approvalId).toBe('appr-1');
      expect(rec.status).toBe('approved');
      expect(rec.amount).toBe(6000);
    });

    it('throws NotFound when get finds nothing', async () => {
      wire({ readRows: [] });
      await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('maps a list of records', async () => {
      wire({ readRows: [makeRow(), makeRow({ approval_id: 'appr-2' })] });
      const recs = await service.list({ status: 'pending' });
      expect(recs).toHaveLength(2);
      expect(recs[1].approvalId).toBe('appr-2');
    });
  });
});
