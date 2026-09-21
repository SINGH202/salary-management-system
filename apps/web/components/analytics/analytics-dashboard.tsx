'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Typography } from '@/components/typography';
import { Button } from '@/components/ui/button';
import {
  getDistribution,
  getHeadcount,
  getPayrollCost,
  listOutliers,
  minorToMajorNumber,
  type AnalyticsBucket,
  type AnalyticsGroupBy,
  type OutlierRow,
} from '@/lib/analytics-api';
import { formatMoneyMinor } from '@/lib/money-format';
import { cn } from '@/lib/utils';
import type { AnalyticsDistribution, AnalyticsSummary, PaginatedResponse } from '@acme/contracts';

const BASE_CURRENCY = 'INR';

const GROUP_OPTIONS: { value: AnalyticsGroupBy; label: string }[] = [
  { value: 'department', label: 'Department' },
  { value: 'country', label: 'Country' },
  { value: 'level', label: 'Level' },
];

export type AnalyticsDashboardProps = {
  initialSummary: AnalyticsSummary;
  initialHeadcount: { groupBy: AnalyticsGroupBy; buckets: AnalyticsBucket[] };
  initialPayroll: { groupBy: AnalyticsGroupBy; buckets: AnalyticsBucket[] };
  initialDistribution: AnalyticsDistribution;
  initialOutliers: PaginatedResponse<OutlierRow>;
};

