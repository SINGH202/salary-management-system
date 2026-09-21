/** Format minor units for display (assumes 2 decimal places). */
export function formatMoneyMinor(amountMinor: string, currency: string): string {
  const negative = amountMinor.startsWith('-');
  const digits = negative ? amountMinor.slice(1) : amountMinor;
  if (!/^\d+$/.test(digits)) return `${amountMinor} ${currency}`;
  const padded = digits.padStart(3, '0');
  const whole = padded.slice(0, -2);
  const frac = padded.slice(-2);
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}${withCommas}.${frac} ${currency}`;
}

/**
 * Parse a decimal major-unit string (e.g. "120000.50") into minor-unit integer string.
 * Rejects floats that aren't valid money decimals.
 */
export function majorToMinorString(major: string): string {
  const trimmed = major.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(trimmed)) {
    throw new Error('Enter a valid amount with up to 2 decimal places');
  }
  const negative = trimmed.startsWith('-');
  const [wholeRaw, fracRaw = ''] = (negative ? trimmed.slice(1) : trimmed).split('.');
  const frac = fracRaw.padEnd(2, '0').slice(0, 2);
  const minor = `${BigInt(wholeRaw || '0') * 100n + BigInt(frac)}`;
  return negative ? `-${minor}` : minor;
}
