/**
 * Pure arrears-escalation helpers for Module A (SRS §5.6, FIN-ARR-002).
 *
 * The escalation ladder fires configured actions at day thresholds:
 *   reminder (day 7) → formal notice (day 30) → legal referral flag (day 90).
 * Kept free of Prisma/Nest so the threshold logic can be unit-tested directly.
 */

export type EscalationStage = 'reminder' | 'formal_notice' | 'legal_referral';

export interface EscalationRung {
  stage: EscalationStage;
  /** Inclusive minimum days overdue for this rung to apply. */
  minDays: number;
  /** core.notification template_code queued when the rung fires. */
  template: string;
  /** Notification channel for this rung. */
  channel: 'sms' | 'email';
}

/**
 * The escalation ladder, lowest threshold first (FIN-ARR-002 defaults).
 * A reminder nudges; a formal notice is on record; a legal-referral rung is a
 * FLAG only — the system never auto-acts on the debt beyond logging it
 * (write-offs stay manual + dual-authorised, FIN-ARR-004).
 */
export const ESCALATION_LADDER: readonly EscalationRung[] = [
  { stage: 'reminder', minDays: 7, template: 'arrears_reminder', channel: 'sms' },
  { stage: 'formal_notice', minDays: 30, template: 'arrears_formal_notice', channel: 'email' },
  { stage: 'legal_referral', minDays: 90, template: 'arrears_legal_referral', channel: 'email' },
];

/**
 * The HIGHEST rung an account at `daysOverdue` qualifies for, or null if it is
 * not yet past the first threshold.
 *
 * Firing only the highest due rung (rather than every crossed rung) means a
 * freshly-digitised legacy lease that is already years in arrears jumps
 * straight to a legal referral instead of being spammed with a day-7 reminder —
 * exactly the InfraCo backlog case. When the sweep runs daily on a fresh
 * arrears episode, the account still climbs reminder → notice → referral as each
 * threshold is crossed in turn.
 */
export function highestDueRung(daysOverdue: number): EscalationRung | null {
  let due: EscalationRung | null = null;
  for (const rung of ESCALATION_LADDER) {
    if (daysOverdue >= rung.minDays) due = rung;
  }
  return due;
}
