import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/**
 * Native select styled like shadcn/ui (new-york): matching Input chrome,
 * focus ring, and a chevron affordance.
 */
export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className={cn('relative w-full min-w-0', className)}>
      <select
        className={cn(
          'flex h-9 w-full appearance-none rounded-md border border-input bg-background px-3 py-1 pr-9 text-sm shadow-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-70"
      />
    </div>
  ),
);
Select.displayName = 'Select';
