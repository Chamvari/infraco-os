import {
  computeInstalmentAmounts,
  arrearsBucket,
  InstalmentError,
} from './instalment.util';

const sumCents = (xs: number[]): number =>
  xs.reduce((a, b) => a + Math.round(b * 100), 0);

describe('computeInstalmentAmounts', () => {
  describe('equal structure', () => {
    it('splits an evenly divisible amount into equal instalments', () => {
      const a = computeInstalmentAmounts(12000, 12, 'equal');
      expect(a).toHaveLength(12);
      expect(a.every((x) => x === 1000)).toBe(true);
      expect(sumCents(a)).toBe(1200000);
    });

    it('absorbs the rounding remainder in the FINAL instalment', () => {
      const a = computeInstalmentAmounts(10000, 3, 'equal');
      expect(a).toEqual([3333.33, 3333.33, 3333.34]);
      // first n-1 are equal; the last carries the extra cent
      expect(a[0]).toBe(a[1]);
      expect(a[2]).not.toBe(a[0]);
      expect(sumCents(a)).toBe(1000000); // sums EXACTLY to financed
    });

    it('handles a sub-dollar remainder (100 / 3)', () => {
      const a = computeInstalmentAmounts(100, 3, 'equal');
      expect(a).toEqual([33.33, 33.33, 33.34]);
      expect(sumCents(a)).toBe(10000);
    });

    it('defaults to equal when no structure is given', () => {
      expect(computeInstalmentAmounts(900, 3)).toEqual([300, 300, 300]);
    });

    it('supports a single instalment', () => {
      expect(computeInstalmentAmounts(500, 1)).toEqual([500]);
    });

    it('handles a zero financed amount', () => {
      expect(computeInstalmentAmounts(0, 4)).toEqual([0, 0, 0, 0]);
    });
  });

  describe('balloon structure', () => {
    it('makes the final instalment the balloon, the rest equal', () => {
      const a = computeInstalmentAmounts(10000, 4, 'balloon', 4000);
      expect(a).toEqual([2000, 2000, 2000, 4000]);
      expect(sumCents(a)).toBe(1000000);
      // balloon (final) is larger than the regular instalments
      expect(a[3]).toBeGreaterThan(a[0]);
    });

    it('absorbs the rounding remainder in the final (balloon) instalment', () => {
      const a = computeInstalmentAmounts(10000, 3, 'balloon', 3333.33);
      expect(a).toHaveLength(3);
      expect(a[0]).toBe(a[1]); // regular instalments equal
      expect(sumCents(a)).toBe(1000000); // still sums exactly to financed
      // final carries the remainder rather than being exactly the balloon
      expect(a[2]).not.toBe(a[0]);
    });

    it('rejects a balloon schedule with fewer than 2 instalments', () => {
      expect(() => computeInstalmentAmounts(10000, 1, 'balloon', 5000)).toThrow(
        InstalmentError,
      );
    });

    it('requires a balloon amount', () => {
      expect(() => computeInstalmentAmounts(10000, 4, 'balloon')).toThrow(
        InstalmentError,
      );
    });

    it('rejects a balloon >= the financed amount', () => {
      expect(() =>
        computeInstalmentAmounts(10000, 4, 'balloon', 10000),
      ).toThrow(InstalmentError);
    });

    it('rejects a non-positive balloon', () => {
      expect(() => computeInstalmentAmounts(10000, 4, 'balloon', 0)).toThrow(
        InstalmentError,
      );
    });
  });

  describe('validation', () => {
    it('rejects a non-positive instalment count', () => {
      expect(() => computeInstalmentAmounts(1000, 0)).toThrow(InstalmentError);
      expect(() => computeInstalmentAmounts(1000, -2)).toThrow(InstalmentError);
    });

    it('rejects a fractional instalment count', () => {
      expect(() => computeInstalmentAmounts(1000, 2.5)).toThrow(InstalmentError);
    });

    it('rejects a negative financed amount', () => {
      expect(() => computeInstalmentAmounts(-1, 3)).toThrow(InstalmentError);
    });
  });
});

describe('arrearsBucket', () => {
  it.each([
    [-5, 'current'],
    [0, 'current'],
    [1, 'd1_30'],
    [30, 'd1_30'],
    [31, 'd31_60'],
    [60, 'd31_60'],
    [61, 'd61_90'],
    [90, 'd61_90'],
    [91, 'd90_plus'],
    [365, 'd90_plus'],
  ] as const)('maps %i days overdue to %s', (days, expected) => {
    expect(arrearsBucket(days)).toBe(expected);
  });
});
