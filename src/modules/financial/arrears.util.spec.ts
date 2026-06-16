import { ESCALATION_LADDER, highestDueRung } from './arrears.util';

/** Unit tests for the pure arrears-escalation ladder (FIN-ARR-002). */
describe('arrears.util', () => {
  describe('highestDueRung', () => {
    it('returns null below the first threshold', () => {
      expect(highestDueRung(0)).toBeNull();
      expect(highestDueRung(6)).toBeNull();
    });

    it('fires reminder from day 7 to day 29', () => {
      expect(highestDueRung(7)?.stage).toBe('reminder');
      expect(highestDueRung(29)?.stage).toBe('reminder');
    });

    it('fires formal notice from day 30 to day 89', () => {
      expect(highestDueRung(30)?.stage).toBe('formal_notice');
      expect(highestDueRung(89)?.stage).toBe('formal_notice');
    });

    it('fires legal referral from day 90 onward', () => {
      expect(highestDueRung(90)?.stage).toBe('legal_referral');
      expect(highestDueRung(2000)?.stage).toBe('legal_referral');
    });

    it('carries the template and channel for each rung', () => {
      expect(highestDueRung(7)).toMatchObject({
        template: 'arrears_reminder',
        channel: 'sms',
      });
      expect(highestDueRung(90)).toMatchObject({
        template: 'arrears_legal_referral',
        channel: 'email',
      });
    });
  });

  it('ladder is ordered by ascending threshold', () => {
    const days = ESCALATION_LADDER.map((r) => r.minDays);
    expect(days).toEqual([...days].sort((a, b) => a - b));
  });
});
