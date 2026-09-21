'use client';

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AddEmployeeDialog } from '@/components/employees/add-employee-dialog';
import { Typography } from '@/components/typography';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  downloadEmployeesCsv,
  listEmployees,
  type EmployeeListItem,
  type EmployeeListParams,
} from '@/lib/employees-api';
import { formatMoneyMinor } from '@/lib/money-format';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { cn } from '@/lib/utils';
import type { PaginatedResponse } from '@acme/contracts';

type Props = {
  initialData: PaginatedResponse<EmployeeListItem>;
};

type Filters = {
  status: string;
  country: string;
  department: string;
  level: string;
  search: string;
};

export function EmployeesDirectory({ initialData }: Props) {
  const [filters, setFilters] = useState<Filters>({
    status: 'active',
    country: '',
    department: '',
    level: '',
    search: '',
  });
  const debouncedSearch = useDebouncedValue(filters.search, 400);
  const [page, setPage] = useState(initialData.page);
  const [pageSize] = useState(initialData.pageSize);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const skipFirstFetch = useRef(true);

  const sort = sorting[0];
  const listParams: EmployeeListParams = useMemo(
    () => ({
      page,
      pageSize,
      status: filters.status,
      country: filters.country || undefined,
      department: filters.department || undefined,
      level: filters.level || undefined,
      search: debouncedSearch,
      sort: sort?.id,
      sortDir: sort ? (sort.desc ? 'desc' : 'asc') : undefined,
    }),
    [page, pageSize, filters.status, filters.country, filters.department, filters.level, debouncedSearch, sort],
  );

  useEffect(() => {
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listEmployees(listParams, { signal: controller.signal })
      .then((result) => {
        setData(result);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load employees');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [listParams]);

  // Reset to page 1 when filters/search/sort change (not page itself)
  useEffect(() => {
    setPage(1);
  }, [filters.status, filters.country, filters.department, filters.level, debouncedSearch, sort?.id, sort?.desc]);

  const columns = useMemo<ColumnDef<EmployeeListItem>[]>(
    () => [
      {
        accessorKey: 'lastName',
        header: 'Name',
        cell: ({ row }) => (
          <Link href={`/employees/${row.original.id}`} className="hover:underline">
            <Typography variant="link">
              {row.original.lastName}, {row.original.firstName}
            </Typography>
          </Link>
        ),
      },
      {
        accessorKey: 'department',
        header: 'Department',
        cell: ({ getValue }) => (
          <Typography variant="bodyMedium">{String(getValue())}</Typography>
        ),
      },
      {
        accessorKey: 'level',
        header: 'Level',
        enableSorting: false,
        cell: ({ getValue }) => (
          <Typography variant="bodyMedium">{String(getValue())}</Typography>
        ),
      },
      {
        accessorKey: 'countryCode',
        header: 'Country',
        enableSorting: false,
        cell: ({ getValue }) => (
          <Typography variant="bodyMedium">{String(getValue())}</Typography>
        ),
      },
      {
        id: 'currentSalaryBaseMinor',
        accessorKey: 'currentSalaryBaseMinor',
        header: 'Pay (period)',
        cell: ({ row }) => (
          <Typography variant="bodyMedium" className="font-mono text-sm">
            {formatMoneyMinor(
              row.original.currentSalaryAmountMinor,
              row.original.currentSalaryCurrency,
            )}{' '}
            <span className="font-sans text-xs text-muted-foreground">
              / {row.original.currentPayFrequency}
            </span>
          </Typography>
        ),
      },
      {
        accessorKey: 'hireDate',
        header: 'Hired',
        cell: ({ getValue }) => (
          <Typography variant="small">
            {new Date(String(getValue())).toLocaleDateString()}
          </Typography>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        enableSorting: false,
        cell: ({ getValue }) => (
          <Typography variant="small">{String(getValue())}</Typography>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: data.data,
    columns,
    pageCount: Math.max(1, Math.ceil(data.total / pageSize)),
    state: { sorting, pagination: { pageIndex: page - 1, pageSize } },
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
  });

  const totalPages = Math.max(1, Math.ceil(data.total / pageSize));

  async function onExport() {
    setExporting(true);
    try {
      await downloadEmployeesCsv({
        status: filters.status,
        country: filters.country || undefined,
        department: filters.department || undefined,
        level: filters.level || undefined,
        search: debouncedSearch,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  function refresh() {
    skipFirstFetch.current = false;
    setLoading(true);
    listEmployees(listParams)
      .then(setData)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load employees');
      })
      .finally(() => setLoading(false));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Typography variant="h1">Employees</Typography>
          <Typography variant="small" className="mt-1">
            {data.total.toLocaleString()} matching · default shows active
          </Typography>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onExport} disabled={exporting}>
            <Typography variant="button">{exporting ? 'Exporting…' : 'Export CSV'}</Typography>
          </Button>
          <Button type="button" onClick={() => setAddOpen(true)}>
            <Typography variant="button">Add employee</Typography>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <FilterField label="Search">
          <Input
            placeholder="Name or email (2+ chars)"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="w-52"
          />
        </FilterField>
        <FilterField label="Status">
          <select
            className="flex h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="active">Active</option>
            <option value="terminated">Terminated</option>
          </select>
        </FilterField>
        <FilterField label="Country">
          <Input
            placeholder="e.g. IN"
            value={filters.country}
            onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))}
            className="w-24"
          />
        </FilterField>
        <FilterField label="Department">
          <Input
            placeholder="Department"
            value={filters.department}
            onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))}
            className="w-40"
          />
        </FilterField>
        <FilterField label="Level">
          <Input
            placeholder="L3"
            value={filters.level}
            onChange={(e) => setFilters((f) => ({ ...f, level: e.target.value }))}
            className="w-20"
          />
        </FilterField>
      </div>

      {error ? (
        <Typography variant="bodyMedium" className="text-red-700">
          {error}
        </Typography>
      ) : null}

      <div className={cn('relative overflow-x-auto rounded-md border border-border', loading && 'opacity-60')}>
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead className="border-b border-border bg-muted/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th key={header.id} className="px-3 py-2">
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <Typography variant="small" className="font-semibold text-foreground">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </Typography>
                        <Typography variant="small">
                          {{ asc: '↑', desc: '↓' }[header.column.getIsSorted() as string] ?? ''}
                        </Typography>
                      </button>
                    ) : (
                      <Typography variant="small" className="font-semibold text-foreground">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </Typography>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {data.data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center">
                  <Typography variant="bodyMedium" className="text-muted-foreground">
                    {loading ? 'Loading…' : 'No employees match these filters.'}
                  </Typography>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-border/70 last:border-0">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Typography variant="small">
          Page {page} of {totalPages}
        </Typography>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <Typography variant="button">Previous</Typography>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            <Typography variant="button">Next</Typography>
          </Button>
        </div>
      </div>

      <AddEmployeeDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={refresh} />
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <Typography variant="small">{label}</Typography>
      {children}
    </div>
  );
}
