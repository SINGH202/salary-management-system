import * as React from 'react';
import { Search, X } from 'lucide-react';
import { Input, type InputProps } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type SearchInputProps = Omit<InputProps, 'type'> & {
  /** Clears the value when the trailing X is clicked. Omit to hide the clear control. */
  onClear?: () => void;
};

/**
 * Text search field with leading icon (and optional clear), matching shadcn Input chrome.
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, value, onClear, ...props }, ref) => {
    const hasValue =
      value !== undefined &&
      value !== null &&
      !(typeof value === 'string' && value.length === 0) &&
      !(Array.isArray(value) && value.length === 0);

    return (
      <div className={cn('relative', className)}>
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={ref}
          type="search"
          value={value}
          className={cn('pl-9', hasValue && onClear ? 'pr-9' : undefined)}
          {...props}
        />
        {hasValue && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    );
  },
);
SearchInput.displayName = 'SearchInput';
