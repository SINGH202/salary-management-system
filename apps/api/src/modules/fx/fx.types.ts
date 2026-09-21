import type { Money } from '../../common/money.js';

export class FxRateNotFoundError extends Error {
  readonly code = 'FX_RATE_NOT_FOUND';

  constructor(readonly currency: string) {
    super(`No FX rate found for currency: ${currency}`);
    this.name = 'FxRateNotFoundError';
  }
}

/**
 * Provides the rate that converts 1 unit of `currency` into BASE_CURRENCY.
 * For the base currency itself, implementations must return 1.
 */
export interface FxRateProvider {
  getRate(currency: string): number;
}

export function toBaseCurrency(
  money: Money,
  fx: FxRateProvider,
  baseCurrency: string,
): Money {
  const base = baseCurrency.toUpperCase();
  if (money.currency.toUpperCase() === base) {
    return money;
  }
  return money.convertTo(fx.getRate(money.currency), base);
}
