import type { PaginatedResponse } from '@acme/contracts';
import { apiFetch, ApiError, getApiBaseUrl } from '@/lib/api-client';

export type EmployeeListItem = {
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
  employmentType: string;
  hireDate: string;
  status: string;
  currentSalaryAmountMinor: string;
  currentSalaryCurrency: string;
  currentSalaryBaseMinor: string;
  currentPayFrequency: string;
};

export type EmployeeListParams = {
  page: number;
  pageSize: number;
  status: string;
  country?: string;
  department?: string;
  level?: string;
  search?: string;
  sort?: string;
  sortDir?: 'asc' | 'desc';
};

export type EmployeeCreateBody = {
  employeeCode: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  countryCode: string;
  location: string;
  department: string;
  jobFamily: string;
  level: string;
  managerId?: string | null;
  employmentType: 'full_time' | 'part_time' | 'contractor';
  hireDate: string;
  gender?: string | null;
  amountMinor: string;
  currency: string;
  payFrequency: 'annual' | 'monthly';
};

function toQuery(params: EmployeeListParams): string {
  const q = new URLSearchParams();
  q.set('page', String(params.page));
  q.set('pageSize', String(params.pageSize));
  q.set('status', params.status);
  if (params.country) q.set('country', params.country);
  if (params.department) q.set('department', params.department);
  if (params.level) q.set('level', params.level);
  if (params.search && params.search.trim().length >= 2) {
    q.set('search', params.search.trim());
  }
  if (params.sort) q.set('sort', params.sort);
  if (params.sortDir) q.set('sortDir', params.sortDir);
  return q.toString();
}

export async function listEmployees(
  params: EmployeeListParams,
  init?: { signal?: AbortSignal },
): Promise<PaginatedResponse<EmployeeListItem>> {
  return apiFetch<PaginatedResponse<EmployeeListItem>>(`/api/employees?${toQuery(params)}`, {
    signal: init?.signal,
  });
}

export async function createEmployee(body: EmployeeCreateBody): Promise<EmployeeListItem> {
  return apiFetch<EmployeeListItem>('/api/employees', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Browser download of filtered CSV export. */
export async function downloadEmployeesCsv(params: Omit<EmployeeListParams, 'page' | 'pageSize' | 'sort' | 'sortDir'>): Promise<void> {
  const q = new URLSearchParams();
  q.set('status', params.status);
  if (params.country) q.set('country', params.country);
  if (params.department) q.set('department', params.department);
  if (params.level) q.set('level', params.level);
  if (params.search && params.search.trim().length >= 2) {
    q.set('search', params.search.trim());
  }

  const token = process.env.NEXT_PUBLIC_DEMO_ACCESS_TOKEN ?? '';
  const res = await fetch(`${getApiBaseUrl()}/api/export/employees?${q.toString()}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new ApiError(res.status, 'EXPORT_FAILED', 'Failed to export employees CSV');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'employees.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export { ApiError };
