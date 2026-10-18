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

  it('allows manual OPEN switch outside scheduled hours as an "open now" override until next close', () => {
    // 7:00 AM IST on Monday (before 8:30 AM open)
    const earlyDate = new Date('2026-10-19T01:30:00Z');
    const earlySec = Math.floor(earlyDate.getTime() / 1000);

    const status = computeEffectiveShopStatus({
      open: true,
      paused: false,
      hours_enabled: true,
      hours: '8:30 AM – 6:00 PM (Mon–Sat)'
    }, earlySec);

    expect(status.open).toBe(true);
    expect(status.reason).toBe('override_open');
    expect(status.overrideActive).toBe(true);
    expect(status.overrideUntil).toBe('Today at 6:00 PM');
  });

  it('enforces closing always wins: switching manual to CLOSED immediately overrides open now override', () => {
    const earlyDate = new Date('2026-10-19T01:30:00Z');
    const earlySec = Math.floor(earlyDate.getTime() / 1000);

    const status = computeEffectiveShopStatus({
      open: false, // Counter staff turned switch off
      paused: false,
      hours_enabled: true,
      hours: '8:30 AM – 6:00 PM (Mon–Sat)'
    }, earlySec);

    expect(status.open).toBe(false);
    expect(status.reason).toBe('manual');
    expect(status.overrideActive).toBe(false);
  });

  it('lapses the override after closing time passes', () => {
    // 7:00 PM IST on Monday (after 6:00 PM close)
    const eveningDate = new Date('2026-10-19T13:30:00Z');
    const eveningSec = Math.floor(eveningDate.getTime() / 1000);
    // Explicit override set earlier that was valid until 6:00 PM (12:30 UTC)
    const pastClosingSec = Math.floor(new Date('2026-10-19T12:30:00Z').getTime() / 1000);

    const status = computeEffectiveShopStatus({
      open: true,
      paused: false,
      hours_enabled: true,
      override_until: pastClosingSec, // explicitly past
      hours: '8:30 AM – 6:00 PM (Mon–Sat)'
    }, eveningSec);

    // Override has expired, so standard schedule hours rule applies: closed
    expect(status.open).toBe(false);
    expect(status.reason).toBe('hours');
  });
});

