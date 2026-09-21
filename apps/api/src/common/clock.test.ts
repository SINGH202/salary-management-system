import { describe, expect, it } from 'vitest';
import { FixedClock, SystemClock } from './clock.js';

describe('FixedClock', () => {
  it('always returns the configured instant', () => {
    const instant = new Date('2026-09-01T00:00:00.000Z');
    const clock = new FixedClock(instant);
    expect(clock.now().toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(clock.now()).not.toBe(instant);
  });
});

describe('SystemClock', () => {
  it('returns a Date close to wall clock', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    const after = Date.now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(after);
  });
});
