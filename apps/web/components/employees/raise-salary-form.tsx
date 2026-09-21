'use client';

import { useState, type FormEvent } from 'react';
import { Typography } from '@/components/typography';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { todayLocalDateInput } from '@/lib/date-format';
import {
  ApiError,
  recordSalaryChange,
} from '@/lib/employees-api';
import { majorToMinorString } from '@/lib/money-format';

type Props = {
  employeeId: string;
  defaultCurrency: string;
  defaultPayFrequency: 'annual' | 'monthly';
  onSuccess: () => void;
};

export function RaiseSalaryForm({
  employeeId,
  defaultCurrency,
  defaultPayFrequency,
  onSuccess,
}: Props) {
  const [amountMajor, setAmountMajor] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [payFrequency, setPayFrequency] = useState(defaultPayFrequency);
  const [effectiveFrom, setEffectiveFrom] = useState(todayLocalDateInput);
  const [changeReason, setChangeReason] = useState<
    'promotion' | 'merit' | 'market_adjustment' | 'correction'
  >('merit');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const amountMinor = majorToMinorString(amountMajor);
      await recordSalaryChange(employeeId, {
        amountMinor,
        currency: currency.trim().toUpperCase(),
        payFrequency,
        effectiveFrom: new Date(`${effectiveFrom}T00:00:00.000Z`).toISOString(),
        changeReason,
        note: note.trim() || undefined,
      });
      setAmountMajor('');
      setNote('');
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : 'Raise failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
      <div className="grid gap-1.5">
        <Label>New amount (major units)</Label>
        <Input
          required
          inputMode="decimal"
          placeholder="130000.00"
          value={amountMajor}
          onChange={(e) => setAmountMajor(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Currency</Label>
          <Input
            required
            maxLength={3}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Pay frequency</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={payFrequency}
            onChange={(e) => setPayFrequency(e.target.value as 'annual' | 'monthly')}
          >
            <option value="annual">Annual</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label>Effective from</Label>
          <Input
            required
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Reason</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={changeReason}
            onChange={(e) =>
              setChangeReason(
                e.target.value as 'promotion' | 'merit' | 'market_adjustment' | 'correction',
              )
            }
          >
            <option value="merit">Merit</option>
            <option value="promotion">Promotion</option>
            <option value="market_adjustment">Market adjustment</option>
            <option value="correction">Correction</option>
          </select>
        </div>
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
      <Button type="submit" disabled={submitting}>
        <Typography variant="button">{submitting ? 'Saving…' : 'Save raise'}</Typography>
      </Button>
    </form>
  );
}
