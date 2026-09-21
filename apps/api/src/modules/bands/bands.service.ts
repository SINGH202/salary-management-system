import type { BandUpsert } from '@acme/contracts';
import type { CompensationBand, Employee, PrismaClient } from '@prisma/client';
import { annualize, Money } from '../../common/money.js';
import { badRequest, notFound } from '../../common/error-handler.js';
import {
  normalizePagination,
  paginationSkipTake,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination.js';
import { toBaseCurrency, type FxRateProvider } from '../fx/index.js';

export type BandDto = {
  id: string;
  jobFamily: string;
  level: string;
  countryCode: string;
  minMinor: string;
  midMinor: string;
  maxMinor: string;
  currency: string;
};

export type BandListFilters = {
  page: number;
  pageSize: number;
  jobFamily?: string;
  level?: string;
  countryCode?: string;
};

export type CompaRatioDto = {
  employeeId: string;
  bandId: string | null;
  compaRatio: number | null;
  annualBaseMinor: string;
  bandMidBaseMinor: string | null;
};

export type OutlierDto = {
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  jobFamily: string;
  level: string;
  countryCode: string;
  annualBaseMinor: string;
  bandId: string;
  bandMinBaseMinor: string;
  bandMaxBaseMinor: string;
  side: 'below' | 'above';
};

export type OutliersFilters = {
  page: number;
  pageSize: number;
  includeTerminated?: boolean;
  /** When false, contractors are excluded. Default: include contractors. */
  includeContractors?: boolean;
};

function toBandDto(row: CompensationBand): BandDto {
  return {
    id: row.id,
    jobFamily: row.jobFamily,
    level: row.level,
    countryCode: row.countryCode,
    minMinor: row.minMinor.toString(),
    midMinor: row.midMinor.toString(),
    maxMinor: row.maxMinor.toString(),
    currency: row.currency,
  };
}

function bandKey(jobFamily: string, level: string, countryCode: string): string {
  return `${jobFamily}\0${level}\0${countryCode}`;
}

function assertBandOrdering(input: BandUpsert): void {
  const min = BigInt(input.minMinor);
  const mid = BigInt(input.midMinor);
  const max = BigInt(input.maxMinor);
  if (min > mid || mid > max) {
    throw badRequest('band amounts must satisfy minMinor <= midMinor <= maxMinor');
  }
}

function bandMinorToBase(
  amountMinor: bigint,
  currency: string,
  fx: FxRateProvider,
  baseCurrency: string,
): bigint {
  return toBaseCurrency(new Money(amountMinor, currency), fx, baseCurrency).amountMinor;
}

export class BandsService {
  constructor(
    private readonly db: PrismaClient,
    private readonly fx: FxRateProvider,
    private readonly baseCurrency = process.env.BASE_CURRENCY ?? 'INR',
  ) {}

  async list(filters: BandListFilters): Promise<PaginatedResult<BandDto>> {
    const pagination = normalizePagination(filters.page, filters.pageSize);
    const where = {
      ...(filters.jobFamily ? { jobFamily: filters.jobFamily } : {}),
      ...(filters.level ? { level: filters.level } : {}),
      ...(filters.countryCode ? { countryCode: filters.countryCode } : {}),
    };
    const { skip, take } = paginationSkipTake(pagination);
    const [total, rows] = await Promise.all([
      this.db.compensationBand.count({ where }),
      this.db.compensationBand.findMany({
        where,
        orderBy: [{ jobFamily: 'asc' }, { level: 'asc' }, { countryCode: 'asc' }],
        skip,
        take,
      }),
    ]);
    return toPaginatedResult(rows.map(toBandDto), total, pagination);
  }

  async upsert(input: BandUpsert): Promise<BandDto> {
    assertBandOrdering(input);
    const minMinor = BigInt(input.minMinor);
    const midMinor = BigInt(input.midMinor);
    const maxMinor = BigInt(input.maxMinor);
    // Touch FX early so unknown currencies fail as FX_RATE_NOT_FOUND (400), not after write.
    this.fx.getRate(input.currency);

    const row = await this.db.compensationBand.upsert({
      where: {
        jobFamily_level_countryCode: {
          jobFamily: input.jobFamily,
          level: input.level,
          countryCode: input.countryCode,
        },
      },
      create: {
        jobFamily: input.jobFamily,
        level: input.level,
        countryCode: input.countryCode,
        minMinor,
        midMinor,
        maxMinor,
        currency: input.currency,
      },
      update: {
        minMinor,
        midMinor,
        maxMinor,
        currency: input.currency,
      },
    });
    return toBandDto(row);
  }

  async getCompaRatio(employeeId: string): Promise<CompaRatioDto> {
    const employee = await this.db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      throw notFound(`Employee not found: ${employeeId}`);
    }

    const annualBaseMinor = annualize(
      employee.currentSalaryBaseMinor,
      employee.currentPayFrequency,
    );

    const band = await this.db.compensationBand.findUnique({
      where: {
        jobFamily_level_countryCode: {
          jobFamily: employee.jobFamily,
          level: employee.level,
          countryCode: employee.countryCode,
        },
      },
    });

    if (!band) {
      return {
        employeeId,
        bandId: null,
        compaRatio: null,
        annualBaseMinor: annualBaseMinor.toString(),
        bandMidBaseMinor: null,
      };
    }

    const bandMidBaseMinor = bandMinorToBase(
      band.midMinor,
      band.currency,
      this.fx,
      this.baseCurrency,
    );
    if (bandMidBaseMinor === 0n) {
      throw badRequest('band midMinor converts to zero in base currency');
    }

    const compaRatio = Number(annualBaseMinor) / Number(bandMidBaseMinor);
    return {
      employeeId,
      bandId: band.id,
      compaRatio,
      annualBaseMinor: annualBaseMinor.toString(),
      bandMidBaseMinor: bandMidBaseMinor.toString(),
    };
  }

  async listOutliers(filters: OutliersFilters): Promise<PaginatedResult<OutlierDto>> {
    const pagination = normalizePagination(filters.page, filters.pageSize, { pageSize: 50 });
    const includeTerminated = filters.includeTerminated === true;
    const includeContractors = filters.includeContractors !== false;

    const where = {
      ...(includeTerminated ? {} : { status: 'active' as const }),
      ...(includeContractors ? {} : { employmentType: { not: 'contractor' } }),
    };

    const [bands, employees] = await Promise.all([
      this.db.compensationBand.findMany(),
      this.db.employee.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ]);

    const byKey = new Map(bands.map((b) => [bandKey(b.jobFamily, b.level, b.countryCode), b]));
    const outliers: OutlierDto[] = [];

    for (const employee of employees) {
      const band = byKey.get(bandKey(employee.jobFamily, employee.level, employee.countryCode));
      if (!band) {
        continue;
      }
      const outlier = this.toOutlierIfOutside(employee, band);
      if (outlier) {
        outliers.push(outlier);
      }
    }

    const total = outliers.length;
    const { skip, take } = paginationSkipTake(pagination);
    const page = outliers.slice(skip, skip + take);
    return toPaginatedResult(page, total, pagination);
  }

  private toOutlierIfOutside(employee: Employee, band: CompensationBand): OutlierDto | null {
    const annualBaseMinor = annualize(
      employee.currentSalaryBaseMinor,
      employee.currentPayFrequency,
    );
    const bandMinBaseMinor = bandMinorToBase(
      band.minMinor,
      band.currency,
      this.fx,
      this.baseCurrency,
    );
    const bandMaxBaseMinor = bandMinorToBase(
      band.maxMinor,
      band.currency,
      this.fx,
      this.baseCurrency,
    );

    let side: 'below' | 'above' | null = null;
    if (annualBaseMinor < bandMinBaseMinor) {
      side = 'below';
    } else if (annualBaseMinor > bandMaxBaseMinor) {
      side = 'above';
    }
    if (side === null) {
      return null;
    }

    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      jobFamily: employee.jobFamily,
      level: employee.level,
      countryCode: employee.countryCode,
      annualBaseMinor: annualBaseMinor.toString(),
      bandId: band.id,
      bandMinBaseMinor: bandMinBaseMinor.toString(),
      bandMaxBaseMinor: bandMaxBaseMinor.toString(),
      side,
    };
  }
}
