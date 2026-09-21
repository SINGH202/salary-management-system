export type PaginationInput = {
  page: number;
  pageSize: number;
};

export type PaginatedResult<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
};

export function normalizePagination(
  page: number | undefined,
  pageSize: number | undefined,
  defaults: { page?: number; pageSize?: number } = {},
): PaginationInput {
  const resolvedPage = page ?? defaults.page ?? 1;
  const resolvedPageSize = pageSize ?? defaults.pageSize ?? 20;
  return {
    page: Math.max(1, resolvedPage),
    pageSize: Math.min(100, Math.max(1, resolvedPageSize)),
  };
}

export function paginationSkipTake({ page, pageSize }: PaginationInput): {
  skip: number;
  take: number;
} {
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function toPaginatedResult<T>(
  data: T[],
  total: number,
  { page, pageSize }: PaginationInput,
): PaginatedResult<T> {
  return { data, page, pageSize, total };
}
