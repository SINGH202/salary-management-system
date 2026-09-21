import { useEffect, useState } from 'react';

/**
 * Debounce a primitive or object value. Default delay 400ms.
 * Cleanup on unmount / value change — no shared timers across callers.
 */
export function useDebouncedValue<T>(value: T, delayMs = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
