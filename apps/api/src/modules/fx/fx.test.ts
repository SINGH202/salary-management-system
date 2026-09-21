import { describe, expect, it } from 'vitest';
import { Money } from '../../common/money.js';
import { createFakeFxRateProvider } from './fx.fake.js';
import { FxRateNotFoundError, toBaseCurrency } from './fx.types.js';

describe('createFakeFxRateProvider', () => {
  const fx = createFakeFxRateProvider(
    {
      USD: 83,
      EUR: 90,
      GBP: 105,
      INR: 1,
    },
    'INR',
  );

  it('returns 1 for the base currency even if omitted from the map', () => {
    const bare = createFakeFxRateProvider({ USD: 83 }, 'INR');
    expect(bare.getRate('INR')).toBe(1);
  });

  it('returns configured rates case-insensitively', () => {
    expect(fx.getRate('usd')).toBe(83);
    expect(fx.getRate('EUR')).toBe(90);
  });

  it('throws FxRateNotFoundError for unknown currencies', () => {
    expect(() => fx.getRate('JPY')).toThrow(FxRateNotFoundError);
    try {
      fx.getRate('JPY');
    } catch (err) {
      expect(err).toBeInstanceOf(FxRateNotFoundError);
      expect((err as FxRateNotFoundError).currency).toBe('JPY');
      expect((err as FxRateNotFoundError).code).toBe('FX_RATE_NOT_FOUND');
    }
  });
});

describe('toBaseCurrency', () => {
  const fx = createFakeFxRateProvider({ USD: 83, EUR: 90 }, 'INR');

  it('leaves base-currency money unchanged', () => {
    const inr = new Money(100_000_00n, 'INR');
    const result = toBaseCurrency(inr, fx, 'INR');
    expect(result.amountMinor).toBe(100_000_00n);
    expect(result.currency).toBe('INR');
  });

  it('converts foreign currency into INR using the provider rate', () => {
    // $1,000.00 * 83 = ₹83,000.00
    const usd = new Money(1_000_00n, 'USD');
    const inr = toBaseCurrency(usd, fx, 'INR');
    expect(inr.currency).toBe('INR');
    expect(inr.amountMinor).toBe(83_000_00n);
  });

  it('propagates FxRateNotFoundError when converting unknown currency', () => {
    const jpy = new Money(10_000n, 'JPY');
    expect(() => toBaseCurrency(jpy, fx, 'INR')).toThrow(FxRateNotFoundError);
  });
});
