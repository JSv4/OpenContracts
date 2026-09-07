import { getRuntimeEnv } from "./env";

const KEY = "oc_local_auth_session";
export const LOCAL_AUTH_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// A saved token is only a credential candidate. Never persist/trust a profile
// or permission flags; GET_ME must validate it before authenticated UI renders.
export function clearLocalAuthSession(): void {
  for (const name of ["sessionStorage", "localStorage"] as const) {
    try {
      window[name].removeItem(KEY);
    } catch {
      // Both access to storage and individual operations can be blocked.
    }
  }
}

export function saveLocalAuthSession(token: string): void {
  clearLocalAuthSession();
  if (!token) return;
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({
        token,
        api: getRuntimeEnv().REACT_APP_API_ROOT_URL,
        expiresAt: Date.now() + LOCAL_AUTH_SESSION_TTL_MS,
      })
    );
  } catch {
    // Login still works in memory when storage is unavailable.
  }
}

export function loadLocalAuthSession(): string | null {
  try {
    // Discard the earlier implementation's persistent credentials, rather
    // than silently extending their lifetime or trusting its stored profile.
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // A blocked localStorage must not prevent reading sessionStorage.
    }
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (
      !session ||
      typeof session.token !== "string" ||
      !session.token.trim() ||
      session.api !== getRuntimeEnv().REACT_APP_API_ROOT_URL ||
      !Number.isFinite(session.expiresAt) ||
      session.expiresAt <= Date.now() ||
      session.expiresAt > Date.now() + LOCAL_AUTH_SESSION_TTL_MS
    ) {
      clearLocalAuthSession();
      return null;
    }
    return session.token;
  } catch {
    clearLocalAuthSession();
    return null;
  }
}
