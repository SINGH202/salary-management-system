'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Typography } from '@/components/typography';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { todayLocalDateInput } from '@/lib/date-format';
import { ApiError, createEmployee, type EmployeeCreateBody } from '@/lib/employees-api';
import { majorToMinorString } from '@/lib/money-format';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

const emptyForm = {
  employeeCode: '',
  firstName: '',
  lastName: '',
  workEmail: '',
  countryCode: 'IN',
  location: '',
  department: '',
  jobFamily: '',
  level: 'L3',
  employmentType: 'full_time' as 'full_time' | 'part_time' | 'contractor',
  hireDate: '',
  amountMajor: '',
  currency: 'INR',
  payFrequency: 'annual' as 'annual' | 'monthly',
};

type FormState = typeof emptyForm;

function freshForm(): FormState {
  return { ...emptyForm, hireDate: todayLocalDateInput() };
}

export function AddEmployeeDialog({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState<FormState>(freshForm);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

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
      const amountMinor = majorToMinorString(form.amountMajor);
      const hireDate = new Date(`${form.hireDate}T00:00:00.000Z`).toISOString();
      const body: EmployeeCreateBody = {
        employeeCode: form.employeeCode.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        workEmail: form.workEmail.trim(),
        countryCode: form.countryCode.trim().toUpperCase(),
        location: form.location.trim(),
        department: form.department.trim(),
        jobFamily: form.jobFamily.trim(),
        level: form.level.trim(),
        employmentType: form.employmentType,
        hireDate,
        amountMinor,
        currency: form.currency.trim().toUpperCase(),
        payFrequency: form.payFrequency,
      };
      await createEmployee(body);
      setForm(freshForm());
      onCreated();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create employee');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4 pr-12 text-left">
          <DialogTitle>Add employee</DialogTitle>
        </DialogHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="grid gap-4">
              <Field label="Employee code">
                <Input
                  required
                  value={form.employeeCode}
                  onChange={(e) => update('employeeCode', e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="First name">
                  <Input
                    required
                    value={form.firstName}
                    onChange={(e) => update('firstName', e.target.value)}
                  />
                </Field>
                <Field label="Last name">
                  <Input
                    required
                    value={form.lastName}
                    onChange={(e) => update('lastName', e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Work email">
                <Input
                  required
                  type="email"
                  value={form.workEmail}
                  onChange={(e) => update('workEmail', e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
                <Field label="Country">
                  <Input
                    required
                    maxLength={2}
                    value={form.countryCode}
                    onChange={(e) => update('countryCode', e.target.value)}
                    aria-label="Country ISO code"
                  />
                </Field>
                <Field label="Location">
                  <Input
                    required
                    value={form.location}
                    onChange={(e) => update('location', e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Department">
                  <Input
                    required
                    value={form.department}
                    onChange={(e) => update('department', e.target.value)}
                  />
                </Field>
                <Field label="Job family">
                  <Input
                    required
                    value={form.jobFamily}
                    onChange={(e) => update('jobFamily', e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[7rem_minmax(0,1fr)]">
                <Field label="Level">
                  <Input
                    required
                    value={form.level}
                    onChange={(e) => update('level', e.target.value)}
                  />
                </Field>
                <Field label="Employment type">
                  <Select
                    value={form.employmentType}
                    onChange={(e) =>
                      update(
                        'employmentType',
                        e.target.value as 'full_time' | 'part_time' | 'contractor',
                      )
                    }
                    aria-label="Employment type"
                  >
                    <option value="full_time">Full time</option>
                    <option value="part_time">Part time</option>
                    <option value="contractor">Contractor</option>
                  </Select>
                </Field>
              </div>

              <Field label="Hire date">
                <Input
                  required
                  type="date"
                  value={form.hireDate}
                  onChange={(e) => update('hireDate', e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1.4fr)_5.5rem_minmax(0,1fr)]">
                <Field label="Starting pay">
                  <Input
                    required
                    inputMode="decimal"
                    placeholder="120000.00"
                    value={form.amountMajor}
                    onChange={(e) => update('amountMajor', e.target.value)}
                  />
                </Field>
                <Field label="Currency">
                  <Input
                    required
                    maxLength={3}
                    value={form.currency}
                    onChange={(e) => update('currency', e.target.value)}
                  />
                </Field>
                <Field label="Pay frequency">
                  <Select
                    value={form.payFrequency}
                    onChange={(e) =>
                      update('payFrequency', e.target.value as 'annual' | 'monthly')
                    }
                    aria-label="Pay frequency"
                  >
                    <option value="annual">Annual</option>
                    <option value="monthly">Monthly</option>
                  </Select>
                </Field>
              </div>
            </div>

            {error ? (
              <Typography variant="small" className="mt-4 text-red-700">
                {error}
              </Typography>
            ) : null}
          </div>

          <DialogFooter className="shrink-0 border-t border-border px-6 py-4 sm:space-x-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              <Typography variant="button">Cancel</Typography>
            </Button>
            <Button type="submit" disabled={submitting}>
              <Typography variant="button">{submitting ? 'Saving…' : 'Hire'}</Typography>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid min-w-0 content-start gap-1.5', className)}>
      <Label className="block truncate leading-5">{label}</Label>
      {children}
    </div>
  );
}
