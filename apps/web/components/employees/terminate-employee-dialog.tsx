'use client';

import { useState, type FormEvent } from 'react';
import { Typography } from '@/components/typography';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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

export function TerminateEmployeeDialog({ open, employeeId, onClose, onTerminated }: Props) {
  const [terminationDate, setTerminationDate] = useState(todayLocalDateInput);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !submitting) {
      onClose();
    }
  }

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
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Terminate failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Terminate employee?</AlertDialogTitle>
          <AlertDialogDescription>
            This is one-way. The open salary record will close and they leave active payroll.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form className="grid gap-4" onSubmit={onSubmit}>
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
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>
              <Typography variant="button">Cancel</Typography>
            </AlertDialogCancel>
            <Button type="submit" disabled={submitting}>
              <Typography variant="button">
                {submitting ? 'Terminating…' : 'Confirm terminate'}
              </Typography>
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
