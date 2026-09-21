import { Typography } from '@/components/typography';

export default function EmployeesPage() {
  return (
    <section className="space-y-3">
      <Typography variant="h1">Employees</Typography>
      <Typography variant="bodyMedium" className="text-muted-foreground">
        Directory UI lands in the next commit — scaffold is wired to the API client and query
        provider.
      </Typography>
    </section>
  );
}
