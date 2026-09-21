import type { AnalyticsQuery } from '@acme/contracts';
import { Prisma, type PrismaClient } from '@prisma/client';
import { annualize } from '../../common/money.js';

type AnalyticsGroupBy = AnalyticsQuery['groupBy'];

export type AnalyticsScope = {
  includeTerminated?: boolean;
  includeContractors?: boolean;
};

export type AnalyticsBucket = {
  key: string;
  value: number | string;
};

export type AnalyticsSummary = {
  headcount: number;
  payrollCostAnnualBase: string;
  averageAnnualBase: string;
  medianAnnualBase: string;
  outlierCount: number;
};

export type DistributionBucket = {
  key: string;
  p25: string;
  median: string;
  p75: string;
};

const ANNUAL_EXPR = Prisma.sql`
  CASE
    WHEN currentPayFrequency = 'monthly' THEN currentSalaryBaseMinor * 12
    ELSE currentSalaryBaseMinor
  END
`;

function groupColumn(groupBy: AnalyticsGroupBy): Prisma.Sql {
  switch (groupBy) {
    case 'country':
      return Prisma.sql`countryCode`;
    case 'department':
      return Prisma.sql`department`;
    case 'level':
      return Prisma.sql`level`;
    default: {
      const _exhaustive: never = groupBy;
      return _exhaustive;
    }
  }
}

/**
 * Read-only analytics over Employee.currentSalary* (never SalaryRecord history).
 * No Clock — all figures are current denormalized pay.
 */
export class AnalyticsRepository {
  constructor(private readonly db: PrismaClient) {}

  /**
   * Nearest-rank percentile on annualized current base pay.
   * SQLite-specific seam (ORDER BY … LIMIT 1 OFFSET n).
   */
  async getPercentile(
    percentile: number,
    scope: AnalyticsScope,
    extras: { groupBy?: AnalyticsGroupBy; groupKey?: string } = {},
  ): Promise<bigint | null> {
    if (percentile < 0 || percentile > 100) {
      throw new Error(`percentile must be 0–100, got ${percentile}`);
    }

    const where = this.buildWhereSql(scope, extras);
    const countRows = await this.db.$queryRaw<Array<{ n: bigint | number }>>`
      SELECT COUNT(*) AS n FROM Employee WHERE ${where}
    `;
    const n = Number(countRows[0]?.n ?? 0);
    if (n === 0) {
      return null;
    }

    const offset = Math.max(0, Math.ceil((percentile / 100) * n) - 1);
    const rows = await this.db.$queryRaw<Array<{ annual: bigint | number }>>`
      SELECT ${ANNUAL_EXPR} AS annual
      FROM Employee
      WHERE ${where}
      ORDER BY ${ANNUAL_EXPR} ASC
      LIMIT 1 OFFSET ${offset}
    `;
    const raw = rows[0]?.annual;
    if (raw === undefined || raw === null) {
      return null;
    }
    return typeof raw === 'bigint' ? raw : BigInt(raw);
  }

  async headcount(
    groupBy: AnalyticsGroupBy,
    scope: AnalyticsScope,
  ): Promise<AnalyticsBucket[]> {
    // Headcount includes contractors unless explicitly excluded.
    const effective: AnalyticsScope = {
      includeTerminated: scope.includeTerminated,
      includeContractors: scope.includeContractors ?? true,
    };
    const col = groupColumn(groupBy);
    const where = this.buildWhereSql(effective);
    const rows = await this.db.$queryRaw<Array<{ key: string; value: bigint | number }>>`
      SELECT ${col} AS key, COUNT(*) AS value
      FROM Employee
      WHERE ${where}
      GROUP BY ${col}
      ORDER BY ${col} ASC
    `;
    return rows.map((row) => ({
      key: row.key,
      value: Number(row.value),
    }));
  }

  async payrollCost(
    groupBy: AnalyticsGroupBy,
    scope: AnalyticsScope,
  ): Promise<AnalyticsBucket[]> {
    // Payroll excludes contractors unless opted in; active-only by default.
    const effective: AnalyticsScope = {
      includeTerminated: scope.includeTerminated,
      includeContractors: scope.includeContractors ?? false,
    };
    const col = groupColumn(groupBy);
    const where = this.buildWhereSql(effective);
    const rows = await this.db.$queryRaw<Array<{ key: string; value: bigint | number | null }>>`
      SELECT ${col} AS key, SUM(${ANNUAL_EXPR}) AS value
      FROM Employee
      WHERE ${where}
      GROUP BY ${col}
      ORDER BY ${col} ASC
    `;
    return rows.map((row) => ({
      key: row.key,
      value: (row.value == null ? 0n : BigInt(row.value)).toString(),
    }));
  }

