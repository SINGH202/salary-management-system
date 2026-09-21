import { MapFxRateProvider } from './fx.map-provider.js';
import type { FxRateProvider } from './fx.types.js';

/** In-memory fake for unit tests — never hits the DB. */
export function createFakeFxRateProvider(
  rates: Record<string, number>,
  baseCurrency = 'INR',
): FxRateProvider {
  return new MapFxRateProvider(rates, baseCurrency);
}
