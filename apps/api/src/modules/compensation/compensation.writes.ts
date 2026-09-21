import type { EmployeeCreate, SalaryChangeCreate, TerminateEmployee } from '@acme/contracts';
import type { Prisma } from '@prisma/client';
import { Money } from '../../common/money.js';
import { badRequest, conflict, notFound } from '../../common/error-handler.js';
import { toBaseCurrency, type FxRateProvider } from '../fx/index.js';

export type TxClient = Prisma.TransactionClient;

export type SalaryRecordDto = {
  id: string;
  employeeId: string;
  amountMinor: string;
  currency: string;
  payFrequency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  changeReason: string;
  note: string | null;
  fxRateToBase: number;
  amountBaseMinor: string;
  createdAt: string;
};

function toSalaryRecordDto(row: {
  id: string;
  employeeId: string;
  amountMinor: bigint;
  currency: string;
  payFrequency: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  changeReason: string;
  note: string | null;
  fxRateToBase: number;
  amountBaseMinor: bigint;
  createdAt: Date;
}): SalaryRecordDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    amountMinor: row.amountMinor.toString(),
    currency: row.currency,
    payFrequency: row.payFrequency,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo?.toISOString() ?? null,
    changeReason: row.changeReason,
    note: row.note,
    fxRateToBase: row.fxRateToBase,
    amountBaseMinor: row.amountBaseMinor.toString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function periodBaseMinor(
  amountMinor: string,
  currency: string,
  fx: FxRateProvider,
  baseCurrency: string,
): { amountMinor: bigint; amountBaseMinor: bigint; fxRateToBase: number } {
  const money = Money.fromContractString(amountMinor, currency);
  const rate = fx.getRate(currency);
  const base = toBaseCurrency(money, fx, baseCurrency);
  return {
    amountMinor: money.amountMinor,
    amountBaseMinor: base.amountMinor,
    fxRateToBase: rate,
  };
}

/**
 * Shared hire path — one Employee + open SalaryRecord (reason=hire).
 * Used by the API and the seed fixture (exact same invariant writer).
 */
export async function insertEmployeeWithHire(
  tx: TxClient,
  input: EmployeeCreate,
  fx: FxRateProvider,
  baseCurrency: string,
): Promise<{ employeeId: string; record: SalaryRecordDto }> {
  const hireDate = new Date(input.hireDate);
  const pay = periodBaseMinor(input.amountMinor, input.currency, fx, baseCurrency);

  if (input.managerId !== undefined && input.managerId !== null) {
    const manager = await tx.employee.findUnique({ where: { id: input.managerId } });
    if (!manager) {
      throw badRequest(`managerId does not exist: ${input.managerId}`);
    }
  }

  const employee = await tx.employee.create({
    data: {
      employeeCode: input.employeeCode,
      firstName: input.firstName,
      lastName: input.lastName,
      workEmail: input.workEmail,
      countryCode: input.countryCode,
      location: input.location,
      department: input.department,
      jobFamily: input.jobFamily,
      level: input.level,
      managerId: input.managerId ?? null,
      employmentType: input.employmentType,
      hireDate,
      status: 'active',
      gender: input.gender ?? null,
      currentSalaryAmountMinor: pay.amountMinor,
      currentSalaryCurrency: input.currency,
      currentSalaryBaseMinor: pay.amountBaseMinor,
      currentPayFrequency: input.payFrequency,
    },
  });

  const record = await tx.salaryRecord.create({
    data: {
      employeeId: employee.id,
      amountMinor: pay.amountMinor,
      currency: input.currency,
      payFrequency: input.payFrequency,
      effectiveFrom: hireDate,
      effectiveTo: null,
      changeReason: 'hire',
      note: null,
      fxRateToBase: pay.fxRateToBase,
      amountBaseMinor: pay.amountBaseMinor,
    },
  });

  return { employeeId: employee.id, record: toSalaryRecordDto(record) };
}

export async function applySalaryChange(
  tx: TxClient,
  employeeId: string,
  input: SalaryChangeCreate,
  fx: FxRateProvider,
  baseCurrency: string,
): Promise<SalaryRecordDto> {
  const employee = await tx.employee.findUnique({ where: { id: employeeId } });
  if (!employee) {
    throw notFound(`Employee not found: ${employeeId}`);
  }
  if (employee.status === 'terminated') {
    throw conflict('Cannot change salary for a terminated employee');
  }

  const open = await tx.salaryRecord.findFirst({
    where: { employeeId, effectiveTo: null },
  });
  if (!open) {
    throw conflict('No open salary record to change (employee may be terminated)');
  }

  const effectiveFrom = new Date(input.effectiveFrom);
  if (effectiveFrom < open.effectiveFrom) {
    throw badRequest('effectiveFrom cannot be before the open record started');
  }

  const pay = periodBaseMinor(input.amountMinor, input.currency, fx, baseCurrency);

  await tx.salaryRecord.update({
    where: { id: open.id },
    data: { effectiveTo: effectiveFrom },
  });

  const record = await tx.salaryRecord.create({
    data: {
      employeeId,
      amountMinor: pay.amountMinor,
      currency: input.currency,
      payFrequency: input.payFrequency,
      effectiveFrom,
      effectiveTo: null,
      changeReason: input.changeReason,
      note: input.note ?? null,
      fxRateToBase: pay.fxRateToBase,
      amountBaseMinor: pay.amountBaseMinor,
    },
  });

  await tx.employee.update({
    where: { id: employeeId },
    data: {
      currentSalaryAmountMinor: pay.amountMinor,
      currentSalaryCurrency: input.currency,
      currentSalaryBaseMinor: pay.amountBaseMinor,
      currentPayFrequency: input.payFrequency,
    },
  });

  return toSalaryRecordDto(record);
}

export async function applyTerminate(
  tx: TxClient,
  employeeId: string,
  input: TerminateEmployee,
  now: Date,
): Promise<void> {
  const employee = await tx.employee.findUnique({ where: { id: employeeId } });
  if (!employee) {
    throw notFound(`Employee not found: ${employeeId}`);
  }
  if (employee.status === 'terminated') {
    throw conflict('Employee is already terminated');
  }

  const open = await tx.salaryRecord.findFirst({
    where: { employeeId, effectiveTo: null },
  });
  if (!open) {
    throw conflict('No open salary record to close on termination');
  }

  const terminationDate = new Date(input.terminationDate);
  if (terminationDate < open.effectiveFrom) {
    throw badRequest('terminationDate cannot be before the open record started');
  }
  if (terminationDate > now) {
    throw badRequest('terminationDate cannot be in the future');
  }

  await tx.salaryRecord.update({
    where: { id: open.id },
    data: { effectiveTo: terminationDate, note: input.note ?? open.note },
  });

  await tx.employee.update({
    where: { id: employeeId },
    data: { status: 'terminated' },
  });
}

export { toSalaryRecordDto };
