import { Typography } from '@/components/typography';

type Props = {
  params: Promise<{ id: string }>;
};

/** Placeholder until commit 16 (employee detail). */
export default async function EmployeeDetailPlaceholder({ params }: Props) {
  const { id } = await params;
  return (
    <section className="space-y-3">
      <Typography variant="h1">Employee</Typography>
      <Typography variant="bodyMedium" className="text-muted-foreground">
        Detail view for <span className="font-mono text-foreground">{id}</span> lands in the next
        commit (profile, history, raise, terminate).
      </Typography>
    </section>
  );
}
