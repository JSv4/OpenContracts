import { makeVar, ReactiveVar } from "@apollo/client";

/**
 * Create a reactive var that mirrors its value to `sessionStorage` so the
 * state survives page refreshes (including Auth0 redirects).
 *
 * This version creates a real ReactiveVar and attaches a listener to it
 * for persistence, ensuring it's compatible with `useReactiveVar`.
 */
export function persistentVar<T>(key: string, defaultValue: T): ReactiveVar<T> {
  const stored = sessionStorage.getItem(key);
  let initial: T = defaultValue;

  if (stored && stored !== "undefined" && stored !== "null") {
    try {
      const parsed = JSON.parse(stored);
      initial = parsed;
    } catch {
      // malformed, ignore and use default
    }
  }

  const rv = makeVar<T>(initial);

  rv.onNextChange((value) => {
    if (value === undefined || value === null) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, JSON.stringify(value));
    }
  });

  return rv;
}
