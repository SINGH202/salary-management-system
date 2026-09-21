import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaReady?: Promise<void>;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Connect and enable WAL outside any Prisma migration transaction.
 * SQLite ignores journal_mode changes inside transactions, so this cannot live
 * in migration.sql — see ARCHITECTURE.md / build plan SQLite notes.
 */
export async function ensureDbReady(client: PrismaClient = prisma): Promise<void> {
  if (!globalForPrisma.prismaReady) {
    globalForPrisma.prismaReady = (async () => {
      await client.$connect();
      const rows = await client.$queryRawUnsafe<Array<{ journal_mode: string }>>(
        'PRAGMA journal_mode=WAL;',
      );
      const mode = rows[0]?.journal_mode?.toLowerCase();
      if (mode !== 'wal') {
        throw new Error(`Expected SQLite journal_mode=wal, got: ${mode ?? 'unknown'}`);
      }
    })();
  }
  await globalForPrisma.prismaReady;
}

/** Test helper: clear the memoized ready promise between isolated DB files. */
export function resetDbReadyForTests(): void {
  globalForPrisma.prismaReady = undefined;
}
