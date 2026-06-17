import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  CURRENCY_CODES,
  CurrencyCode,
  ApprovalStatus,
} from '../../common/enums';

/**
 * The actor performing an action, derived server-side from the verified JWT
 * (never from the request body). Fed to prisma.withActor() for the audit trail.
 */
interface Actor {
  actorId: string;
  actorRole: string;
}

/** A resolved Delegation-of-Authority rule for an (action_code, currency). */
export interface DoaRule {
  ruleId: string;
  /** threshold; null = applies to any amount. */
  maxAmount: number | null;
  dualAuth: boolean;
}

export interface DoaDecision {
  /** true when the amount requires two distinct signatories before execution. */
  required: boolean;
  /** the threshold that applied (null when a rule applies to any amount). */
  threshold: number | null;
  ruleId: string | null;
}

export interface InitiateParams {
  actionCode: string;
  amount: number;
  currency?: CurrencyCode;
  entityRef?: string | null;
  /** the transaction to perform once approved; returned verbatim by execute(). */
  payload?: unknown;
}

export interface ApprovalRecord {
  approvalId: string;
  actionCode: string;
  entityRef: string | null;
  amount: number;
  currency: CurrencyCode;
  status: ApprovalStatus;
  threshold: number | null;
  initiatedBy: string;
  initiatedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  executedAt: string | null;
}

interface ApprovalRow {
  approval_id: string;
  action_code: string;
  entity_ref: string | null;
  amount: string;
  currency: CurrencyCode;
  status: ApprovalStatus;
  threshold: string | null;
  initiated_by: string;
  initiated_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  executed_at: string | null;
  payload?: unknown;
}

/**
 * ApprovalService — Module Z, Delegation-of-Authority dual-authorisation
 * (PLAT-AUTH-005). Replaces the hard-coded dual-auth in LedgerService with a
 * configurable, rule-driven approval workflow read from core.authority_rule:
 *
 *   initiate → pending → approve / reject → execute
 *
 * Rules are keyed by (action_code, currency). A rule with dual_auth = true means
 * amounts strictly ABOVE its max_amount require two DISTINCT authorised
 * signatories (max_amount = 0 ⇒ every such transaction; null ⇒ any amount).
 * An unapproved high-value transaction cannot be executed: execute() refuses
 * any request not in the 'approved' state. Every state change runs inside
 * prisma.withActor(), so the core.capture_audit trigger records who did what.
 */