  async distribution(
    groupBy: AnalyticsGroupBy,
    scope: AnalyticsScope,
  ): Promise<DistributionBucket[]> {
    const effective: AnalyticsScope = {
      includeTerminated: scope.includeTerminated,
      includeContractors: scope.includeContractors ?? false,
    };
    const col = groupColumn(groupBy);
    const where = this.buildWhereSql(effective);
    const keys = await this.db.$queryRaw<Array<{ key: string }>>`
      SELECT DISTINCT ${col} AS key
      FROM Employee
      WHERE ${where}
      ORDER BY ${col} ASC
    `;

    const buckets: DistributionBucket[] = [];
    for (const { key } of keys) {
      const [p25, median, p75] = await Promise.all([
        this.getPercentile(25, effective, { groupBy, groupKey: key }),
        this.getPercentile(50, effective, { groupBy, groupKey: key }),
        this.getPercentile(75, effective, { groupBy, groupKey: key }),
      ]);
      buckets.push({
        key,
        p25: (p25 ?? 0n).toString(),
        median: (median ?? 0n).toString(),
        p75: (p75 ?? 0n).toString(),
      });
    }
    return buckets;
  }

  async summary(
    scope: AnalyticsScope,
    outlierCount: number,
  ): Promise<AnalyticsSummary> {
    const headcountScope: AnalyticsScope = {
      includeTerminated: scope.includeTerminated,
      includeContractors: scope.includeContractors ?? true,
    };
    const payrollScope: AnalyticsScope = {
      includeTerminated: scope.includeTerminated,
      includeContractors: scope.includeContractors ?? false,
    };

    const headcountWhere = this.buildWhereSql(headcountScope);
    const payrollWhere = this.buildWhereSql(payrollScope);

    const [headcountRows, payrollRows, median] = await Promise.all([
      this.db.$queryRaw<Array<{ n: bigint | number }>>`
        SELECT COUNT(*) AS n FROM Employee WHERE ${headcountWhere}
      `,
      this.db.$queryRaw<Array<{ total: bigint | number | null; n: bigint | number }>>`
        SELECT SUM(${ANNUAL_EXPR}) AS total, COUNT(*) AS n
        FROM Employee
        WHERE ${payrollWhere}
      `,
      this.getPercentile(50, payrollScope),
    ]);

    const headcount = Number(headcountRows[0]?.n ?? 0);
    const payrollN = Number(payrollRows[0]?.n ?? 0);
    const payrollTotal =
      payrollRows[0]?.total == null ? 0n : BigInt(payrollRows[0].total);
    const average =
      payrollN === 0 ? 0n : payrollTotal / BigInt(payrollN);

    return {
      headcount,
      payrollCostAnnualBase: payrollTotal.toString(),
      averageAnnualBase: average.toString(),
      medianAnnualBase: (median ?? 0n).toString(),
      outlierCount,
    };
  }

  /** Used by tests to verify annualize is applied the same way as SQL. */
  static annualBaseFromEmployee(row: {
    currentSalaryBaseMinor: bigint;
    currentPayFrequency: string;
  }): bigint {
    return annualize(row.currentSalaryBaseMinor, row.currentPayFrequency);
  }

  private buildWhereSql(
    scope: AnalyticsScope,
    extras: { groupBy?: AnalyticsGroupBy; groupKey?: string } = {},
  ): Prisma.Sql {
    const parts: Prisma.Sql[] = [Prisma.sql`1 = 1`];

    if (!scope.includeTerminated) {
      parts.push(Prisma.sql`status = 'active'`);
    }
    if (scope.includeContractors === false) {
      parts.push(Prisma.sql`employmentType != 'contractor'`);
    }

    if (extras.groupBy !== undefined && extras.groupKey !== undefined) {
      const col = groupColumn(extras.groupBy);
      parts.push(Prisma.sql`${col} = ${extras.groupKey}`);
    }

    return Prisma.join(parts, ' AND ');
  }
}
