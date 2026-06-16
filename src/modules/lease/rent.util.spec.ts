import {
  RentError,
  parseYmd,
  firstOfMonth,
  billingPeriodKey,
  escalationCount,
  effectiveRent,
  addYears,
} from './rent.util';

/**
 * Unit tests for the pure rent-maths helpers (FIN-RENT-001/002). No DB or Nest.
 */
describe('rent.util', () => {
  describe('parseYmd / firstOfMonth / billingPeriodKey', () => {
    it('parses a plain date', () => {
      expect(parseYmd('2026-06-15')).toEqual({ y: 2026, m: 6, d: 15 });
    });

    it('parses a timestamp prefix', () => {
      expect(parseYmd('2026-06-15T09:30:00Z')).toEqual({ y: 2026, m: 6, d: 15 });
    });

    it('rejects malformed input', () => {
      expect(() => parseYmd('15/06/2026')).toThrow(RentError);
    });

    it('normalises to the first of the month and the period key', () => {
      expect(firstOfMonth('2026-06-15')).toBe('2026-06-01');
      expect(billingPeriodKey('2026-06-15')).toBe('202606');
      expect(billingPeriodKey('2026-01-03')).toBe('202601');
    });
  });

  describe('escalationCount', () => {
    it('is 0 when no anniversary is configured', () => {
      expect(escalationCount(null, '2030-01-01')).toBe(0);
    });

    it('is 0 before the first anniversary', () => {
      expect(escalationCount('2026-01-01', '2025-12-31')).toBe(0);
    });

    it('is 1 on the anniversary and through that year', () => {
      expect(escalationCount('2026-01-01', '2026-01-01')).toBe(1);
      expect(escalationCount('2026-01-01', '2026-12-31')).toBe(1);
    });

    it('increments each subsequent anniversary', () => {
      expect(escalationCount('2026-01-01', '2027-01-01')).toBe(2);
      expect(escalationCount('2026-01-01', '2029-06-15')).toBe(4);
    });
  });

  describe('effectiveRent', () => {
    it('returns base rent when no escalation is set', () => {
      expect(effectiveRent(1000, 0, '2026-01-01', '2030-01-01')).toBe(1000);
      expect(effectiveRent(1000, null, null, '2030-01-01')).toBe(1000);
    });

    it('returns base rent before the first anniversary', () => {
      expect(effectiveRent(1000, 10, '2026-01-01', '2025-06-01')).toBe(1000);
    });

    it('applies one escalation on/after the first anniversary', () => {
      expect(effectiveRent(1000, 10, '2026-01-01', '2026-03-01')).toBe(1100);
    });

    it('compounds escalation across multiple anniversaries', () => {
      // 1000 * 1.1^3 = 1331
      expect(effectiveRent(1000, 10, '2026-01-01', '2028-05-01')).toBe(1331);
    });

    it('rounds to 2 decimals', () => {
      // 850 * 1.075 = 913.75
      expect(effectiveRent(850, 7.5, '2026-01-01', '2026-06-01')).toBe(913.75);
    });

    it('rejects negative base rent', () => {
      expect(() => effectiveRent(-1, 5, '2026-01-01', '2026-06-01')).toThrow(
        RentError,
      );
    });
  });

  describe('addYears', () => {
    it('adds whole years', () => {
      expect(addYears('2026-06-15', 1)).toBe('2027-06-15');
    });

    it('clamps Feb 29 to Feb 28 in non-leap target years', () => {
      expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
      expect(addYears('2024-02-29', 4)).toBe('2028-02-29');
    });
  });
});
