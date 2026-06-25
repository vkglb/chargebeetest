import { useEffect, useState } from "react";

// Returns a debounced copy of `value` that only updates after `delay` ms of no
// changes. Lets search-as-you-type filter (or query) settle instead of firing
// on every keystroke.
export function useDebounce<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
