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
  startIndex?: number;
  endIndex?: number;
  isTextBased?: boolean;
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

type TextJson = { start: number; end: number; text?: string };
type PDFJson = MultipageAnnotationJson;

function isTextJson(obj: any): obj is TextJson {
  return typeof obj?.start === "number" && typeof obj?.end === "number";
}

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

    if (isTextJson(src.json)) {
      const { start, end, text = "" } = src.json;
      return {
        id: `${messageId}.${index}`,
        page: src.page ?? 0, // keep or set 0 if there's truly no pages in text docs
        label: src.label,
        label_id: src.label_id,
        annotation_id: src.annotation_id,
        rawText: text,
        tokensByPage: {},
        boundsByPage: {},
        startIndex: start,
        endIndex: end,
        isTextBased: true,
      };
    } else {
      const multiPageObj = src.json as MultipageAnnotationJson;
      const tokensByPage: Record<number, TokenId[]> = {};
      const boundsByPage: Record<number, BoundingBox> = {};

      // Build per-page tokens/bounds
      for (const [pageKey, pageData] of Object.entries(multiPageObj)) {
        // Attempt a numeric parse
        const pageNum = parseInt(pageKey, 10);
        const data = pageData as SinglePageAnnotationJson;

        // Store the token data if any
        tokensByPage[pageNum] = data.tokensJsons ?? [];

        // Store bounding boxes if present
        if (data.bounds) {
          boundsByPage[pageNum] = data.bounds;
        }
      }

      // Combine rawText from all pages
      const combinedRawText = Object.values(multiPageObj)
        .map((data) => data.rawText || "")
        .join(" ");

      return {
        id: `${messageId}.${index}`,
        page: src.page, // keep source's page as is
        label: src.label,
        label_id: src.label_id,
        annotation_id: src.annotation_id,
        rawText: combinedRawText,
        tokensByPage,
        boundsByPage,
        startIndex: undefined,
        endIndex: undefined,
        isTextBased: false,
      };
    }
  });

  console.log(
    "[mapWebSocketSourcesToChatMessageSources] Final output:",
    mappedSources
  );
  return mappedSources;
}
