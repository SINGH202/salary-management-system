import { Prisma, type PrismaClient } from '@prisma/client';
import {
  normalizePagination,
  paginationSkipTake,
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/pagination.js';
import type { EmployeeDto, EmployeeListFilters, EmployeeRow } from './employees.types.js';
import { toEmployeeDto } from './employees.types.js';

const managerSelect = { firstName: true, lastName: true } as const;

export class EmployeesRepository {
  constructor(private readonly db: PrismaClient) {}

  async findMany(filters: EmployeeListFilters): Promise<PaginatedResult<EmployeeDto>> {
    const { page, pageSize } = normalizePagination(filters.page, filters.pageSize);
    const { skip, take } = paginationSkipTake({ page, pageSize });
    const where = this.buildWhere(filters);
    const sortDir = filters.sortDir === 'desc' ? 'desc' : 'asc';

    if (filters.sort === 'currentSalaryBaseMinor') {
      return this.findManyOrderedByAnnualBase(where, skip, take, page, pageSize, sortDir);
    }

    const orderBy = this.buildOrderBy(filters.sort, sortDir);
    const [rows, total] = await Promise.all([
      this.db.employee.findMany({
        where,
        orderBy,
        skip,
        take,
        include: { manager: { select: managerSelect } },
      }),
      this.db.employee.count({ where }),
    ]);

    return toPaginatedResult(
      rows.map((row) => toEmployeeDto(row as EmployeeRow)),
      total,
      { page, pageSize },
    );
  }

  async findById(id: string): Promise<EmployeeDto | null> {
    const row = await this.db.employee.findUnique({
      where: { id },
      include: { manager: { select: managerSelect } },
    });
    return row ? toEmployeeDto(row as EmployeeRow) : null;
  }

  async update(id: string, data: Prisma.EmployeeUpdateInput): Promise<EmployeeDto> {
    const row = await this.db.employee.update({
      where: { id },
      data,
      include: { manager: { select: managerSelect } },
    });
    return toEmployeeDto(row as EmployeeRow);
  }

  async exists(id: string): Promise<boolean> {
    const count = await this.db.employee.count({ where: { id } });
    return count > 0;
  }

  private buildWhere(filters: EmployeeListFilters): Prisma.EmployeeWhereInput {
    const where: Prisma.EmployeeWhereInput = {
      status: filters.status,
    };
    if (filters.country) where.countryCode = filters.country;
    if (filters.department) where.department = filters.department;
    if (filters.level) where.level = filters.level;

    const search = filters.search?.trim() ?? '';
    if (search.length >= 2) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { workEmail: { contains: search } },
      ];
    }
    return where;
  }

  private buildOrderBy(
    sort: EmployeeListFilters['sort'],
    sortDir: 'asc' | 'desc',
  ): Prisma.EmployeeOrderByWithRelationInput {
    switch (sort) {
      case 'hireDate':
        return { hireDate: sortDir };
      case 'department':
        return { department: sortDir };
      case 'lastName':
      case undefined:
        return { lastName: sortDir };
      case 'currentSalaryBaseMinor':
        return { lastName: sortDir };
      default: {
        const _exhaustive: never = sort;
        return _exhaustive;
      }
    }
  }

  /**
   * Sort by annualized current pay in base currency — never raw period amount.
   */
  private async findManyOrderedByAnnualBase(
    where: Prisma.EmployeeWhereInput,
    skip: number,
    take: number,
    page: number,
    pageSize: number,
    sortDir: 'asc' | 'desc',
  ): Promise<PaginatedResult<EmployeeDto>> {
    const total = await this.db.employee.count({ where });
    const dir = sortDir === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;

    // Build a filtered id list via Prisma, then order those ids by annual expression.
    // For SQLite + small fixture / 10k this stays simple and correct.
    const matching = await this.db.employee.findMany({
      where,
      select: { id: true },
    });
    if (matching.length === 0) {
      return toPaginatedResult([], 0, { page, pageSize });
    }

    const ids = matching.map((m) => m.id);
    const ordered = await this.db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM Employee
      WHERE id IN (${Prisma.join(ids)})
      ORDER BY CASE
        WHEN currentPayFrequency = 'monthly' THEN currentSalaryBaseMinor * 12
        ELSE currentSalaryBaseMinor
      END ${dir}, lastName ASC
      LIMIT ${take} OFFSET ${skip}
    `;

    const orderedIds = ordered.map((r) => r.id);
    const rows = await this.db.employee.findMany({
      where: { id: { in: orderedIds } },
      include: { manager: { select: managerSelect } },
    });
    const byId = new Map(rows.map((r) => [r.id, r as EmployeeRow]));
    const data = orderedIds
      .map((id) => byId.get(id))
      .filter((r): r is EmployeeRow => r !== undefined)
      .map(toEmployeeDto);

    return toPaginatedResult(data, total, { page, pageSize });
  }
}
