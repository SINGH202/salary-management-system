import type { AnalyticsDistribution, AnalyticsSummary, PaginatedResponse } from '@acme/contracts';
import { apiFetch } from '@/lib/api-client';

export type AnalyticsGroupBy = 'country' | 'department' | 'level';

export type AnalyticsBucket = {
  key: string;
  value: number | string;
};

export type AnalyticsBucketsResponse = {
  groupBy: AnalyticsGroupBy;
  buckets: AnalyticsBucket[];
};

export type AnalyticsScopeParams = {
  groupBy?: AnalyticsGroupBy;
  includeTerminated?: boolean;
  includeContractors?: boolean;
};

export type OutlierRow = {
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

function toQuery(params: AnalyticsScopeParams): string {
  const q = new URLSearchParams();
  if (params.groupBy) q.set('groupBy', params.groupBy);
  if (params.includeTerminated === true) q.set('includeTerminated', 'true');
  if (params.includeTerminated === false) q.set('includeTerminated', 'false');
  if (params.includeContractors === true) q.set('includeContractors', 'true');
  if (params.includeContractors === false) q.set('includeContractors', 'false');
  return q.toString();
}

export async function getAnalyticsSummary(
  params: Omit<AnalyticsScopeParams, 'groupBy'> = {},
  init?: { signal?: AbortSignal },
): Promise<AnalyticsSummary> {
  const qs = toQuery(params);
  return apiFetch<AnalyticsSummary>(`/api/analytics/summary${qs ? `?${qs}` : ''}`, {
    signal: init?.signal,
  });
}

export async function getHeadcount(
  params: AnalyticsScopeParams,
  init?: { signal?: AbortSignal },
): Promise<AnalyticsBucketsResponse> {
  return apiFetch<AnalyticsBucketsResponse>(`/api/analytics/headcount?${toQuery(params)}`, {
    signal: init?.signal,
  });
}

export async function getPayrollCost(
  params: AnalyticsScopeParams,
  init?: { signal?: AbortSignal },
): Promise<AnalyticsBucketsResponse> {
  return apiFetch<AnalyticsBucketsResponse>(`/api/analytics/payroll-cost?${toQuery(params)}`, {
    signal: init?.signal,
  });
}

export async function getDistribution(
  params: AnalyticsScopeParams,
  init?: { signal?: AbortSignal },
): Promise<AnalyticsDistribution> {
  return apiFetch<AnalyticsDistribution>(`/api/analytics/distribution?${toQuery(params)}`, {
    signal: init?.signal,
  });
}

export async function listOutliers(
  params: { page: number; pageSize: number; includeTerminated?: boolean },
  init?: { signal?: AbortSignal },
): Promise<PaginatedResponse<OutlierRow>> {
  const q = new URLSearchParams();
  q.set('page', String(params.page));
  q.set('pageSize', String(params.pageSize));
  if (params.includeTerminated === true) q.set('includeTerminated', 'true');
  return apiFetch<PaginatedResponse<OutlierRow>>(`/api/bands/outliers?${q.toString()}`, {
    signal: init?.signal,
  });
}

/** Convert money minor-unit string to a major-unit number for chart axes. */
export function minorToMajorNumber(amountMinor: string | number): number {
  if (typeof amountMinor === 'number') return amountMinor;
  if (!/^-?\d+$/.test(amountMinor)) return Number.NaN;
  return Number(amountMinor) / 100;
}