@Injectable()
export class ApprovalService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the DoA rule for an (action_code, currency). Prefers a dual_auth
   * rule with the lowest (most conservative) threshold; nulls sort first so an
   * "any amount" rule wins over a numeric ceiling.
   */
  private async resolveRule(
    actionCode: string,
    currency: CurrencyCode,
  ): Promise<DoaRule | null> {
    const rows = await this.prisma.$queryRawUnsafe<
      { rule_id: string; max_amount: string | null; dual_auth: boolean }[]
    >(
      `SELECT rule_id::text AS rule_id, max_amount, dual_auth
         FROM core.authority_rule
        WHERE action_code = $1
          AND currency = $2::fin.currency_code
        ORDER BY dual_auth DESC, max_amount ASC NULLS FIRST
        LIMIT 1`,
      actionCode,
      currency,
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      ruleId: r.rule_id,
      maxAmount: r.max_amount === null ? null : Number(r.max_amount),
      dualAuth: r.dual_auth,
    };
  }

  /** Whether an amount triggers a rule's dual-auth threshold. */
  private triggers(rule: DoaRule, amount: number): boolean {
    if (!rule.dualAuth) return false;
    if (rule.maxAmount === null) return true;
    return amount > rule.maxAmount;
  }

  /**
   * Decide whether a transaction needs dual authorisation. Callers (e.g. the
   * ledger) use this to route a high-value transaction through initiate()
   * instead of executing it directly.
   */
  async requiresApproval(
    actionCode: string,
    amount: number,
    currency: CurrencyCode = 'USD',
  ): Promise<DoaDecision> {
    const rule = await this.resolveRule(actionCode, currency);
    if (!rule || !this.triggers(rule, amount)) {
      return { required: false, threshold: rule?.maxAmount ?? null, ruleId: rule?.ruleId ?? null };
    }
    return { required: true, threshold: rule.maxAmount, ruleId: rule.ruleId };
  }

  /**
   * Initiate an approval request for a transaction that exceeds its DoA
   * threshold. Rejected if the transaction does NOT require dual auth (it should
   * be executed directly) — keeping the workflow meaningful and auditable.
   */
  async initiate(p: InitiateParams, actor: Actor): Promise<ApprovalRecord> {
    if (!p.actionCode || p.actionCode.trim() === '') {
      throw new BadRequestException('An action_code is required.');
    }
    if (!(p.amount > 0)) {
      throw new BadRequestException('Amount must be greater than 0.');
    }
    const currency: CurrencyCode = p.currency ?? 'USD';
    if (!CURRENCY_CODES.includes(currency)) {
      throw new BadRequestException(`Invalid currency '${currency}'.`);
    }

    const rule = await this.resolveRule(p.actionCode, currency);
    if (!rule || !this.triggers(rule, p.amount)) {
      throw new BadRequestException(
        'This transaction is below the dual-authorisation threshold and may be executed directly.',
      );
    }

    const row = await this.prisma.withActor(
      actor.actorId,
      actor.actorRole,
      async (tx) => {
        const rows = await tx.$queryRawUnsafe<ApprovalRow[]>(
          `INSERT INTO core.approval_request
             (action_code, entity_ref, amount, currency, payload, threshold, rule_id, initiated_by)
           VALUES ($1, $2, $3, $4::fin.currency_code, $5::jsonb, $6, $7::uuid, $8::uuid)
           RETURNING approval_id::text AS approval_id, action_code, entity_ref,
                     amount::text AS amount, currency, threshold::text AS threshold,
                     status, initiated_by::text AS initiated_by,
                     initiated_at::text AS initiated_at,
                     decided_by::text AS decided_by, decided_at::text AS decided_at,
                     decision_note, executed_at::text AS executed_at`,
          p.actionCode,
          p.entityRef ?? null,
          p.amount,
          currency,
          p.payload === undefined ? null : JSON.stringify(p.payload),
          rule.maxAmount,
          rule.ruleId,
          actor.actorId,
        );
        return rows[0];
      },
    );

    return this.toRecord(row);
  }

  /**
   * Approve a pending request. The approver MUST be a different user from the
   * initiator (PLAT-AUTH-005 — two distinct signatories).
   */
  async approve(
    approvalId: string,
    actor: Actor,
    note?: string,
  ): Promise<ApprovalRecord> {
    return this.decide(approvalId, actor, 'approved', note);
  }

  /** Reject a pending request. Also requires a distinct second signatory. */
  async reject(
    approvalId: string,
    actor: Actor,
    reason?: string,
  ): Promise<ApprovalRecord> {
    return this.decide(approvalId, actor, 'rejected', reason);
  }

  private async decide(
    approvalId: string,
    actor: Actor,
    decision: 'approved' | 'rejected',
    note?: string,
  ): Promise<ApprovalRecord> {
    const row = await this.prisma.withActor(
      actor.actorId,
      actor.actorRole,
      async (tx) => {
        const found = await tx.$queryRawUnsafe<
          { status: ApprovalStatus; initiated_by: string }[]
        >(
          `SELECT status, initiated_by::text AS initiated_by
             FROM core.approval_request
            WHERE approval_id = $1::uuid
            FOR UPDATE`,
          approvalId,
        );
        if (!found.length) throw new NotFoundException('Approval request not found.');
        const current = found[0];
        if (current.status !== 'pending') {
          throw new ConflictException(
            `Approval request is already ${current.status}.`,
          );
        }
        if (current.initiated_by === actor.actorId) {
          throw new ForbiddenException(
            'The second approver must be a different user from the initiator.',
          );
        }

        const rows = await tx.$queryRawUnsafe<ApprovalRow[]>(
          `UPDATE core.approval_request
              SET status = $2::core.approval_status,
                  decided_by = $3::uuid,
                  decided_at = now(),
                  decision_note = $4
            WHERE approval_id = $1::uuid
          RETURNING approval_id::text AS approval_id, action_code, entity_ref,
                    amount::text AS amount, currency, threshold::text AS threshold,
                    status, initiated_by::text AS initiated_by,
                    initiated_at::text AS initiated_at,
                    decided_by::text AS decided_by, decided_at::text AS decided_at,
                    decision_note, executed_at::text AS executed_at`,
          approvalId,
          decision,
          actor.actorId,
          note ?? null,
        );
        return rows[0];
      },
    );
    return this.toRecord(row);
  }

  /**
   * Execute an approved transaction. This is the enforcement point: a request
   * that is not 'approved' CANNOT execute (PLAT-AUTH-005). Returns the stored
   * payload so the caller can perform the underlying action.
   */
  async execute(
    approvalId: string,
    actor: Actor,
  ): Promise<{ record: ApprovalRecord; payload: unknown }> {
    const result = await this.prisma.withActor(
      actor.actorId,
      actor.actorRole,
      async (tx) => {
        const found = await tx.$queryRawUnsafe<
          { status: ApprovalStatus; payload: unknown }[]
        >(
          `SELECT status, payload
             FROM core.approval_request
            WHERE approval_id = $1::uuid
            FOR UPDATE`,
          approvalId,
        );
        if (!found.length) throw new NotFoundException('Approval request not found.');
        const current = found[0];
        if (current.status === 'executed') {
          throw new ConflictException('Approval request has already been executed.');
        }
        if (current.status !== 'approved') {
          throw new ForbiddenException(
            `Cannot execute: approval request is ${current.status}. A high-value transaction requires dual authorisation before execution.`,
          );
        }

        const rows = await tx.$queryRawUnsafe<ApprovalRow[]>(
          `UPDATE core.approval_request
              SET status = 'executed', executed_at = now()
            WHERE approval_id = $1::uuid
          RETURNING approval_id::text AS approval_id, action_code, entity_ref,
                    amount::text AS amount, currency, threshold::text AS threshold,
                    status, initiated_by::text AS initiated_by,
                    initiated_at::text AS initiated_at,
                    decided_by::text AS decided_by, decided_at::text AS decided_at,
                    decision_note, executed_at::text AS executed_at`,
          approvalId,
        );
        return { row: rows[0], payload: current.payload };
      },
    );
    return { record: this.toRecord(result.row), payload: result.payload };
  }

  /** Fetch a single approval request. */
  async get(approvalId: string): Promise<ApprovalRecord> {
    const rows = await this.prisma.$queryRawUnsafe<ApprovalRow[]>(
      `SELECT approval_id::text AS approval_id, action_code, entity_ref,
              amount::text AS amount, currency, threshold::text AS threshold,
              status, initiated_by::text AS initiated_by,
              initiated_at::text AS initiated_at,
              decided_by::text AS decided_by, decided_at::text AS decided_at,
              decision_note, executed_at::text AS executed_at
         FROM core.approval_request
        WHERE approval_id = $1::uuid`,
      approvalId,
    );
    if (!rows.length) throw new NotFoundException('Approval request not found.');
    return this.toRecord(rows[0]);
  }

  /** List approval requests, optionally filtered by status and/or action_code. */
  async list(filter?: {
    status?: ApprovalStatus;
    actionCode?: string;
  }): Promise<ApprovalRecord[]> {
    const rows = await this.prisma.$queryRawUnsafe<ApprovalRow[]>(
      `SELECT approval_id::text AS approval_id, action_code, entity_ref,
              amount::text AS amount, currency, threshold::text AS threshold,
              status, initiated_by::text AS initiated_by,
              initiated_at::text AS initiated_at,
              decided_by::text AS decided_by, decided_at::text AS decided_at,
              decision_note, executed_at::text AS executed_at
         FROM core.approval_request
        WHERE ($1::core.approval_status IS NULL OR status = $1::core.approval_status)
          AND ($2::text IS NULL OR action_code = $2::text)
        ORDER BY initiated_at DESC`,
      filter?.status ?? null,
      filter?.actionCode ?? null,
    );
    return rows.map((r) => this.toRecord(r));
  }

  private toRecord(r: ApprovalRow): ApprovalRecord {
    return {
      approvalId: r.approval_id,
      actionCode: r.action_code,
      entityRef: r.entity_ref,
      amount: Number(r.amount),
      currency: r.currency,
      status: r.status,
      threshold: r.threshold === null ? null : Number(r.threshold),
      initiatedBy: r.initiated_by,
      initiatedAt: r.initiated_at,
      decidedBy: r.decided_by,
      decidedAt: r.decided_at,
      decisionNote: r.decision_note,
      executedAt: r.executed_at,
    };
  }
}
