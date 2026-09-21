import { AnalyticsDashboard } from '@/components/analytics/analytics-dashboard';
import { Typography } from '@/components/typography';
import {
  getAnalyticsSummary,
  getDistribution,
  getHeadcount,
  getPayrollCost,
  listOutliers,
  type AnalyticsBucket,
  type AnalyticsGroupBy,
  type OutlierRow,
} from '@/lib/analytics-api';
import type { AnalyticsDistribution, AnalyticsSummary, PaginatedResponse } from '@acme/contracts';

export const dynamic = 'force-dynamic';

const DEFAULT_GROUP_BY: AnalyticsGroupBy = 'department';

type InitialPayload = {
  summary: AnalyticsSummary;
  headcount: { groupBy: AnalyticsGroupBy; buckets: AnalyticsBucket[] };
  payroll: { groupBy: AnalyticsGroupBy; buckets: AnalyticsBucket[] };
  distribution: AnalyticsDistribution;
  outliers: PaginatedResponse<OutlierRow>;
};

async function loadInitial(): Promise<
  { ok: true; data: InitialPayload } | { ok: false; message: string }
> {
  try {
    const [summary, headcount, payroll, distribution, outliers] = await Promise.all([
      getAnalyticsSummary(),
      getHeadcount({ groupBy: DEFAULT_GROUP_BY }),
      getPayrollCost({ groupBy: DEFAULT_GROUP_BY }),
      getDistribution({ groupBy: DEFAULT_GROUP_BY }),
      listOutliers({ page: 1, pageSize: 20 }),
    ]);
    return {
      ok: true,
      data: { summary, headcount, payroll, distribution, outliers },
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Failed to load analytics',
    };
  }
}

export default async function AnalyticsPage() {
  const initial = await loadInitial();

  if (!initial.ok) {
    return (
      <section className="space-y-3">
        <Typography variant="h1">Analytics</Typography>
        <Typography variant="bodyMedium" className="text-red-700">
          {initial.message}
        </Typography>
        <Typography variant="small">
          Ensure the API is running and NEXT_PUBLIC_DEMO_ACCESS_TOKEN matches DEMO_ACCESS_TOKEN.
        </Typography>
      </section>
    );
  }

  return (
    <AnalyticsDashboard
      initialSummary={initial.data.summary}
      initialHeadcount={initial.data.headcount}
      initialPayroll={initial.data.payroll}
      initialDistribution={initial.data.distribution}
      initialOutliers={initial.data.outliers}
    />
  );
}
