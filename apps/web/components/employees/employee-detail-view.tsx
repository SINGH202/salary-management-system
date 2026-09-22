'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RaiseSalaryForm } from '@/components/employees/raise-salary-form';
import { TerminateEmployeeDialog } from '@/components/employees/terminate-employee-dialog';
import { Typography } from '@/components/typography';
import { Button } from '@/components/ui/button';
import { formatDateOnlyUtc } from '@/lib/date-format';
import {
  getEmployee,
  getEmployeeHistory,
  type EmployeeDetail,
  type SalaryHistoryRecord,
} from '@/lib/employees-api';
import { formatMoneyMinor } from '@/lib/money-format';

function labelize(value: string): string {
  return value.replaceAll('_', ' ');
}

type Props = {
  employee: EmployeeDetail;
  history: SalaryHistoryRecord[];
};

export function EmployeeDetailView({ employee: initial, history: initialHistory }: Props) {
  const router = useRouter();
  const [employee, setEmployee] = useState(initial);
  const [history, setHistory] = useState(initialHistory);
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const isActive = employee.status === 'active';

  async function reload() {
    setReloadError(null);
    try {
      const [nextEmployee, nextHistory] = await Promise.all([
        getEmployee(employee.id),
        getEmployeeHistory(employee.id),
      ]);
      setEmployee(nextEmployee);
      setHistory(nextHistory);
      router.refresh();
    } catch (err) {
      setReloadError(
        err instanceof Error
          ? `Saved, but refresh failed: ${err.message}. Reload the page to see the latest data.`
          : 'Saved, but refresh failed. Reload the page to see the latest data.',
      );
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href="/employees" className="inline-block">
            <Typography variant="link">← Directory</Typography>
          </Link>
          <Typography variant="h1">
            {employee.firstName} {employee.lastName}
          </Typography>
          <Typography variant="small">
            {employee.employeeCode} · {employee.workEmail} · {employee.status}
          </Typography>
        </div>
        {isActive ? (
          <Button type="button" variant="outline" onClick={() => setTerminateOpen(true)}>
            <Typography variant="button">Terminate</Typography>
          </Button>
        ) : null}
      </div>

      {reloadError ? (
        <Typography variant="small" className="text-red-700">
          {reloadError}
        </Typography>
      ) : null}

      <section className="grid gap-6 md:grid-cols-2">
        <div className="space-y-3 rounded-md border border-border p-4">
          <Typography variant="h3">Profile</Typography>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2">
            <ProfileRow label="Department" value={employee.department} />
            <ProfileRow label="Job family" value={employee.jobFamily} />
            <ProfileRow label="Level" value={employee.level} />
            <ProfileRow label="Location" value={`${employee.location}, ${employee.countryCode}`} />
            <ProfileRow label="Employment" value={labelize(employee.employmentType)} />
            <ProfileRow label="Hired" value={formatDateOnlyUtc(employee.hireDate)} />
            <ProfileRow label="Manager" value={employee.managerName ?? '—'} />
            <ProfileRow
              label="Current pay"
              value={`${formatMoneyMinor(employee.currentSalaryAmountMinor, employee.currentSalaryCurrency)} / ${employee.currentPayFrequency}`}
            />
          </dl>
        </div>

        <div className="space-y-3 rounded-md border border-border p-4">
          <Typography variant="h3">Record a raise</Typography>
          {isActive ? (
            <RaiseSalaryForm
              employeeId={employee.id}
              defaultCurrency={employee.currentSalaryCurrency}
              defaultPayFrequency={
                employee.currentPayFrequency === 'monthly' ? 'monthly' : 'annual'
              }
              onSuccess={() => {
                void reload();
              }}
            />
          ) : (
            <Typography variant="small">
              Terminated employees cannot receive salary changes.
            </Typography>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <Typography variant="h3">Salary history</Typography>
        {history.length === 0 ? (
          <Typography variant="small">No salary records yet.</Typography>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-background">
            {history.map((record) => (
              <li
                key={record.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Typography
                      variant="small"
                      className="rounded-md bg-muted px-2 py-0.5 font-medium capitalize text-foreground"
                    >
                      {labelize(record.changeReason)}
                    </Typography>
                    <Typography variant="bodyMedium" className="font-medium">
                      {formatMoneyMinor(record.amountMinor, record.currency)}
                    </Typography>
                    <Typography variant="small">/ {record.payFrequency}</Typography>
                  </div>
                  {record.note ? (
                    <Typography variant="small">{record.note}</Typography>
                  ) : null}
                </div>
                <Typography
                  variant="small"
                  className="shrink-0 tabular-nums text-muted-foreground sm:pt-0.5 sm:text-right"
                >
                  {formatDateOnlyUtc(record.effectiveFrom)}
                  {record.effectiveTo
                    ? ` → ${formatDateOnlyUtc(record.effectiveTo)}`
                    : ' → open'}
                </Typography>
              </li>
            ))}
          </ul>
        )}
      </section>

      <TerminateEmployeeDialog
        open={terminateOpen}
        employeeId={employee.id}
        onClose={() => setTerminateOpen(false)}
        onTerminated={() => {
          setTerminateOpen(false);
          void reload();
        }}
      />
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <Typography variant="small" as="dt">
        {label}
      </Typography>
      <Typography variant="bodyMedium" as="dd">
        {value}
      </Typography>
    </>
  );
}
