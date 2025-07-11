/**
 * Environment-variable helper that works in both Vite (import.meta.env)
 * and CRA / Node (process.env). It returns the first defined value for the
 * provided keys.
 */
function getEnvVar(...keys: string[]): string | undefined {
  // Vite style – import.meta.env
  if (typeof import.meta !== "undefined" && (import.meta as any).env) {
    for (const k of keys) {
      const v = (import.meta as any).env[k];
      if (v !== undefined) return v as string;
    }
  }

  // CRA / Node style – process.env (guard for undefined in Vite build)
  if (typeof process !== "undefined" && (process as any).env) {
    for (const k of keys) {
      const v = (process as any).env[k];
      if (v !== undefined) return v as string;
    }
  }

  return undefined;
}

/**
 * Decide the websocket base URL using env vars or window.location.
 */
function resolveWsBaseUrl(): string {
  const envUrl =
    getEnvVar("VITE_WS_URL", "REACT_APP_WS_URL") ||
    getEnvVar("VITE_API_URL", "REACT_APP_API_URL");

  if (envUrl) return envUrl.replace(/\/+$/, "");

  // Fallback – construct from current location
  return `${window.location.protocol === "https:" ? "wss" : "ws"}://${
    window.location.host
  }`;
}

/**
 * Get WebSocket URL for document queries.
 * @param documentId - Document identifier.
 * @param token - Authentication token from the user session.
 * @param conversationId - (Optional) If provided, the conversation id to load from.
 * @returns WebSocket URL with necessary query parameters.
 */
export function getDocumentQueryWebSocket(
  documentId: string,
  token: string,
  conversationId?: string,
  corpusId?: string
): string {
  const wsBaseUrl = resolveWsBaseUrl();

  const normalizedBaseUrl = wsBaseUrl
    .replace(/\/+$/, "")
    .replace(/^http/, "ws")
    .replace(/^https/, "wss");

  let url = `${normalizedBaseUrl}/ws/document/${encodeURIComponent(
    documentId
  )}/query/`;

  if (corpusId) {
    url += `corpus/${encodeURIComponent(corpusId)}/`;
  }

  const params: string[] = [];

  if (conversationId) {
    params.push(
      `load_from_conversation_id=${encodeURIComponent(conversationId)}`
    );
  }

  if (token) {
    params.push(`token=${encodeURIComponent(token)}`);
  }

  if (params.length > 0) {
    url += `?${params.join("&")}`;
  }

  return url;
}

/**
 * Get WebSocket URL for corpus queries.
 * @param corpusId - Corpus identifier.
 * @param token - Authentication token from the user session.
 * @param conversationId - (Optional) If provided, the conversation id to load from.
 * @returns WebSocket URL with necessary query parameters.
 */
export function getCorpusQueryWebSocket(
  corpusId: string,
  token: string,
  conversationId?: string
): string {
  const wsBaseUrl = resolveWsBaseUrl();

  const normalizedBaseUrl = wsBaseUrl
    .replace(/\/+$/, "")
    .replace(/^http/, "ws")
    .replace(/^https/, "wss");

  let url = `${normalizedBaseUrl}/ws/corpus/${encodeURIComponent(
    corpusId
  )}/query/`;

  const params: string[] = [];

  if (conversationId) {
    params.push(
      `load_from_conversation_id=${encodeURIComponent(conversationId)}`
    );
  }

  if (token) {
    params.push(`token=${encodeURIComponent(token)}`);
  }

  if (params.length > 0) {
    url += `?${params.join("&")}`;
  }

  return url;
}
