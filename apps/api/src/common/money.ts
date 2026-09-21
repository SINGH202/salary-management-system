/**
 * Money is integer minor units only. FX *rates* are floats by design and live outside
 * this module — convertTo accepts a rate parameter but never stores money as float.
 */

export type PayFrequency = 'annual' | 'monthly';

export class CurrencyMismatchError extends Error {
  constructor(left: string, right: string) {
    super(`Cannot operate on mismatched currencies: ${left} vs ${right}`);
    this.name = 'CurrencyMismatchError';
  }
}

export class Money {
  constructor(
    readonly amountMinor: bigint,
    readonly currency: string,
  ) {
    if (!currency || currency.length !== 3) {
      throw new Error(`currency must be a 3-letter ISO code, got: ${currency}`);
    }
  }

  static fromContractString(amountMinor: string, currency: string): Money {
    if (!/^-?\d+$/.test(amountMinor)) {
      throw new Error(`invalid money minor string: ${amountMinor}`);
    }
    return new Money(BigInt(amountMinor), currency);
  }

  toContractString(): string {
    return this.amountMinor.toString();
  }

  plus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amountMinor + other.amountMinor, this.currency);
  }

  /** `percent` is a whole-number percent, e.g. 7 for 7%. */
  percentOf(percent: bigint): Money {
    return new Money((this.amountMinor * percent) / 100n, this.currency);
  }

  /**
   * Convert using an FX rate (units of target per 1 unit of this currency, or
   * equivalently multiply minor units by rate). Result is rounded to nearest minor unit.
   */
  convertTo(rate: number, targetCurrency: string): Money {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error(`FX rate must be a positive finite number, got: ${rate}`);
    }
    const converted = BigInt(Math.round(Number(this.amountMinor) * rate));
    return new Money(converted, targetCurrency);
  }

  format(): string {
    const sign = this.amountMinor < 0n ? '-' : '';
    const abs = this.amountMinor < 0n ? -this.amountMinor : this.amountMinor;
    const whole = abs / 100n;
    const fraction = (abs % 100n).toString().padStart(2, '0');
    return `${sign}${whole}.${fraction} ${this.currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }
}

/** Sole place in the codebase allowed to multiply money by 12 for annualization. */
export function annualize(minor: bigint, payFrequency: PayFrequency | string): bigint {
  if (payFrequency === 'monthly') {
    return minor * 12n;
  }
  if (payFrequency === 'annual') {
    return minor;
  }
  throw new Error(`unknown payFrequency: ${payFrequency}`);
}
