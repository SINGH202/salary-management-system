import type {
  EmployeeCreate,
  SalaryChangeCreate,
  TerminateEmployee,
} from '@acme/contracts';
import type { PrismaClient } from '@prisma/client';
import type { Clock } from '../../common/clock.js';
import { notFound } from '../../common/error-handler.js';
import type { FxRateProvider } from '../fx/index.js';
import {
  applySalaryChange,
  applyTerminate,
  insertEmployeeWithHire,
  toSalaryRecordDto,
  type SalaryRecordDto,
} from './compensation.writes.js';

export class CompensationService {
  constructor(
    private readonly db: PrismaClient,
    private readonly fx: FxRateProvider,
    private readonly clock: Clock,
    private readonly baseCurrency = process.env.BASE_CURRENCY ?? 'INR',
  ) {}

  createEmployee(input: EmployeeCreate): Promise<{ employeeId: string; record: SalaryRecordDto }> {
    return this.db.$transaction((tx) =>
      insertEmployeeWithHire(tx, input, this.fx, this.baseCurrency),
    );
  }

  recordSalaryChange(employeeId: string, input: SalaryChangeCreate): Promise<SalaryRecordDto> {
    return this.db.$transaction((tx) =>
      applySalaryChange(tx, employeeId, input, this.fx, this.baseCurrency),
    );
  }

  terminateEmployee(employeeId: string, input: TerminateEmployee): Promise<void> {
    return this.db.$transaction((tx) =>
      applyTerminate(tx, employeeId, input, this.clock.now()),
    );
  }

  async listHistory(employeeId: string): Promise<SalaryRecordDto[]> {
    const employee = await this.db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      throw notFound(`Employee not found: ${employeeId}`);
    }

    const rows = await this.db.salaryRecord.findMany({
      where: { employeeId },
      orderBy: { effectiveFrom: 'desc' },
    });
    return rows.map(toSalaryRecordDto);
  }
}
