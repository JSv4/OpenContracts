/**
 * CorpusChat Component - Similar to ChatTray, but for corpuses.
 *
 * This component connects to our WebSocket backend IF the user is logged in
 * and we have a valid auth token in the Apollo reactive vars.
 * It will:
 *   1) Load existing corpus-specific conversation data from a GraphQL query (GET_CORPUS_CONVERSATIONS).
 *   2) If authenticated, open a WebSocket to stream new messages with partial updates
 *      (ASYNC_START, ASYNC_CONTENT, ASYNC_FINISH) or synchronous messages (SYNC_CONTENT).
 *   3) Display those messages in real time, appending them to the chat.
 *   4) Allow sending user queries through the socket.
 */

import React, {
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLazyQuery, useQuery, useReactiveVar } from "@apollo/client";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Plus,
  Search,
  Send,
  X,
  Home,
} from "lucide-react";
import { Button } from "semantic-ui-react";
import styled from "styled-components";

import {
  // Provide or import the actual corpus conversation queries & types.
  GET_CORPUS_CONVERSATIONS,
  GetCorpusConversationsInputs,
  GetCorpusConversationsOutputs,
  GET_CORPUS_CHAT_MESSAGES,
  GetCorpusChatMessagesInputs,
  GetCorpusChatMessagesOutputs,
} from "../../graphql/queries";

import {
  ErrorContainer,
  ConversationGrid,
  ConversationCard,
  CardContent,
  CardTitle,
  CardMeta,
  TimeStamp,
  Creator,
  ChatInputContainer,
  ChatInput,
  SendButton,
  ErrorMessage,
  ConnectionStatus,
  NewChatFloatingButton,
  BackButton,
  FilterContainer,
} from "../knowledge_base/document/ChatContainers";

import { authToken, userObj, showQueryViewState } from "../../graphql/cache";
import {
  DatePickerExpanded,
  ExpandingInput,
  IconButton,
} from "../knowledge_base/document/FilterContainers";
import {
  useChatSourceState,
  mapWebSocketSourcesToChatMessageSources,
} from "../annotator/context/ChatSourceAtom";
import { MultipageAnnotationJson } from "../types";
import { FetchMoreOnVisible } from "../widgets/infinite_scroll/FetchMoreOnVisible";
import { ChatMessage, ChatMessageProps } from "../widgets/chat/ChatMessage";
import { getCorpusQueryWebSocket } from "../chat/get_websockets";
import { MOBILE_VIEW_BREAKPOINT } from "../../assets/configurations/constants";
import { TruncatedText } from "../widgets/data-display/TruncatedText";

/**
 * A helper interface representing the properties of data included in websocket messages,
 * specifically any source annotations or label metadata.
 */
interface WebSocketSources {
  page: number;
  json: { start: number; end: number } | MultipageAnnotationJson;
  annotation_id: number;
  label: string;
  label_id: number;
  rawText: string;
}

/**
 * An interface for the full websocket message structure.
 * Includes the type of content (async start, streaming content, final, etc.),
 * the actual text content, and optional annotation data.
 */
interface MessageData {
  type: "ASYNC_START" | "ASYNC_CONTENT" | "ASYNC_FINISH" | "SYNC_CONTENT";
  content: string;
  data?: {
    sources?: WebSocketSources[];
    message_id?: string;
  };
}

/**
 * CorpusChat props definition.
 */
interface CorpusChatProps {
  corpusId: string;
  showLoad: boolean;
  setShowLoad: (show: boolean) => void;
  onMessageSelect: (messageId: string) => void;
  initialQuery?: string;
  forceNewChat?: boolean;
}

// Add these styled components near your other styled components
const ConversationHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 10;

  h2 {
    font-size: 1.5rem;
    font-weight: 600;
    color: #1a202c;
    margin: 0;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
  }

  @media (max-width: 768px) {
    padding: 1rem;

    h2 {
      font-size: 1.25rem;
    }

    .actions button {
      padding: 0.5rem 0.75rem !important;
      font-size: 0.85rem !important;
    }
  }
