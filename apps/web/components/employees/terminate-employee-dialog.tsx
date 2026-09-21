'use client';

import { useState, type FormEvent } from 'react';
import { Typography } from '@/components/typography';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { todayLocalDateInput } from '@/lib/date-format';
import { ApiError, terminateEmployee } from '@/lib/employees-api';

type Props = {
  open: boolean;
  employeeId: string;
  onClose: () => void;
  onTerminated: () => void;
};

export function TerminateEmployeeDialog({
  open,
  employeeId,
  onClose,
  onTerminated,
}: Props) {
  const [terminationDate, setTerminationDate] = useState(todayLocalDateInput);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await terminateEmployee(employeeId, {
        terminationDate: new Date(`${terminationDate}T00:00:00.000Z`).toISOString(),
        note: note.trim() || undefined,
      });
      onTerminated();
    } catch (err) {
      setError(
        err instanceof ApiError || err instanceof Error ? err.message : 'Terminate failed',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/40 p-4 pt-24">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="terminate-title"
        className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg"
      >
        <Typography variant="h2" id="terminate-title" className="mb-2">
          Terminate employee?
        </Typography>
        <Typography variant="small" className="mb-4">
          This is one-way. The open salary record will close and they leave active payroll.
        </Typography>
        <form className="grid gap-3" onSubmit={onSubmit}>
          <div className="grid gap-1.5">
            <Label>Termination date</Label>
            <Input
              required
              type="date"
              value={terminationDate}
              onChange={(e) => setTerminationDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error ? (
            <Typography variant="small" className="text-red-700">
              {error}
            </Typography>
          ) : null}
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              <Typography variant="button">Cancel</Typography>
            </Button>
            <Button type="submit" disabled={submitting}>
              <Typography variant="button">
                {submitting ? 'Terminating…' : 'Confirm terminate'}
              </Typography>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
