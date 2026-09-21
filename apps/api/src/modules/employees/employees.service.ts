import type { EmployeeUpdate } from '@acme/contracts';
import type { Prisma } from '@prisma/client';
import { badRequest, notFound } from '../../common/error-handler.js';
import type { PaginatedResult } from '../../common/pagination.js';
import type { EmployeesRepository } from './employees.repository.js';
import type { EmployeeDto, EmployeeListFilters } from './employees.types.js';

export class EmployeesService {
  constructor(private readonly repo: EmployeesRepository) {}

  list(filters: EmployeeListFilters): Promise<PaginatedResult<EmployeeDto>> {
    return this.repo.findMany(filters);
  }

  async getById(id: string): Promise<EmployeeDto> {
    const employee = await this.repo.findById(id);
    if (!employee) {
      throw notFound(`Employee not found: ${id}`);
    }
    return employee;
  }

  async update(id: string, input: EmployeeUpdate): Promise<EmployeeDto> {
    const exists = await this.repo.exists(id);
    if (!exists) {
      throw notFound(`Employee not found: ${id}`);
    }

    if (input.managerId !== undefined && input.managerId !== null) {
      if (input.managerId === id) {
        throw badRequest('managerId cannot reference the employee themselves');
      }
      const managerExists = await this.repo.exists(input.managerId);
      if (!managerExists) {
        throw badRequest(`managerId does not exist: ${input.managerId}`);
      }
    }

    const data: Prisma.EmployeeUpdateInput = {};
    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;
    if (input.location !== undefined) data.location = input.location;
    if (input.department !== undefined) data.department = input.department;
    if (input.jobFamily !== undefined) data.jobFamily = input.jobFamily;
    if (input.level !== undefined) data.level = input.level;
    if (input.employmentType !== undefined) data.employmentType = input.employmentType;
    if (input.gender !== undefined) data.gender = input.gender;
    if (input.countryCode !== undefined) data.countryCode = input.countryCode;
    if (input.managerId !== undefined) {
      data.manager =
        input.managerId === null
          ? { disconnect: true }
          : { connect: { id: input.managerId } };
    }

    return this.repo.update(id, data);
  }
}
