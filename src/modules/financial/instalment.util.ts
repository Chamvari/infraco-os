/**
 * Pure instalment-maths helpers for Module A (SRS §4.2, FIN-INST-001..002).
 *
 * Kept free of Prisma/Nest so the rounding behaviour can be unit-tested directly.
 * All money is handled in integer cents internally to avoid float drift, then
 * returned as 2-decimal numbers. The schedule ALWAYS sums exactly to `financed`,
 * with any rounding remainder absorbed by the FINAL instalment.
 */

export type InstalmentStructure = 'equal' | 'balloon';

export class InstalmentError extends Error {}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Compute the per-instalment amounts for a financed amount.
 *
 *  - equal:   (financed / n), with the last instalment absorbing the remainder.
 *  - balloon: first (n-1) instalments are equal and small; the final instalment
 *             is the balloon. `balloonAmount` must be > 0 and < financed, and
 *             n must be >= 2. The final instalment equals the balloon plus the
 *             rounding remainder so the schedule still sums exactly to financed.
 *
 * Returns an array of length n. Sum(result) === financed (to the cent).
 */
export function computeInstalmentAmounts(
  financed: number,
  n: number,
  structure: InstalmentStructure = 'equal',
  balloonAmount?: number,
): number[] {
  if (!Number.isInteger(n) || n <= 0) {
    throw new InstalmentError('numInstalments must be a positive integer.');
  }
  if (financed < 0) {
    throw new InstalmentError('financed amount cannot be negative.');
  }

  const cents = toCents(financed);

  if (structure === 'balloon') {
    if (n < 2) {
      throw new InstalmentError('balloon schedules require at least 2 instalments.');
    }
    if (balloonAmount === undefined || balloonAmount === null) {
      throw new InstalmentError('balloonAmount is required for a balloon schedule.');
    }
    const balloonCents = toCents(balloonAmount);
    if (balloonCents <= 0 || balloonCents >= cents) {
      throw new InstalmentError(
        'balloonAmount must be greater than 0 and less than the financed amount.',
      );
    }
    const regular = cents - balloonCents;
    const perCents = Math.round(regular / (n - 1));
    const amounts: number[] = [];
    for (let i = 0; i < n - 1; i++) amounts.push(fromCents(perCents));
    // Final instalment = balloon + whatever rounding remains.
    amounts.push(fromCents(cents - perCents * (n - 1)));
    return amounts;
  }

  // equal
  const perCents = Math.round(cents / n);
  const amounts: number[] = [];
  for (let i = 0; i < n - 1; i++) amounts.push(fromCents(perCents));
  amounts.push(fromCents(cents - perCents * (n - 1)));
  return amounts;
}

/**
 * Map a count of days overdue to the SRS arrears risk bucket
 * (FIN-ARR-001 / fin.arrears_risk): current, 1-30, 31-60, 61-90, 90+.
 */
export type ArrearsRisk = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus';

export function arrearsBucket(daysOverdue: number): ArrearsRisk {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'd1_30';
  if (daysOverdue <= 60) return 'd31_60';
  if (daysOverdue <= 90) return 'd61_90';
  return 'd90_plus';
}
