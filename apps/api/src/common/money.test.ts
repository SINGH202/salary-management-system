import { describe, expect, it } from 'vitest';
import { CurrencyMismatchError, Money, annualize } from './money.js';

describe('Money', () => {
  it('adds same-currency amounts', () => {
    const a = new Money(100_00n, 'USD');
    const b = new Money(50_00n, 'USD');
    expect(a.plus(b).amountMinor).toBe(150_00n);
  });

  it('rejects mismatched currency arithmetic', () => {
    const usd = new Money(100_00n, 'USD');
    const inr = new Money(100_00n, 'INR');
    expect(() => usd.plus(inr)).toThrow(CurrencyMismatchError);
  });

  it('computes percentOf with integer math', () => {
    const salary = new Money(100_000_00n, 'USD');
    expect(salary.percentOf(7n).amountMinor).toBe(7_000_00n);
  });

  it('converts with a rate and rounds to nearest minor unit', () => {
    const inr = new Money(8_300_00n, 'INR');
    const usd = inr.convertTo(0.012, 'USD');
    expect(usd.currency).toBe('USD');
    expect(usd.amountMinor).toBe(9960n);
  });

  it('rejects non-positive FX rates', () => {
    const m = new Money(100n, 'USD');
    expect(() => m.convertTo(0, 'EUR')).toThrow(/positive/);
  });

  it('round-trips contract strings', () => {
    const original = new Money(123456n, 'USD');
    const restored = Money.fromContractString(original.toContractString(), 'USD');
    expect(restored.amountMinor).toBe(123456n);
  });

  it('formats with two decimal places', () => {
    expect(new Money(12345n, 'USD').format()).toBe('123.45 USD');
    expect(new Money(-50n, 'USD').format()).toBe('-0.50 USD');
  });
});

describe('annualize', () => {
  it('multiplies monthly by 12 and leaves annual unchanged', () => {
    expect(annualize(10_000_00n, 'monthly')).toBe(120_000_00n);
    expect(annualize(120_000_00n, 'annual')).toBe(120_000_00n);
  });

  it('rejects unknown frequencies', () => {
    expect(() => annualize(100n, 'weekly')).toThrow(/unknown payFrequency/);
  });
});
