import { parse } from 'csv-parse/sync';
import type { ImportEmployeeRow } from '@acme/contracts';
import { importEmployeeRowSchema } from '@acme/contracts';
import type { ZodIssue } from 'zod';

export type CsvRowError = {
  row: number;
  field: string;
  message: string;
};

const IMPORT_HEADERS = [
  'employeeCode',
  'firstName',
  'lastName',
  'workEmail',
  'countryCode',
  'location',
  'department',
  'jobFamily',
  'level',
  'managerId',
  'employmentType',
  'hireDate',
  'gender',
  'amountMinor',
  'currency',
  'payFrequency',
] as const;

export const EXPORT_HEADERS = [
  'id',
  'employeeCode',
  'firstName',
  'lastName',
  'workEmail',
  'countryCode',
  'location',
  'department',
  'jobFamily',
  'level',
  'managerId',
  'employmentType',
  'hireDate',
  'status',
  'gender',
  'currentSalaryAmountMinor',
  'currentSalaryCurrency',
  'currentSalaryBaseMinor',
  'currentPayFrequency',
] as const;

function emptyToUndefined(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}

function normalizeImportRow(raw: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of IMPORT_HEADERS) {
    const value = emptyToUndefined(raw[key]);
    if (value === undefined) {
      if (key === 'managerId' || key === 'gender') {
        // optional nullable fields — omit when blank
        continue;
      }
      continue;
    }
    if (key === 'managerId' || key === 'gender') {
      out[key] = value === 'null' ? null : value;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function issueField(issue: ZodIssue): string {
  return issue.path.length > 0 ? issue.path.map(String).join('.') : '_root';
}

/**
 * Parse CSV buffer into validated EmployeeCreate rows.
 * Collects every row-level error; does not short-circuit on the first failure.
 * `row` is the 1-based line number in the file (header = 1, first data = 2).
 */
export function parseImportCsv(buffer: Buffer): {
  rows: ImportEmployeeRow[];
  errors: CsvRowError[];
} {
  let records: Record<string, string>[];
  try {
    records = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    }) as Record<string, string>[];
  } catch (err) {
    return {
      rows: [],
      errors: [
        {
          row: 1,
          field: '_file',
          message: err instanceof Error ? err.message : 'Failed to parse CSV',
        },
      ],
    };
  }

  const rows: ImportEmployeeRow[] = [];
  const errors: CsvRowError[] = [];

  records.forEach((raw, index) => {
    const line = index + 2; // header is line 1
    const normalized = normalizeImportRow(raw);
    const result = importEmployeeRowSchema.safeParse(normalized);
    if (result.success) {
      rows.push(result.data);
    } else {
      for (const issue of result.error.issues) {
        errors.push({
          row: line,
          field: issueField(issue),
          message: issue.message,
        });
      }
    }
  });

  return { rows, errors };
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function formatExportHeader(): string {
  return `${EXPORT_HEADERS.join(',')}\n`;
}

export function formatExportRow(values: Record<(typeof EXPORT_HEADERS)[number], string>): string {
  return `${EXPORT_HEADERS.map((h) => csvEscape(values[h] ?? '')).join(',')}\n`;
}
