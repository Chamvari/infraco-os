/**
 * Pure rent-maths helpers for Module C (SRS §6, FIN-RENT-001/002).
 *
 * Kept free of Prisma/Nest so the escalation and period logic can be unit-tested
 * directly. Dates are handled as 'YYYY-MM-DD' strings to stay timezone-agnostic
 * (a rent run on a Postgres `date` column must not drift across UTC offsets).
 */

export class RentError extends Error {}

interface Ymd {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

/** Parse a 'YYYY-MM-DD' (optionally with a time suffix) into its parts. */
export function parseYmd(iso: string): Ymd {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) {
    throw new RentError(`Invalid date '${iso}'. Expected YYYY-MM-DD.`);
  }
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** First day of the month containing `iso`, as 'YYYY-MM-01'. */
export function firstOfMonth(iso: string): string {
  const { y, m } = parseYmd(iso);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

/** The 'YYYYMM' billing-period key for the month containing `iso`. */
export function billingPeriodKey(iso: string): string {
  const { y, m } = parseYmd(iso);
  return `${y}${String(m).padStart(2, '0')}`;
}

/**
 * Whole years elapsed from `from` up to and including `asOf`, by calendar date.
 * Returns a negative number when `asOf` precedes `from`. (e.g. from 2025-01-01
 * to 2025-12-31 → 0; to 2026-01-01 → 1; to 2024-06-01 → -1.)
 */
function completedYears(from: Ymd, asOf: Ymd): number {
  let years = asOf.y - from.y;
  if (asOf.m < from.m || (asOf.m === from.m && asOf.d < from.d)) {
    years -= 1;
  }
  return years;
}

/**
 * How many annual escalations have taken effect by `asOf`.
 *
 * `escalationAnniv` is the date the FIRST escalation applies (typically one year
 * into the lease). Before that date → 0; on/after it → 1; each subsequent
 * anniversary adds one. Returns 0 when there is no escalation configured.
 */
export function escalationCount(
  escalationAnnivIso: string | null | undefined,
  asOfIso: string,
): number {
  if (!escalationAnnivIso) return 0;
  const years = completedYears(parseYmd(escalationAnnivIso), parseYmd(asOfIso));
  return years < 0 ? 0 : years + 1;
}

/**
 * FIN-RENT-002 — the rent payable for the period containing `asOf`, applying
 * the annual escalation compounded once per elapsed anniversary. Rounded to 2dp.
 *
 *   effective = baseRent * (1 + pct/100) ^ escalationCount
 *
 * With no escalationPct or no anniversary, the base rent is returned unchanged.
 */
export function effectiveRent(
  baseRent: number,
  escalationPct: number | null | undefined,
  escalationAnnivIso: string | null | undefined,
  asOfIso: string,
): number {
  if (baseRent < 0) {
    throw new RentError('baseRent cannot be negative.');
  }
  if (!escalationPct || escalationPct === 0) return round2(baseRent);

  const n = escalationCount(escalationAnnivIso, asOfIso);
  const factor = Math.pow(1 + escalationPct / 100, n);
  return round2(baseRent * factor);
}

/** Add `years` to a 'YYYY-MM-DD', clamping Feb-29 → Feb-28 in non-leap years. */
export function addYears(iso: string, years: number): string {
  const { y, m, d } = parseYmd(iso);
  const ny = y + years;
  // Feb 29 only exists in leap years; clamp to 28 otherwise.
  const day = m === 2 && d === 29 && !isLeap(ny) ? 28 : d;
  return `${ny}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
