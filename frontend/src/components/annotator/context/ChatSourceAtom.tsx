import { atom, useAtom } from "jotai";
import {
  TokenId,
  BoundingBox,
  MultipageAnnotationJson,
  SinglePageAnnotationJson,
} from "../../types";
import { WebSocketSources } from "../../knowledge_base/document/right_tray/ChatTray";

/**
 * A single pinned source in a message.
 * - For each page, we store token IDs and bounding boxes.
 * - Adjust or add optional fields (e.g., `text`) as needed for your features.
 */
export interface ChatMessageSource {
  id: string;
  page: number;
  label: string;
  label_id: number;
  annotation_id: number;
  rawText: string;
  tokensByPage: Record<number, TokenId[] | undefined>;
  boundsByPage: Record<number, BoundingBox | undefined>;
}

export interface ChatMessage {
  messageId: string;
  content: string;
  timestamp: string;
  sources: ChatMessageSource[];
}

export interface ChatSourceState {
  messages: ChatMessage[];
  selectedMessageId: string | null;
  selectedSourceIndex: number | null;
}

export const chatSourcesAtom = atom<ChatSourceState>({
  messages: [],
  selectedMessageId: null,
  selectedSourceIndex: null,
});

/**
 * Simple hook for reading/updating chat source state.
 */
export const useChatSourceState = () => {
  const [state, setState] = useAtom(chatSourcesAtom);
  return {
    messages: state.messages,
    selectedMessageId: state.selectedMessageId,
    selectedSourceIndex: state.selectedSourceIndex,
    setChatSourceState: setState,
  };
};

/**
 * Maps incoming WebSocketSources into ChatMessageSource[]
 */
export function mapWebSocketSourcesToChatMessageSources(
  sourcesData: WebSocketSources[] | undefined,
  messageId: string
): ChatMessageSource[] {
  console.log("[mapWebSocketSourcesToChatMessageSources] Input:", {
    sourcesData,
    messageId,
  });

  if (!sourcesData) return [];

  const mappedSources = sourcesData.map((src, index) => {
    console.log(
      `[mapWebSocketSourcesToChatMessageSources] Processing source ${index}:`,
      {
        page: src.page,
        label: src.label,
        json: src.json,
        availablePages: Object.keys(src.json),
      }
    );

    const multiPageObj = src.json as MultipageAnnotationJson;
    const tokensByPage: Record<number, TokenId[]> = {};
    const boundsByPage: Record<number, BoundingBox> = {};

    // Build our per-page tokens/bounds
    for (const [pageKey, pageData] of Object.entries(multiPageObj)) {
      const pageNum = parseInt(pageKey, 10);
      const data = pageData as SinglePageAnnotationJson;

      console.log(
        `[mapWebSocketSourcesToChatMessageSources] Processing page ${pageNum}:`,
        {
          tokensJsons: data.tokensJsons,
          bounds: data.bounds,
          pageKey,
          pageNum,
        }
      );

      // Store the full TokenId objects
      tokensByPage[pageNum] = data.tokensJsons ?? [];

      // Only store bounds if they exist
      if (data.bounds) {
        boundsByPage[pageNum] = data.bounds;
      }
    }

    const result = {
      id: `${messageId}.${index}`,
      page: src.page,
      label: src.label,
      label_id: src.label_id,
      annotation_id: src.annotation_id,
      rawText: Object.values(src.json as MultipageAnnotationJson)
        .map((data) => data.rawText)
        .join(" "),
      tokensByPage,
      boundsByPage,
    };

    console.log(
      `[mapWebSocketSourcesToChatMessageSources] Mapped source ${index}:`,
      {
        ...result,
        availablePages: Object.keys(tokensByPage),
        tokenCounts: Object.entries(tokensByPage).map(
          ([page, tokens]) => `Page ${page}: ${tokens?.length || 0} tokens`
        ),
      }
    );
    return result;
  });

  console.log(
    "[mapWebSocketSourcesToChatMessageSources] Final output:",
    mappedSources
  );
  return mappedSources;
}
