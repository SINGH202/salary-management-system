import { EmployeesDirectory } from '@/components/employees/employees-directory';
import { Typography } from '@/components/typography';
import { listEmployees, type EmployeeListItem } from '@/lib/employees-api';
import type { PaginatedResponse } from '@acme/contracts';

export const dynamic = 'force-dynamic';

async function loadInitial(): Promise<
  { ok: true; data: PaginatedResponse<EmployeeListItem> } | { ok: false; message: string }
> {
  try {
    const data = await listEmployees({
      page: 1,
      pageSize: 20,
      status: 'active',
    });
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Failed to load employees',
    };
  }
}

export default async function EmployeesPage() {
  const initial = await loadInitial();

  if (!initial.ok) {
    return (
      <section className="space-y-3">
        <Typography variant="h1">Employees</Typography>
        <Typography variant="bodyMedium" className="text-red-700">
          {initial.message}
        </Typography>
        <Typography variant="small">
          Ensure the API is running and NEXT_PUBLIC_DEMO_ACCESS_TOKEN matches DEMO_ACCESS_TOKEN.
        </Typography>
      </section>
    );
  }

  return <EmployeesDirectory initialData={initial.data} />;
}
