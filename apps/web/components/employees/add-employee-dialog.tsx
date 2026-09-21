'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Typography } from '@/components/typography';
import { ApiError, createEmployee, type EmployeeCreateBody } from '@/lib/employees-api';
import { todayLocalDateInput } from '@/lib/date-format';
import { majorToMinorString } from '@/lib/money-format';

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

  if (!open) return null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/40 p-4 pt-16">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-employee-title"
        className="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
      >
        <Typography variant="h2" id="add-employee-title" className="mb-4">
          Add employee
        </Typography>
        <form className="grid gap-3" onSubmit={onSubmit}>
          <Field label="Employee code">
            <Input
              required
              value={form.employeeCode}
              onChange={(e) => update('employeeCode', e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Country (ISO)">
              <Input
                required
                maxLength={2}
                value={form.countryCode}
                onChange={(e) => update('countryCode', e.target.value)}
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
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Level">
              <Input required value={form.level} onChange={(e) => update('level', e.target.value)} />
            </Field>
            <Field label="Employment type">
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.employmentType}
                onChange={(e) =>
                  update(
                    'employmentType',
                    e.target.value as 'full_time' | 'part_time' | 'contractor',
                  )
                }
              >
                <option value="full_time">Full time</option>
                <option value="part_time">Part time</option>
                <option value="contractor">Contractor</option>
              </select>
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
          <div className="grid grid-cols-3 gap-3">
            <Field label="Starting pay (major)">
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
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.payFrequency}
                onChange={(e) =>
                  update('payFrequency', e.target.value as 'annual' | 'monthly')
                }
              >
                <option value="annual">Annual</option>
                <option value="monthly">Monthly</option>
              </select>
            </Field>
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
              <Typography variant="button">{submitting ? 'Saving…' : 'Hire'}</Typography>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
