import type { Employee as PrismaEmployee, Prisma } from '@prisma/client';

export type EmployeeRow = PrismaEmployee & {
  manager?: { firstName: string; lastName: string } | null;
};

export type EmployeeDto = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  countryCode: string;
  location: string;
  department: string;
  jobFamily: string;
  level: string;
  managerId: string | null;
  managerName: string | null;
  employmentType: string;
  hireDate: string;
  status: string;
  gender: string | null;
  currentSalaryAmountMinor: string;
  currentSalaryCurrency: string;
  currentSalaryBaseMinor: string;
  currentPayFrequency: string;
  createdAt: string;
  updatedAt: string;
};

export function toEmployeeDto(row: EmployeeRow): EmployeeDto {
  return {
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
    managerId: row.managerId,
    managerName: row.manager
      ? `${row.manager.firstName} ${row.manager.lastName}`
      : null,
    employmentType: row.employmentType,
    hireDate: row.hireDate.toISOString(),
    status: row.status,
    gender: row.gender,
    currentSalaryAmountMinor: row.currentSalaryAmountMinor.toString(),
    currentSalaryCurrency: row.currentSalaryCurrency,
    currentSalaryBaseMinor: row.currentSalaryBaseMinor.toString(),
    currentPayFrequency: row.currentPayFrequency,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type EmployeeListFilters = {
  page: number;
  pageSize: number;
  country?: string;
  department?: string;
  level?: string;
  status: string;
  search?: string;
  sort?: 'lastName' | 'hireDate' | 'department' | 'currentSalaryBaseMinor';
  sortDir?: 'asc' | 'desc';
};

export type EmployeeUpdateInput = Prisma.EmployeeUpdateInput;
