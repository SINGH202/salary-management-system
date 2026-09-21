import { FxRateNotFoundError, type FxRateProvider } from './fx.types.js';

/**
 * Sync map-backed provider. Used by the in-memory fake and by the Prisma factory
 * after rates are loaded once into memory.
 */
export class MapFxRateProvider implements FxRateProvider {
  private readonly rates: ReadonlyMap<string, number>;
  private readonly baseCurrency: string;

  constructor(rates: ReadonlyMap<string, number> | Record<string, number>, baseCurrency = 'INR') {
    this.baseCurrency = baseCurrency.toUpperCase();
    const entries = rates instanceof Map ? [...rates.entries()] : Object.entries(rates);
    this.rates = new Map(entries.map(([code, rate]) => [code.toUpperCase(), rate]));
  }

  getRate(currency: string): number {
    const code = currency.toUpperCase();
    if (code === this.baseCurrency) {
      return 1;
    }
    const rate = this.rates.get(code);
    if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
      throw new FxRateNotFoundError(code);
    }
    return rate;
  }
}
