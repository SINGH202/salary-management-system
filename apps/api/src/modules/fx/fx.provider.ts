import type { PrismaClient } from '@prisma/client';
import { MapFxRateProvider } from './fx.map-provider.js';
import type { FxRateProvider } from './fx.types.js';

/**
 * Loads FxRate rows once, then serves sync getRate lookups.
 * Call after ensureDbReady / migrations; refresh by creating a new provider if rates change.
 */
export async function createPrismaFxRateProvider(
  prisma: PrismaClient,
  baseCurrency = process.env.BASE_CURRENCY ?? 'INR',
): Promise<FxRateProvider> {
  const base = baseCurrency.toUpperCase();
  const rows = await prisma.fxRate.findMany();
  const rates = new Map<string, number>(
    rows.map((row) => [row.currencyCode.toUpperCase(), row.rateToBase]),
  );
  rates.set(base, 1);
  return new MapFxRateProvider(rates, base);
}
