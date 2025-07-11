import { makeVar, ReactiveVar } from "@apollo/client";

/**
 * Create a reactive var that mirrors its value to `sessionStorage` so the
 * state survives page refreshes (including Auth0 redirects).
 *
 * This version creates a real ReactiveVar and attaches a listener to it
 * for persistence, ensuring it's compatible with `useReactiveVar`.
 */
export function persistentVar<T>(key: string, defaultValue: T): ReactiveVar<T> {
  // Safely access sessionStorage only when running in a browser environment.
  const storage: Storage | null =
    typeof window !== "undefined" && window.sessionStorage
      ? window.sessionStorage
      : null;

  const stored = storage?.getItem(key) ?? null;
  let initial: T = defaultValue;

  if (stored && stored !== "undefined" && stored !== "null") {
    try {
      const parsed = JSON.parse(stored);
      initial = parsed;
    } catch {
      // Malformed JSON or other error – ignore and fall back to default.
    }
  }

  const rv = makeVar<T>(initial);

  rv.onNextChange((value) => {
    if (!storage) return; // No persistence available in this environment.

    if (value === undefined || value === null) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, JSON.stringify(value));
    }
  });

  return rv;
}
