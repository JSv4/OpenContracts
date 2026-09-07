/** Accept an application path, never a URL, protocol-relative URL or backslash. */
export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return "/";
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    // OAuth response parameters must not be replayed as a new callback.
    for (const key of ["code", "state", "error", "error_description"])
      url.searchParams.delete(key);
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

/** Remove only this application's legacy Auth0 localStorage credentials. */
export function removeLegacyAuth0Cache(clientId: string): void {
  if (!clientId) return;
  try {
    const prefix = `@@auth0spajs@@::${clientId}::`;
    const manifest = `@@auth0spajs@@::${clientId}`;
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(prefix) || key === manifest)
        window.localStorage.removeItem(key);
    }
  } catch {
    // The SDK can still operate in memory when browser storage is blocked.
  }
}
