import type { ImportEmployeeRow, ImportEmployeesResult } from '@acme/contracts';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Response } from 'express';
import { badRequest } from '../../common/error-handler.js';
import { insertEmployeeWithHire } from '../compensation/compensation.writes.js';
import type { FxRateProvider } from '../fx/index.js';
import { formatExportHeader, formatExportRow, parseImportCsv, type CsvRowError } from './csv.js';

export type ExportFilters = {
  country?: string;
  department?: string;
  level?: string;
  status?: string;
  search?: string;
};

export class TransferService {
  constructor(
    private readonly db: PrismaClient,
    private readonly fx: FxRateProvider,
    private readonly baseCurrency = process.env.BASE_CURRENCY ?? 'INR',
  ) {}

  /**
   * Validate every CSV row before any write. On any validation error, imported=0
   * and no employees are created.
   */
  async importEmployees(file: Express.Multer.File | undefined): Promise<ImportEmployeesResult> {
    if (!file) {
      throw badRequest('CSV file is required (multipart field "file")');
    }
    this.assertCsvFile(file);

    const { rows, errors } = parseImportCsv(file.buffer);
    if (errors.length > 0) {
      return { imported: 0, errors };
    }
    if (rows.length === 0) {
      return {
        imported: 0,
        errors: [{ row: 1, field: '_file', message: 'CSV has no data rows' }],
      };
    }

    const duplicateErrors = await this.findDuplicateConflicts(rows);
    if (duplicateErrors.length > 0) {
      return { imported: 0, errors: duplicateErrors };
    }

    await this.db.$transaction(
      async (tx) => {
        for (const row of rows) {
          await insertEmployeeWithHire(tx, row, this.fx, this.baseCurrency);
        }
      },
      { timeout: 120_000 },
    );

    return { imported: rows.length, errors: [] };
  }

  /**
   * Stream CSV via Prisma id-cursor batches — never loads all matching rows at once.
   */
  async exportEmployees(filters: ExportFilters, res: Response): Promise<void> {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="employees.csv"');
    res.write(formatExportHeader());

    const where = this.buildExportWhere(filters);
    const pageSize = 200;
    let cursorId: string | undefined;

    for (;;) {
      const batch = await this.db.employee.findMany({
        where,
        orderBy: { id: 'asc' },
        take: pageSize,
        ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      });
      if (batch.length === 0) {
        break;
      }
      for (const row of batch) {
        res.write(
          formatExportRow({
            id: row.id,
            employeeCode: row.employeeCode,
            firstName: row.firstName,
            lastName: row.lastName,
            workEmail: row.workEmail,
            countryCode: row.countryCode,
            location: row.location,
            department: row.department,
            jobFamily: row.jobFamily,
            level: row.level,
            managerId: row.managerId ?? '',
            employmentType: row.employmentType,
            hireDate: row.hireDate.toISOString(),
            status: row.status,
            gender: row.gender ?? '',
            currentSalaryAmountMinor: row.currentSalaryAmountMinor.toString(),
            currentSalaryCurrency: row.currentSalaryCurrency,
            currentSalaryBaseMinor: row.currentSalaryBaseMinor.toString(),
            currentPayFrequency: row.currentPayFrequency,
          }),
        );
      }
      cursorId = batch[batch.length - 1]!.id;
      if (batch.length < pageSize) {
        break;
      }
    }

    res.end();
  }

  private assertCsvFile(file: Express.Multer.File): void {
    const mime = (file.mimetype ?? '').toLowerCase();
    const name = (file.originalname ?? '').toLowerCase();
    const okMime =
      mime === 'text/csv' ||
      mime === 'application/csv' ||
      mime === 'application/vnd.ms-excel' ||
      mime === 'application/octet-stream';
    const okName = name.endsWith('.csv');
    if (!okMime && !okName) {
      throw badRequest('Only text/csv uploads are accepted');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw badRequest('CSV file exceeds 5MB limit');
    }
  }

  private async findDuplicateConflicts(rows: ImportEmployeeRow[]): Promise<CsvRowError[]> {
    const errors: CsvRowError[] = [];
    const codes = new Set<string>();
    const emails = new Set<string>();

    rows.forEach((row, index) => {
      const line = index + 2;
      if (codes.has(row.employeeCode)) {
        errors.push({
          row: line,
          field: 'employeeCode',
          message: `duplicate employeeCode in file: ${row.employeeCode}`,
        });
      }
      codes.add(row.employeeCode);
      const email = row.workEmail.toLowerCase();
      if (emails.has(email)) {
        errors.push({
          row: line,
          field: 'workEmail',
          message: `duplicate workEmail in file: ${row.workEmail}`,
        });
      }
      emails.add(email);
    });

    const existing = await this.db.employee.findMany({
      where: {
        OR: [
          { employeeCode: { in: [...codes] } },
          { workEmail: { in: rows.map((r) => r.workEmail) } },
        ],
      },
      select: { employeeCode: true, workEmail: true },
    });
    const existingCodes = new Set(existing.map((e) => e.employeeCode));
    const existingEmails = new Set(existing.map((e) => e.workEmail.toLowerCase()));

    rows.forEach((row, index) => {
      const line = index + 2;
      if (existingCodes.has(row.employeeCode)) {
        errors.push({
          row: line,
          field: 'employeeCode',
          message: `employeeCode already exists: ${row.employeeCode}`,
        });
      }
      if (existingEmails.has(row.workEmail.toLowerCase())) {
        errors.push({
          row: line,
          field: 'workEmail',
          message: `workEmail already exists: ${row.workEmail}`,
        });
      }
    });

    return errors;
  }

  private buildExportWhere(filters: ExportFilters): Prisma.EmployeeWhereInput {
    const where: Prisma.EmployeeWhereInput = {
      status: filters.status ?? 'active',
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
}
