import { EmployeeDetailView } from '@/components/employees/employee-detail-view';
import { Typography } from '@/components/typography';
import { ApiError, getEmployee, getEmployeeHistory } from '@/lib/employees-api';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EmployeeDetailPage({ params }: Props) {
  const { id } = await params;

  try {
    const [employee, history] = await Promise.all([
      getEmployee(id),
      getEmployeeHistory(id),
    ]);
    return <EmployeeDetailView employee={employee} history={history} />;
  } catch (err) {
    const notFound = err instanceof ApiError && err.status === 404;
    return (
      <section className="space-y-3">
        <Typography variant="h1">{notFound ? 'Employee not found' : 'Something went wrong'}</Typography>
        <Typography variant="bodyMedium" className="text-muted-foreground">
          {notFound
            ? `No employee with id ${id}.`
            : err instanceof Error
              ? err.message
              : 'Failed to load employee'}
        </Typography>
      </section>
    );
  }
}
