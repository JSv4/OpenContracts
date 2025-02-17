import { atom, useAtom } from "jotai";
import { TokenId, BoundingBox } from "../../types";

// Base interface for common properties
interface ChatSourceBase {
  id: string; // messageId.sourceIndex format
  label: string;
  label_id: number;
  annotation_id: number;
}

export interface ChatSourceTokenResult extends ChatSourceBase {
  tokens: Record<number, TokenId[]>;
  bounds: Record<number, BoundingBox>;
  page: number;
}

export interface ChatSourceSpanResult extends ChatSourceBase {
  start_index: number;
  end_index: number;
  text: string;
}

export interface ChatSourceMessage {
  messageId: string;
  content: string;
  timestamp: string;
  sources: (ChatSourceTokenResult | ChatSourceSpanResult)[];
}

export interface ChatSourceState {
  messages: ChatSourceMessage[];
  selectedMessageId: string | null;
}

// Type guard functions
export const isChatSourceTokenResult = (
  source: ChatSourceTokenResult | ChatSourceSpanResult
): source is ChatSourceTokenResult => {
  return "tokens" in source;
};

export const isChatSourceSpanResult = (
  source: ChatSourceTokenResult | ChatSourceSpanResult
): source is ChatSourceSpanResult => {
  return "start_index" in source;
};

// Atom for state management
export const chatSourcesAtom = atom<ChatSourceState>({
  messages: [],
  selectedMessageId: null,
});

// Convenience hook for components
export const useChatSourceState = () => {
  const [state, setState] = useAtom(chatSourcesAtom);
  return {
    messages: state.messages,
    selectedMessageId: state.selectedMessageId,
    setChatSourceState: setState,
  };
};
