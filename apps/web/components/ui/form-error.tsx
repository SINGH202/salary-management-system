'use client';

import { useEffect, useRef } from 'react';
import { Typography } from '@/components/typography';
import { cn } from '@/lib/utils';

type Props = {
  message: string | null;
  className?: string;
  /** When true, scroll the banner into view when a message appears. */
  scrollOnShow?: boolean;
};

/** Persistent, high-visibility form error (role=alert). */
export function FormError({ message, className, scrollOnShow = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!message || !scrollOnShow) return;
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [message, scrollOnShow]);

  if (!message) return null;

  return (
    <div
      ref={ref}
      role="alert"
      aria-live="assertive"
      className={cn(
        'rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-red-800',
        className,
      )}
    >
      <Typography variant="small" className="font-medium leading-snug text-red-800">
        {message}
      </Typography>
    </div>
  );
}
