import { describe, expect, it } from 'vitest';
import { normalizePagination, paginationSkipTake, toPaginatedResult } from './pagination.js';

describe('normalizePagination', () => {
  it('applies defaults and clamps pageSize to max 100', () => {
    expect(normalizePagination(undefined, undefined)).toEqual({ page: 1, pageSize: 20 });
    expect(normalizePagination(2, 500)).toEqual({ page: 2, pageSize: 100 });
    expect(normalizePagination(0, 0)).toEqual({ page: 1, pageSize: 1 });
  });
});

describe('paginationSkipTake', () => {
  it('computes skip/take for 1-indexed pages', () => {
    expect(paginationSkipTake({ page: 1, pageSize: 20 })).toEqual({ skip: 0, take: 20 });
    expect(paginationSkipTake({ page: 3, pageSize: 20 })).toEqual({ skip: 40, take: 20 });
  });
});

describe('toPaginatedResult', () => {
  it('wraps rows in the shared envelope', () => {
    expect(toPaginatedResult(['a'], 1, { page: 1, pageSize: 20 })).toEqual({
      data: ['a'],
      page: 1,
      pageSize: 20,
      total: 1,
    });
  });
});
