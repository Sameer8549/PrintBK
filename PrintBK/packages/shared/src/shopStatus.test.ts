import { describe, it, expect } from 'vitest';
import { computeEffectiveShopStatus, isWithinOperationalHours, parseTimeToMinutes } from './shopStatus';

describe('shopStatus engine', () => {
  it('parses time strings accurately', () => {
    expect(parseTimeToMinutes('8:30 AM')).toBe(8 * 60 + 30);
    expect(parseTimeToMinutes('6:00 PM')).toBe(18 * 60);
    expect(parseTimeToMinutes('12:00 AM')).toBe(0);
    expect(parseTimeToMinutes('12:00 PM')).toBe(12 * 60);
  });

  it('respects manual CLOSED override above all other settings', () => {
    const status = computeEffectiveShopStatus({
      open: false,
      paused: false,
      hours_enabled: false,
      announcement: 'Renovation today'
    });
    expect(status.open).toBe(false);
    expect(status.reason).toBe('manual');
    expect(status.announcement).toBe('Renovation today');
  });

  it('respects temporary pause when manual is open', () => {
    const status = computeEffectiveShopStatus({
      open: true,
      paused: true,
      announcement: 'Quick 10-minute break'
    });
    expect(status.open).toBe(false);
    expect(status.reason).toBe('paused');
    expect(status.announcement).toBe('Quick 10-minute break');
  });

  it('evaluates scheduled hours when hours_enabled is true', () => {
    // Sunday check
    const sundayDate = new Date('2026-10-18T10:00:00Z'); // Sunday
    const { within: sundayWithin, reopenAt: sundayReopen } = isWithinOperationalHours('8:30 AM – 6:00 PM (Mon–Sat)', sundayDate);
    expect(sundayWithin).toBe(false);
    expect(sundayReopen).toBe('Monday at 8:30 AM');

    // Monday morning before open (7:00 AM IST)
    const earlyDate = new Date('2026-10-19T01:30:00Z'); // 7:00 AM IST
    const { within: earlyWithin, reopenAt: earlyReopen } = isWithinOperationalHours('8:30 AM – 6:00 PM (Mon–Sat)', earlyDate);
    expect(earlyWithin).toBe(false);
    expect(earlyReopen).toBe('Today at 8:30 AM');

    // Monday during working hours (11:00 AM IST)
    const openDate = new Date('2026-10-19T05:30:00Z'); // 11:00 AM IST
    const { within: openWithin } = isWithinOperationalHours('8:30 AM – 6:00 PM (Mon–Sat)', openDate);
    expect(openWithin).toBe(true);
  });

  it('returns open: true when manual open is enabled and within hours', () => {
    const status = computeEffectiveShopStatus({
      open: true,
      paused: false,
      hours_enabled: false
    });
    expect(status.open).toBe(true);
    expect(status.reason).toBe('open');
    expect(status.closedSince).toBeNull();
  });
});
