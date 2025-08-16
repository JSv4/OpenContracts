export /*
 * Get WebSocket URL for document queries.
 * @param documentId - Document identifier.
 * @param token - Optional authentication token from the user session.
 * @param conversationId - (Optional) If provided, the conversation id to load from.
 * @returns WebSocket URL with necessary query parameters.
 */
const getWebSocketUrl = (
  documentId: string,
  token?: string,
  conversationId?: string,
  corpusId?: string
): string => {
  // Use environment variables or fallback to window.location for production
  const wsBaseUrl =
    import.meta.env.VITE_WS_URL ||
    import.meta.env.VITE_API_URL ||
    `${window.location.protocol === "https:" ? "wss" : "ws"}://${
      window.location.host
    }`;

  const normalizedBaseUrl = wsBaseUrl
    .replace(/\/+$/, "")
    .replace(/^http/, "ws")
    .replace(/^https/, "wss");

  let url: string;
  if (corpusId) {
    url = `${normalizedBaseUrl}/ws/document/${encodeURIComponent(
      documentId
    )}/query/corpus/${encodeURIComponent(corpusId)}/`;
  } else {
    url = `${normalizedBaseUrl}/ws/standalone/document/${encodeURIComponent(
      documentId
    )}/query/`;
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
};