`;

const EnhancedConversationGrid = styled(ConversationGrid)`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.25rem;
  padding: 1.5rem;
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    padding: 1rem;
  }
`;

const EnhancedConversationCard = styled(ConversationCard)`
  display: flex;
  flex-direction: column;
  height: 180px;
  padding: 1.5rem;
  border-radius: 12px;
  background: white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;

  &:hover {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    transform: translateY(-4px);
  }

  &:before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 4px;
    background: linear-gradient(90deg, #4299e1, #2b6cb0);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  &:hover:before {
    opacity: 1;
  }
`;

const MessageCount = styled(motion.div)`
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.9rem;
`;

const EnhancedCardContent = styled(CardContent)`
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: space-between;
`;

const EnhancedCardTitle = styled(CardTitle)`
  font-size: 1.1rem;
  font-weight: 600;
  color: #1a202c;
  margin-bottom: 0.75rem;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const EnhancedCardMeta = styled(CardMeta)`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
  padding-top: 1rem;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
`;

const EnhancedFilterContainer = styled(FilterContainer)`
  margin: 0 1.5rem 1rem;
  padding: 0.75rem 1rem;
  background: rgba(247, 250, 252, 0.8);
  border-radius: 8px;
  border: 1px solid rgba(0, 0, 0, 0.06);
`;

const EmptyStateContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;

  h3 {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 1rem;
    color: #2d3748;
  }

  p {
    color: #718096;
    max-width: 500px;
    margin-bottom: 2rem;
  }
`;

// Add a new styled component for the navigation buttons
const NavigationButton = styled(Button)`
  background: transparent !important;
  padding: 0.5rem !important;
  display: flex !important;
  align-items: center !important;
  gap: 0.5rem !important;
  color: #4a5568 !important;
  font-weight: 500 !important;

  &:hover {
    background: rgba(0, 0, 0, 0.03) !important;
  }

  @media (max-width: 768px) {
    font-size: 0.85rem !important;

    svg {
      width: 14px !important;
      height: 14px !important;
    }
  }
`;

// Update the ChatContainer styled component
const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: white;
  position: relative;
  margin: 0;
  padding: 0;
  border-radius: 0;

  @media (max-width: ${MOBILE_VIEW_BREAKPOINT}px) {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
  }
`;

const ConversationIndicator = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  position: relative;
`;

// Enhance the ChatInputContainer for better mobile experience
const EnhancedChatInputContainer = styled(ChatInputContainer)`
  @media (max-width: ${MOBILE_VIEW_BREAKPOINT}px) {
    padding: 0.75rem 1rem;
    gap: 0.5rem;
  }
`;

// Enhance the chat messages area for mobile
const MessagesArea = styled.div`
  flex: 1 1 auto;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1rem;
  padding-bottom: 80px;

  @media (max-width: ${MOBILE_VIEW_BREAKPOINT}px) {
    padding: 0.75rem;
    padding-bottom: 70px;
  }
`;

// Compact header for mobile
// const ChatHeader = styled(motion.div)`
//   padding: 0.75rem 1.25rem;
//   border-bottom: 1px solid rgba(0,0,0,0.08);
//   background: rgba(255,255,255,0.98);
//   backdrop-filter: blur(8px);
//   z-index: 2;
//   position: sticky;
//   top: 0;
//   display: flex;
//   align-items: center;
//   justify-content: space-between;
//
//   @media (max-width: ${MOBILE_VIEW_BREAKPOINT}px) {
//     padding: 0.5rem 0.75rem;
//   }
// `;

// Enhance the chat input for better mobile experience
const EnhancedChatInput = styled(ChatInput)`
  @media (max-width: ${MOBILE_VIEW_BREAKPOINT}px) {
    font-size: 0.9rem;
    padding: 0.5rem 0.75rem;
  }
`;

