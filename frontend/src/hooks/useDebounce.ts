import { useEffect, useState } from "react";

/**
 * Returns `value`, but delayed by `delayMs` of quiet — every change resets
 * the timer, so the debounced value only updates once typing (or whatever
 * is driving `value`) pauses. Used to throttle search-as-you-type queries
 * (React Query keys, API calls) so every keystroke doesn't fire a request.
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