export function AnalyticsDashboard({
  initialSummary,
  initialHeadcount,
  initialPayroll,
  initialDistribution,
  initialOutliers,
}: AnalyticsDashboardProps) {
  const [groupBy, setGroupBy] = useState<AnalyticsGroupBy>(initialHeadcount.groupBy);
  const [includeContractorsInPayroll, setIncludeContractorsInPayroll] = useState(false);
  const [summary] = useState(initialSummary);
  const [headcount, setHeadcount] = useState(initialHeadcount);
  const [payroll, setPayroll] = useState(initialPayroll);
  const [distribution, setDistribution] = useState(initialDistribution);
  const [outliers, setOutliers] = useState(initialOutliers);
  const [outlierPage, setOutlierPage] = useState(initialOutliers.page);
  const [chartsLoading, setChartsLoading] = useState(false);
  const [outliersLoading, setOutliersLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipFirstChartsFetch = useRef(true);
  const skipFirstOutliersFetch = useRef(true);

  useEffect(() => {
    if (skipFirstChartsFetch.current) {
      skipFirstChartsFetch.current = false;
      return;
    }
    const controller = new AbortController();
    setChartsLoading(true);
    setError(null);
    Promise.all([
      getHeadcount({ groupBy }, { signal: controller.signal }),
      getPayrollCost(
        { groupBy, includeContractors: includeContractorsInPayroll },
        { signal: controller.signal },
      ),
      getDistribution(
        { groupBy, includeContractors: includeContractorsInPayroll },
        { signal: controller.signal },
      ),
    ])
      .then(([nextHeadcount, nextPayroll, nextDistribution]) => {
        setHeadcount(nextHeadcount);
        setPayroll(nextPayroll);
        setDistribution(nextDistribution);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load analytics charts');
      })
      .finally(() => {
        if (!controller.signal.aborted) setChartsLoading(false);
      });
    return () => controller.abort();
  }, [groupBy, includeContractorsInPayroll]);

  useEffect(() => {
    if (skipFirstOutliersFetch.current) {
      skipFirstOutliersFetch.current = false;
      return;
    }
    const controller = new AbortController();
    setOutliersLoading(true);
    setError(null);
    listOutliers(
      { page: outlierPage, pageSize: initialOutliers.pageSize },
      { signal: controller.signal },
    )
      .then((result) => setOutliers(result))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load outliers');
      })
      .finally(() => {
        if (!controller.signal.aborted) setOutliersLoading(false);
      });
    return () => controller.abort();
  }, [outlierPage, initialOutliers.pageSize]);

  const headcountChart = headcount.buckets.map((b) => ({
    key: b.key,
    value: typeof b.value === 'number' ? b.value : Number(b.value),
  }));

  const payrollChart = payroll.buckets.map((b) => ({
    key: b.key,
    value: minorToMajorNumber(b.value),
  }));

  const distributionChart = distribution.buckets.map((b) => ({
    key: b.key,
    p25: minorToMajorNumber(b.p25),
    median: minorToMajorNumber(b.median),
    p75: minorToMajorNumber(b.p75),
  }));

  const totalOutlierPages = Math.max(1, Math.ceil(outliers.total / outliers.pageSize));

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Typography variant="h1">Analytics</Typography>
        <Typography variant="small">
          Active employees only. Headcount includes contractors. Payroll cost excludes contractors
          unless shown.
        </Typography>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryStat label="Headcount" value={String(summary.headcount)} />
        <SummaryStat
          label="Payroll (annual)"
          value={formatMoneyMinor(summary.payrollCostAnnualBase, BASE_CURRENCY)}
        />
        <SummaryStat
          label="Average"
          value={formatMoneyMinor(summary.averageAnnualBase, BASE_CURRENCY)}
        />
        <SummaryStat
          label="Median"
          value={formatMoneyMinor(summary.medianAnnualBase, BASE_CURRENCY)}
        />
        <SummaryStat label="Outliers" value={String(summary.outlierCount)} />
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Typography variant="small" className="text-foreground">
          Group by
        </Typography>
        <div className="flex flex-wrap gap-2">
          {GROUP_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGroupBy(opt.value)}
              className={cn(
                'rounded-md border px-3 py-1.5 transition-colors',
                groupBy === opt.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background hover:bg-muted/70',
              )}
            >
              <Typography variant="button">{opt.label}</Typography>
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeContractorsInPayroll}
            onChange={(e) => setIncludeContractorsInPayroll(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <Typography variant="small" className="text-foreground">
            Include contractors in payroll &amp; distribution
          </Typography>
        </label>
      </div>

      {error ? (
        <Typography variant="small" className="text-red-700">
          {error}
        </Typography>
      ) : null}

      <div className={cn('grid gap-6 lg:grid-cols-2', chartsLoading && 'opacity-60')}>
        <ChartPanel
          title="Headcount"
          note="Includes contractors."
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={headcountChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="key" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} width={40} />
              <Tooltip />
              <Bar dataKey="value" name="People" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel
          title="Payroll cost"
          note={
            includeContractorsInPayroll
              ? 'Contractors included (annualized base, INR).'
              : 'Excludes contractors unless shown (annualized base, INR).'
          }
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={payrollChart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="key" tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 12 }}
                width={72}
                tickFormatter={(v: number) => compactMajor(v)}
              />
              <Tooltip
                formatter={(value: number) => [
                  formatMoneyMinor(String(Math.round(value * 100)), BASE_CURRENCY),
                  'Annual base',
                ]}
              />
              <Bar dataKey="value" name="Annual base" fill="hsl(var(--chart-2, 173 58% 39%))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      <ChartPanel
        title="Pay distribution"
        note="p25 / median / p75 of annualized base pay (INR). Same contractor scoping as payroll."
        className={chartsLoading ? 'opacity-60' : undefined}
      >
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={distributionChart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="key" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              width={72}
              tickFormatter={(v: number) => compactMajor(v)}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                formatMoneyMinor(String(Math.round(value * 100)), BASE_CURRENCY),
                name,
              ]}
            />
            <Legend />
            <Bar dataKey="p25" name="p25" fill="hsl(210 40% 70%)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="median" name="Median" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="p75" name="p75" fill="hsl(173 58% 39%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <Typography variant="h3">Compensation outliers</Typography>
            <Typography variant="small">
              Active employees outside their band min/max (annualized base vs band in INR).
            </Typography>
          </div>
          <Typography variant="small">
            {outliers.total} total · page {outliers.page} of {totalOutlierPages}
          </Typography>
        </div>

        <div className={cn('overflow-x-auto rounded-md border border-border', outliersLoading && 'opacity-60')}>
          <table className="w-full min-w-[640px] text-left">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <Th>Employee</Th>
                <Th>Family / level</Th>
                <Th>Country</Th>
                <Th>Side</Th>
                <Th>Annual base</Th>
                <Th>Band range</Th>
              </tr>
            </thead>
            <tbody>
              {outliers.data.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6">
                    <Typography variant="small">No outliers in this page.</Typography>
                  </td>
                </tr>
              ) : (
                outliers.data.map((row) => (
                  <tr key={row.employeeId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5">
                      <Link href={`/employees/${row.employeeId}`} className="inline-block">
                        <Typography variant="link">
                          {row.firstName} {row.lastName}
                        </Typography>
                      </Link>
                      <Typography variant="small">{row.employeeCode}</Typography>
                    </td>
                    <td className="px-3 py-2.5">
                      <Typography variant="bodyMedium">
                        {row.jobFamily} · {row.level}
                      </Typography>
                    </td>
                    <td className="px-3 py-2.5">
                      <Typography variant="bodyMedium">{row.countryCode}</Typography>
                    </td>
                    <td className="px-3 py-2.5">
                      <Typography
                        variant="bodyMedium"
                        className={row.side === 'above' ? 'text-amber-800' : 'text-sky-800'}
                      >
                        {row.side}
                      </Typography>
                    </td>
                    <td className="px-3 py-2.5">
                      <Typography variant="bodyMedium">
                        {formatMoneyMinor(row.annualBaseMinor, BASE_CURRENCY)}
                      </Typography>
                    </td>
                    <td className="px-3 py-2.5">
                      <Typography variant="small" className="text-foreground">
                        {formatMoneyMinor(row.bandMinBaseMinor, BASE_CURRENCY)} –{' '}
                        {formatMoneyMinor(row.bandMaxBaseMinor, BASE_CURRENCY)}
                      </Typography>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={outlierPage <= 1 || outliersLoading}
            onClick={() => setOutlierPage((p) => Math.max(1, p - 1))}
          >
            <Typography variant="button">Previous</Typography>
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={outlierPage >= totalOutlierPages || outliersLoading}
            onClick={() => setOutlierPage((p) => p + 1)}
          >
            <Typography variant="button">Next</Typography>
          </Button>
        </div>
      </section>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-md border border-border p-4">
      <Typography variant="small">{label}</Typography>
      <Typography variant="h3" className="break-all">
        {value}
      </Typography>
    </div>
  );
}

function ChartPanel({
  title,
  note,
  children,
  className,
}: {
  title: string;
  note: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-3 rounded-md border border-border p-4', className)}>
      <div className="space-y-1">
        <Typography variant="h3">{title}</Typography>
        <Typography variant="small">{note}</Typography>
      </div>
      {children}
    </section>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="px-3 py-2">
      <Typography variant="small" className="font-medium text-foreground">
        {children}
      </Typography>
    </th>
  );
}

function compactMajor(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(Math.round(value));
}
