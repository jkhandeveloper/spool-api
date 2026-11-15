import { describe, expect, it } from 'vitest';
import { isValidTimeZone, streaks } from './analytics.service.js';

describe('streaks', () => {
  it('counts the current run from today or yesterday', () => {
    expect(
      streaks(['2026-11-15', '2026-11-14', '2026-11-12'], '2026-11-15'),
    ).toEqual({ current: 2, longest: 2 });
    expect(streaks(['2026-11-14', '2026-11-13'], '2026-11-15')).toEqual({
      current: 2,
      longest: 2,
    });
    expect(
      streaks(['2026-11-10', '2026-11-09', '2026-11-08'], '2026-11-15'),
    ).toEqual({ current: 0, longest: 3 });
    expect(streaks([], '2026-11-15')).toEqual({ current: 0, longest: 0 });
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones only', () => {
    expect(isValidTimeZone('Asia/Karachi')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone("UTC'; DROP TABLE users;--")).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
