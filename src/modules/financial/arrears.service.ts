import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  EscalationStage,
  ESCALATION_LADDER,
  highestDueRung,
} from './arrears.util';

interface Actor {
  actorId: string;
  actorRole: string;
}

export interface EscalationAction {
  accountId: string;
  customerId: string;
  stage: EscalationStage;
  daysOverdue: number;
  overdueAmount: number;
  currency: string;
}

/**
 * ArrearsService — Module A, arrears escalation engine (SRS §5.6, FIN-ARR-002;
 * the workflow Module C's LEASE-INV-002 reuses).
 *
 * runEscalation() is the daily sweep: it reads each account's live overdue
 * position, picks the highest escalation rung now due (reminder → formal notice
 * → legal referral), and — if that rung has not already fired in the CURRENT
 * arrears episode — logs an action to fin.arrears_action and queues a customer
 * notification. The legal-referral rung is a FLAG only; the system never
 * auto-writes-off (FIN-ARR-004 keeps write-offs manual + dual-authorised).
 *
 * Idempotency: the "current episode" is anchored on the oldest still-overdue
 * invoice's due date. An action counts as already-done only if it was triggered
 * on/after that anchor, so a daily run won't re-send the same rung, yet a fresh
 * arrears episode after the account catches up and falls behind again escalates
 * anew. The whole decision-and-insert is a single conditional INSERT, so
 * concurrent sweeps can't double-fire.
 */
@Injectable()
export class ArrearsService {
  constructor(private readonly prisma: PrismaService) {}

  async runEscalation(params: { asOf?: string } & Actor): Promise<{
    asOf: string;
    scanned: number;
    actions: EscalationAction[];
    counts: Record<EscalationStage, number>;
  }> {
    const asOf = params.asOf ?? new Date().toISOString().slice(0, 10);

    // Live overdue position per account: outstanding past-due value, the oldest
    // overdue due date (the episode anchor), and days overdue from it.
    const accounts = await this.prisma.$queryRawUnsafe<
      {
        account_id: string;
        customer_id: string;
        currency: string;
        overdue_amount: string;
        oldest_due: string;
        days_overdue: string;
      }[]
    >(
      `SELECT a.account_id::text AS account_id, a.customer_id::text AS customer_id,
              a.currency,
              SUM(i.amount - i.amount_paid)::text AS overdue_amount,
              MIN(i.due_date)::text AS oldest_due,
              ($1::date - MIN(i.due_date))::text AS days_overdue
         FROM fin.account a
         JOIN fin.invoice i ON i.account_id = a.account_id
        WHERE i.status IN ('issued','partially_paid','overdue')
          AND i.amount_paid < i.amount
          AND i.due_date < $1::date
        GROUP BY a.account_id, a.customer_id, a.currency
       HAVING ($1::date - MIN(i.due_date)) >= $2
        ORDER BY ($1::date - MIN(i.due_date)) DESC`,
      asOf,
      ESCALATION_LADDER[0].minDays,
    );

    const actions: EscalationAction[] = [];
    const counts: Record<EscalationStage, number> = {
      reminder: 0,
      formal_notice: 0,
      legal_referral: 0,
    };

    for (const acc of accounts) {
      const daysOverdue = Number(acc.days_overdue);
      const rung = highestDueRung(daysOverdue);
      if (!rung) continue; // HAVING already filtered, but stay defensive.

      const overdueAmount = Number(acc.overdue_amount);

      const fired = await this.prisma.withActor(
        params.actorId,
        params.actorRole,
        async (tx) => {
          // Conditional insert: log the action only if this rung hasn't already
          // fired since the episode anchor (oldest overdue due date).
          const ins = await tx.$queryRawUnsafe<{ action_id: string }[]>(
            `INSERT INTO fin.arrears_action (account_id, action_type, performed_by)
             SELECT $1::uuid, $2, NULL
              WHERE NOT EXISTS (
                SELECT 1 FROM fin.arrears_action
                 WHERE account_id = $1::uuid
                   AND action_type = $2
                   AND triggered_at >= $3::date
              )
             RETURNING action_id::text AS action_id`,
            acc.account_id,
            rung.stage,
            acc.oldest_due,
          );
          if (ins.length === 0) return false;

          await tx.$executeRawUnsafe(
            `INSERT INTO core.notification
               (recipient_kind, recipient_id, channel, template_code, payload)
             VALUES ('customer', $1::uuid, $2, $3, $4::jsonb)`,
            acc.customer_id,
            rung.channel,
            rung.template,
            JSON.stringify({
              accountId: acc.account_id,
              stage: rung.stage,
              daysOverdue,
              overdueAmount,
              currency: acc.currency,
            }),
          );
          return true;
        },
      );

      if (fired) {
        counts[rung.stage] += 1;
        actions.push({
          accountId: acc.account_id,
          customerId: acc.customer_id,
          stage: rung.stage,
          daysOverdue,
          overdueAmount,
          currency: acc.currency,
        });
      }
    }

    return { asOf, scanned: accounts.length, actions, counts };
  }

  /** The escalation-action history for one account (newest first). */
  async getAccountActions(accountId: string): Promise<
    Array<{ actionId: string; actionType: string; triggeredAt: string }>
  > {
    const rows = await this.prisma.$queryRawUnsafe<
      { action_id: string; action_type: string; triggered_at: string }[]
    >(
      `SELECT action_id::text AS action_id, action_type, triggered_at::text AS triggered_at
         FROM fin.arrears_action
        WHERE account_id = $1::uuid
        ORDER BY triggered_at DESC`,
      accountId,
    );
    return rows.map((r) => ({
      actionId: r.action_id,
      actionType: r.action_type,
      triggeredAt: r.triggered_at,
    }));
  }
}