// Update the TopNavHeader to include title
const TopNavHeader = styled(motion.div)`
  width: 100%;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(8px);
  z-index: 10;
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;

  @media (max-width: ${MOBILE_VIEW_BREAKPOINT}px) {
    padding: 0.5rem 0.75rem;
    flex-direction: row;
  }
`;

const HeaderTitle = styled.div`
  font-size: 1.1rem;
  font-weight: 600;
  color: #1a202c;
  flex: 1;
  text-align: center;
  margin: 0 0.5rem;

  @media (max-width: ${MOBILE_VIEW_BREAKPOINT}px) {
    font-size: 0.95rem;
  }
`;

/**
 * CorpusChat component provides:
 * 1) Initial user selection of either creating a new conversation or loading an existing one,
 *    with infinite scrolling for loading conversations in pages.
 * 2) Upon conversation selection, it establishes a websocket connection (using the corpus route)
 *    and renders the chat UI (including message list, chat input, connection status, or errors).
 *
 * It merges the older chat input and websocket logic with a new UI for listing or creating
 * corpus-based conversations, including streaming partial responses.
 */
export const CorpusChat: React.FC<CorpusChatProps> = ({
  corpusId,
  showLoad,
  setShowLoad,
  onMessageSelect,
  initialQuery,
  forceNewChat = false,
}) => {
  // Chat state
  const [isNewChat, setIsNewChat] = useState(forceNewChat);
  const [newMessage, setNewMessage] = useState("");
  const [chat, setChat] = useState<ChatMessageProps[]>([]);
  const [wsReady, setWsReady] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);

  const [selectedConversationId, setSelectedConversationId] = useState<
    string | undefined
  >();

  // For messages from server (via the new GET_CORPUS_CHAT_MESSAGES query)
  const [serverMessages, setServerMessages] = useState<ChatMessageProps[]>([]);

  // handle pinned sources via chatSourcesAtom
  const {
    messages: sourcedMessages,
    selectedMessageId,
    setChatSourceState,
  } = useChatSourceState();

  // GraphQL & user state
  const user_obj = useReactiveVar(userObj);
  const auth_token = useReactiveVar(authToken);

  // WebSocket reference
  const socketRef = useRef<WebSocket | null>(null);
  const sendingLockRef = useRef<boolean>(false);

  // State for the search filter
  const [titleFilter, setTitleFilter] = useState<string>("");
  const [debouncedTitle, setDebouncedTitle] = useState<string>("");
  const [createdAtGte, setCreatedAtGte] = useState<string>("");
  const [createdAtLte, setCreatedAtLte] = useState<string>("");

  // For dynamic display of filters
  const [showSearch, setShowSearch] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);

  // Query for listing CORPUS conversations
  const {
    data,
    loading,
    error,
    fetchMore,
    refetch: refetchConversations,
  } = useQuery<GetCorpusConversationsOutputs, GetCorpusConversationsInputs>(
    GET_CORPUS_CONVERSATIONS,
    {
      variables: {
        corpusId,
        title_Contains: debouncedTitle || undefined,
        createdAt_Gte: createdAtGte || undefined,
        createdAt_Lte: createdAtLte || undefined,
      },
      fetchPolicy: "network-only",
    }
  );

  // Lazy query for loading messages of a specific conversation
  const [
    fetchChatMessages,
    { data: msgData, loading: loadingMessages, fetchMore: fetchMoreMessages },
  ] = useLazyQuery<GetCorpusChatMessagesOutputs, GetCorpusChatMessagesInputs>(
    GET_CORPUS_CHAT_MESSAGES
  );

  // messages container ref for scrolling
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  /**
   * On server data load, map messages to local ChatMessageProps and store any 'sources' in chatSourcesAtom.
   */
  useEffect(() => {
    if (!msgData?.chatMessages?.edges) return;
    const messages = msgData.chatMessages.edges.map((edge) => edge.node);

    messages.forEach((srvMsg) => {
      if (srvMsg.data?.sources?.length) {
        handleCompleteMessage(
          srvMsg.content,
          srvMsg.data.sources,
          srvMsg.id,
          srvMsg.createdAt
        );
      }
    });

    const mapped = messages.map((msg) => ({
      messageId: msg.id,
      user: msg.msgType === "HUMAN" ? "You" : "Assistant",
      content: msg.content,
      timestamp: new Date(msg.createdAt).toLocaleString(),
      isAssistant: msg.msgType !== "HUMAN",
      hasSources: !!msg.data?.sources?.length,
    }));
    setServerMessages(mapped);
  }, [msgData]);

  // Debounce the title filter input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTitle(titleFilter);
    }, 500);
    return () => clearTimeout(timer);
  }, [titleFilter]);

  // Hide search or date picker if user clicks outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowSearch(false);
      }
      if (
        datePickerRef.current &&
        !datePickerRef.current.contains(event.target as Node)
      ) {
        setShowDatePicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Combine serverMessages + local chat for final display
  const combinedMessages = [...serverMessages, ...chat];

  // Scroll to bottom helper
  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [combinedMessages, scrollToBottom]);

  /**
   * (Re)Establish the WebSocket connection if a conversation is selected (or if isNewChat),
   * otherwise close any existing socket.
   */
  useEffect(() => {
    if (!auth_token || (!selectedConversationId && !isNewChat)) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setWsReady(false);
      return;
    }

    const wsUrl = getCorpusQueryWebSocket(corpusId, auth_token);
    const newSocket = new WebSocket(wsUrl);

    newSocket.onopen = () => {
      setWsReady(true);
      setWsError(null);
      console.log(
        "WebSocket connected for corpus conversation:",
        selectedConversationId
      );
    };

    newSocket.onerror = (event) => {
      setWsReady(false);
      setWsError("Error connecting to the corpus WebSocket.");
      console.error("WebSocket error:", event);
    };

    newSocket.onmessage = (event) => {
      try {
        const messageData: MessageData = JSON.parse(event.data);
        if (!messageData) return;
        const { type: msgType, content, data } = messageData;

        console.log("[CorpusChat WebSocket] Received message:", {
          type: msgType,
          contentLength: content.length,
          hasSources: !!data?.sources?.length,
          message_id: data?.message_id,
        });

        switch (msgType) {
          case "ASYNC_START":
          case "ASYNC_CONTENT":
            appendStreamingTokenToChat(content, data?.message_id);
            break;
          case "ASYNC_FINISH":
            finalizeStreamingResponse(content, data?.sources, data?.message_id);
            break;
          case "SYNC_CONTENT":
            handleCompleteMessage(content, data?.sources, data?.message_id);
            break;
          default:
            console.warn("Unknown message type:", msgType);
            break;
        }
      } catch (err) {
        console.error("Failed to parse WS message:", err);
      }
    };

    newSocket.onclose = (event) => {
      setWsReady(false);
      console.warn("WebSocket closed:", event);
    };

    socketRef.current = newSocket;

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [auth_token, corpusId, selectedConversationId, isNewChat]);

  // Force new chat mode when forceNewChat prop changes
  useEffect(() => {
    if (forceNewChat) {
      startNewChat();
    }
  }, [forceNewChat]);

  // Modify the effect that sends the initial query
  useEffect(() => {
    // Only send the initial query if we have one, the WS is ready, and we're in new conversation mode.
    if (initialQuery && wsReady && isNewChat) {
      const timer = setTimeout(() => {
        if (socketRef.current && wsReady) {
          // Simply send the initial query over websocket (without adding it to chat)
          socketRef.current.send(JSON.stringify({ query: initialQuery }));
          setNewMessage("");
          setWsError(null);
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [initialQuery, wsReady, isNewChat]);

  /**
   * Loads existing conversation by ID, clearing local state, then showing chat UI.
   * @param conversationId The ID of the chosen conversation
   */
  const loadConversation = (conversationId: string): void => {
    setSelectedConversationId(conversationId);
    setIsNewChat(false);
    setShowLoad(false);
    setChat([]);
    setServerMessages([]);

    fetchChatMessages({
      variables: {
        conversationId,
        limit: 10,
      },
      fetchPolicy: "network-only",
    });
  };

  /**
   * Exits the current conversation and resets chat state.
   */
  const exitConversation = (): void => {
    setIsNewChat(false);
    setShowLoad(false);
    setNewMessage("");
    setChat([]);
    setServerMessages([]);
    setSelectedConversationId(undefined);
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    refetchConversations();
  };

  /**
   * Start a brand-new chat (unselect existing conversation).
   */
  const startNewChat = useCallback((): void => {
    setIsNewChat(true);
    setSelectedConversationId(undefined);
    setShowLoad(false);
    setChat([]);
    setServerMessages([]);
  }, [setShowLoad]);

  /**
   * Infinite scroll trigger for more conversation summary cards.
   */
  const handleFetchMoreConversations = useCallback(() => {
    if (
      !loading &&
      data?.conversations?.pageInfo?.hasNextPage &&
      typeof fetchMore === "function"
    ) {
      fetchMore({
        variables: {
          corpusId,
          limit: 5,
          cursor: data.conversations.pageInfo.endCursor,
        },
      }).catch((err: any) => {
        console.error("Failed to fetch more corpus conversations:", err);
      });
    }
  }, [loading, data, fetchMore, corpusId]);

  /**
   * Send the typed message over the WebSocket to the assistant, and add it locally.
   */
  const sendMessageOverSocket = useCallback((): void => {
    const trimmed = newMessage.trim();
    if (!trimmed || !socketRef.current) return;
    if (!wsReady) {
      console.warn("WebSocket not ready yet");
      return;
    }

    if (sendingLockRef.current) {
      console.warn("Message is already being sent, ignoring duplicate send.");
      return;
    }

    sendingLockRef.current = true;

    try {
      setChat((prev) => [
        ...prev,
        {
          user: user_obj?.email || "You",
          content: trimmed,
          timestamp: new Date().toLocaleString(),
          isAssistant: false,
        },
      ]);
      socketRef.current.send(JSON.stringify({ query: trimmed }));
      setNewMessage("");
      setWsError(null);
    } catch (err) {
      console.error("Failed to send message:", err);
      setWsError("Failed to send message. Please try again.");
    } finally {
      setTimeout(() => {
        sendingLockRef.current = false;
      }, 300);
    }
  }, [newMessage, user_obj?.email, wsReady]);

  // Conversion of GQL data to a local list
  const conversations = useMemo(() => {
    return data?.conversations?.edges?.map((edge) => edge?.node) || [];
  }, [data]);

  // Quick stats
  const calculateMessageStats = (conversations: any[]) => {
    const counts = conversations.map(
      (conv) => conv?.chatMessages?.totalCount || 0
    );
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    const sum = counts.reduce((a, b) => a + b, 0);
    const mean = sum / (counts.length || 1);

    const variance =
      counts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
      (counts.length || 1);
    const stdDev = Math.sqrt(variance);

    return { max, min, mean, stdDev };
  };

  const getMessageCountColor = (
    count: number,
    stats: { max: number; min: number; mean: number; stdDev: number }
  ) => {
    if (count === 0) {
      return {
        background: "linear-gradient(135deg, #EDF2F7 0%, #E2E8F0 100%)",
        opacity: 0.9,
        textColor: "#4A5568",
      };
    }

    const zScore = (count - stats.mean) / (stats.stdDev || 1);
    const intensity = 1 / (1 + Math.exp(-zScore));

    return {
      background: `linear-gradient(135deg, 
          rgba(43, 108, 176, ${0.7 + intensity * 0.3}) 0%, 
          rgba(44, 82, 130, ${0.8 + intensity * 0.2}) 100%)`,
      opacity: 0.8 + intensity * 0.2,
      textColor: intensity > 0.3 ? "white" : "#1A202C",
    };
  };

  function appendStreamingTokenToChat(
    token: string,
    overrideMessageId?: string
  ): string {
    if (!token) return "";
    let messageId = "";

    setChat((prev) => {
      const lastMessage = prev[prev.length - 1];

      // If we were streaming the assistant's last message, just append
      if (lastMessage && lastMessage.isAssistant) {
        messageId = lastMessage.messageId || "";
        const updatedLast = {
          ...lastMessage,
          content: lastMessage.content + token,
        };
        return [...prev.slice(0, -1), updatedLast];
      } else {
        messageId =
          overrideMessageId ||
          `msg_${Date.now()}_${Math.random().toString(36).substr(2)}`;
        return [
          ...prev,
          {
            messageId,
            user: "Assistant",
            content: token,
            timestamp: new Date().toLocaleString(),
            isAssistant: true,
          },
        ];
      }
    });
    return messageId;
  }

  /**
   * Finalize a partially-streamed response by replacing the last chat entry
   * with the final content (and calling handleCompleteMessage to store sources).
   */
  const finalizeStreamingResponse = (
    content: string,
    sourcesData?: WebSocketSources[],
    overrideId?: string
  ) => {
    let lastMsgId: string | undefined;
    setChat((prev) => {
      if (!prev.length) return prev;
      const lastIndex = [...prev].reverse().findIndex((msg) => msg.isAssistant);
      if (lastIndex === -1) return prev;

      // forward index
      const forwardIndex = prev.length - 1 - lastIndex;
      const updatedMessages = [...prev];
      const assistantMsg = updatedMessages[forwardIndex];
      lastMsgId = assistantMsg.messageId;

      updatedMessages[forwardIndex] = {
        ...assistantMsg,
        content,
      };

      handleCompleteMessage(content, sourcesData, lastMsgId, overrideId);
      return updatedMessages;
    });
  };

  /**
   * Store final content + sources in ChatSourceAtom using a consistent messageId
   */
  const handleCompleteMessage = (
    content: string,
    sourcesData?: Array<WebSocketSources>,
    overrideId?: string,
    overrideCreatedAt?: string
  ): void => {
    if (!overrideId) {
      console.warn(
        "handleCompleteMessage called without an overrideId - sources may not display correctly"
      );
    }
    const messageId = overrideId ?? `msg_${Date.now()}`;
    const messageTimestamp = overrideCreatedAt
      ? new Date(overrideCreatedAt).toISOString()
      : new Date().toISOString();

    const mappedSources = mapWebSocketSourcesToChatMessageSources(
      sourcesData,
      messageId
    );

    setChatSourceState((prev) => {
      const existingIndex = prev.messages.findIndex(
        (m) => m.messageId === messageId
      );
      if (existingIndex !== -1) {
        const existingMsg = prev.messages[existingIndex];
        const updatedMsg = {
          ...existingMsg,
          content,
          timestamp: messageTimestamp,
          sources: mappedSources.length ? mappedSources : existingMsg.sources,
        };
        const updatedMessages = [...prev.messages];
        updatedMessages[existingIndex] = updatedMsg;
        return {
          ...prev,
          messages: updatedMessages,
        };
      } else {
        return {
          ...prev,
          messages: [
            ...prev.messages,
            {
              messageId,
              content,
              timestamp: messageTimestamp,
              sources: mappedSources,
            },
          ],
          selectedMessageId: overrideId ? prev.selectedMessageId : messageId,
        };
      }
    });
  };

  /**
   * Determine current "view" to simplify back button logic
   */
  const isConversation = isNewChat || !!selectedConversationId;

  // If the GraphQL query fails entirely:
  if (error) {
    return (
      <ErrorContainer initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <AlertCircle size={24} />
        Failed to load corpus conversations
      </ErrorContainer>
    );
  }

  return (
    <ChatContainer id="corpus-chat-container">
      <ConversationIndicator id="conversation-indicator">
        {/* We always show the top navigation in every state */}

        <AnimatePresence>
          {isConversation ? (
            // CONVERSATION VIEW
            <motion.div
              key="conversation"
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                width: "100%",
                position: "relative",
                overflow: "hidden",
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {/* Scrollable Messages */}
              <MessagesArea
                className="chat-messages-area"
                ref={messagesContainerRef}
              >
                {combinedMessages.map((msg, idx) => {
                  const sourcedMessage = sourcedMessages.find(
                    (m) => m.messageId === msg.messageId
                  );

                  const sources =
                    sourcedMessage?.sources.map((source, index) => ({
                      text: source.rawText || `Source ${index + 1}`,
                      onClick: () => {
                        setChatSourceState((prev) => ({
                          ...prev,
                          selectedMessageId: sourcedMessage.messageId,
                          selectedSourceIndex: index,
                        }));
                        if (sourcedMessage.sources.length > 0) {
                          onMessageSelect?.(sourcedMessage.messageId);
                        }
                      },
                    })) || [];

                  return (
                    <ChatMessage
                      key={msg.messageId || idx}
                      {...msg}
                      hasSources={!!sourcedMessage?.sources.length}
                      sources={sources}
                      isSelected={
                        sourcedMessage?.messageId === selectedMessageId
                      }
                      onSelect={() => {
                        if (sourcedMessage) {
                          setChatSourceState((prev) => ({
                            ...prev,
                            selectedMessageId:
                              prev.selectedMessageId ===
                              sourcedMessage.messageId
                                ? null
                                : sourcedMessage.messageId,
                            selectedSourceIndex: null,
                          }));
                          if (sourcedMessage.sources.length > 0) {
                            onMessageSelect?.(sourcedMessage.messageId);
                          }
                        }
                      }}
                    />
                  );
                })}
              </MessagesArea>

              {/* Input */}
              <div
                className="chat-input-area"
                style={{
                  position: "sticky",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: "rgba(255, 255, 255, 0.95)",
                  backdropFilter: "blur(10px)",
                  borderTop: "1px solid rgba(0, 0, 0, 0.1)",
                  zIndex: 3,
                  paddingBottom: `@media (max-width: ${MOBILE_VIEW_BREAKPOINT}px) { 0 }`,
                }}
              >
                <EnhancedChatInputContainer $isTyping={isNewChat}>
                  {wsError ? (
                    <ErrorMessage>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: "spring", damping: 20 }}
                      >
                        {wsError}
                        <Button
                          size="small"
                          onClick={() => window.location.reload()}
                          style={{
                            marginLeft: "0.75rem",
                            background: "#dc3545",
                            color: "white",
                            border: "none",
                            boxShadow: "0 2px 4px rgba(220,53,69,0.2)",
                          }}
                        >
                          Reconnect
                        </Button>
                      </motion.div>
                    </ErrorMessage>
                  ) : (
                    <ConnectionStatus
                      connected={wsReady}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                    />
                  )}
                  <EnhancedChatInput
                    value={newMessage}
                    onChange={(e: {
                      target: { value: SetStateAction<string> };
                    }) => setNewMessage(e.target.value)}
                    placeholder={
                      wsReady
                        ? "Type your corpus query..."
                        : "Waiting for connection..."
                    }
                    disabled={!wsReady}
                    onKeyPress={(e: { key: string }) => {
                      if (e.key === "Enter") {
                        sendMessageOverSocket();
                      }
                    }}
                  />
                  <SendButton
                    disabled={!wsReady || !newMessage.trim()}
                    onClick={sendMessageOverSocket}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    animate={wsReady ? { y: [0, -2, 0] } : {}}
                    transition={{ duration: 0.2 }}
                  >
                    <Send size={18} />
                  </SendButton>
                </EnhancedChatInputContainer>
              </div>
            </motion.div>
          ) : (
            // CONVERSATION MENU VIEW
            <motion.div
              key="conversation-menu"
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <EnhancedFilterContainer>
                <AnimatePresence>
                  {showSearch && (
                    <ExpandingInput
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "auto", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      ref={searchInputRef}
                    >
                      <input
                        className="expanded"
                        placeholder="Search by title..."
                        value={titleFilter}
                        onChange={(e) => setTitleFilter(e.target.value)}
                        autoFocus
                      />
                    </ExpandingInput>
                  )}
                </AnimatePresence>

                <IconButton
                  onClick={() => setShowSearch(!showSearch)}
                  $isActive={!!titleFilter}
                  whileTap={{ scale: 0.95 }}
                >
                  <Search />
                </IconButton>

                <IconButton
                  onClick={() => setShowDatePicker(!showDatePicker)}
                  $isActive={!!(createdAtGte || createdAtLte)}
                  whileTap={{ scale: 0.95 }}
                >
                  <Calendar />
                </IconButton>

                <IconButton
                  onClick={() => showQueryViewState("ASK")}
                  title="Return to Dashboard"
                  whileTap={{ scale: 0.95 }}
                >
                  <Home />
                </IconButton>

                <AnimatePresence>
                  {showDatePicker && (
                    <DatePickerExpanded
                      ref={datePickerRef}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      <input
                        type="date"
                        value={createdAtGte}
                        onChange={(e) => setCreatedAtGte(e.target.value)}
                        placeholder="Start Date"
                      />
                      <input
                        type="date"
                        value={createdAtLte}
                        onChange={(e) => setCreatedAtLte(e.target.value)}
                        placeholder="End Date"
                      />
                    </DatePickerExpanded>
                  )}
                </AnimatePresence>

                {(titleFilter || createdAtGte || createdAtLte) && (
                  <IconButton
                    onClick={() => {
                      setTitleFilter("");
                      setCreatedAtGte("");
                      setCreatedAtLte("");
                      setShowSearch(false);
                      setShowDatePicker(false);
                    }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <X />
                  </IconButton>
                )}
              </EnhancedFilterContainer>

              {conversations.length > 0 ? (
                <EnhancedConversationGrid id="conversation-grid">
                  {conversations.map((conv, index) => {
                    if (!conv) return null;
                    return (
                      <EnhancedConversationCard
                        key={conv.id}
                        onClick={() => loadConversation(conv.id)}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.3,
                          delay: index * 0.05,
                          ease: [0.4, 0, 0.2, 1],
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <MessageCount
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{
                            type: "spring",
                            stiffness: 500,
                            damping: 25,
                            delay: index * 0.05 + 0.2,
                          }}
                          style={{
                            background: getMessageCountColor(
                              conv.chatMessages?.totalCount || 0,
                              calculateMessageStats(conversations)
                            ).background,
                            color: getMessageCountColor(
                              conv.chatMessages?.totalCount || 0,
                              calculateMessageStats(conversations)
                            ).textColor,
                          }}
                        >
                          {conv.chatMessages?.totalCount || 0}
                        </MessageCount>
                        <EnhancedCardContent>
                          <EnhancedCardTitle>
                            {conv.title || "Untitled Conversation"}
                          </EnhancedCardTitle>
                          <EnhancedCardMeta>
                            <TimeStamp>
                              {formatDistanceToNow(new Date(conv.createdAt))}{" "}
                              ago
                            </TimeStamp>
                            <Creator>{conv.creator?.email}</Creator>
                          </EnhancedCardMeta>
                        </EnhancedCardContent>
                      </EnhancedConversationCard>
                    );
                  })}
                  <FetchMoreOnVisible
                    fetchNextPage={handleFetchMoreConversations}
                  />
                </EnhancedConversationGrid>
              ) : (
                <EmptyStateContainer>
                  <h3>No conversations yet</h3>
                  <p>
                    Start a new conversation to ask questions about this corpus.
                  </p>
                  <Button
                    primary
                    icon="plus"
                    content="Start New Conversation"
                    onClick={startNewChat}
                    size="large"
                    style={{
                      background: "linear-gradient(90deg, #4299E1, #2B6CB0)",
                      color: "white",
                      borderRadius: "6px",
                      boxShadow: "0 2px 8px rgba(66, 153, 225, 0.3)",
                      padding: "0.75rem 1.5rem",
                    }}
                  />
                </EmptyStateContainer>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </ConversationIndicator>
    </ChatContainer>
  );
};
