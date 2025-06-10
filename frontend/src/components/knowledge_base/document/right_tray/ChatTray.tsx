/**
 * ChatTray Component - Vertical Alignment For Sidebar
 *
 * This component now connects to our websocket backend IF the user is logged in
 * and we have a valid auth token in the Apollo reactive vars.
 * It will:
 *   1) Load existing conversation data from GraphQL (GET_CONVERSATIONS).
 *   2) If authenticated, open a WebSocket to stream new messages with partial updates
 *      (ASYNC_START, ASYNC_CONTENT, ASYNC_FINISH) or synchronous messages (SYNC_CONTENT).
 *   3) Display those messages in real time, appending them to the chat.
 *   4) Allow sending user queries through the socket.
 */

import { formatDistanceToNow } from "date-fns";
import {
  BackButton,
  CardContent,
  CardTitle,
  ChatContainer,
  ConversationCard,
  ConversationGrid,
  ConversationIndicator,
  Creator,
  ErrorContainer,
  MessageCount,
  TimeStamp,
} from "../ChatContainers";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  Plus,
  Search,
  Send,
  X,
  Calendar,
} from "lucide-react";
import { Button, CardMeta } from "semantic-ui-react";
import {
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChatMessage,
  ChatMessageProps,
} from "../../../widgets/chat/ChatMessage";
import { useLazyQuery, useQuery, useReactiveVar } from "@apollo/client";
import {
  GET_CONVERSATIONS,
  GetConversationsInputs,
  GetConversationsOutputs,
  GET_CHAT_MESSAGES,
  GetChatMessagesOutputs,
  GetChatMessagesInputs,
} from "../../../../graphql/queries";
import { authToken, userObj } from "../../../../graphql/cache";
import { getWebSocketUrl } from "../utils";
import {
  ChatInputContainer,
  ChatInput,
  SendButton,
  ErrorMessage,
  ConnectionStatus,
} from "../ChatContainers";
import { FetchMoreOnVisible } from "../../../widgets/infinite_scroll/FetchMoreOnVisible";
import { NewChatFloatingButton } from "../ChatContainers";
import {
  DatePickerExpanded,
  ExpandingInput,
  FilterContainer,
  IconButton,
} from "../FilterContainers";
import { MultipageAnnotationJson } from "../../../types";
import {
  useChatSourceState,
  mapWebSocketSourcesToChatMessageSources,
} from "../../../annotator/context/ChatSourceAtom";
import { TimelineEntry } from "../../../widgets/chat/ChatMessage";
import { useUISettings } from "../../../annotator/hooks/useUISettings";

/**
 * A helper interface representing the properties of data included in websocket messages,
 * specifically any source annotations or label metadata.
 */
export interface WebSocketSources {
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
export interface MessageData {
  type: "ASYNC_START" | "ASYNC_CONTENT" | "ASYNC_FINISH" | "SYNC_CONTENT" | "ASYNC_THOUGHT" | "ASYNC_SOURCES";
  content: string;
  data?: {
    sources?: WebSocketSources[];
    timeline?: TimelineEntry[];
    message_id?: string;
    tool_name?: string;
    args?: any;
    [key: string]: any; // For any additional metadata
  };
}

/**
 * ChatTray props definition.
 */
interface ChatTrayProps {
  documentId: string;
  showLoad: boolean;
  setShowLoad: React.Dispatch<React.SetStateAction<boolean>>;
  onMessageSelect?: () => void;
  corpusId?: string;
}

/**
 * ChatTray component provides:
 * 1) Initial user selection of either creating a new conversation or loading an existing one,
 * with infinite scrolling for loading conversations in pages.
 * 2) Upon conversation selection, it establishes a websocket connection and renders the chat UI
 *    (including message list, chat input, connection status, or error messages).
 *
 * It merges older chat input and websocket communication code with newer UI logic
 * for listing or creating conversations, including streaming partial responses.
 */
export const ChatTray: React.FC<ChatTrayProps> = ({
  documentId,
  showLoad,
  setShowLoad,
  onMessageSelect,
  corpusId,
}) => {
  // Chat state
  const [isNewChat, setIsNewChat] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [chat, setChat] = useState<ChatMessageProps[]>([]);
  const [wsReady, setWsReady] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | undefined
  >();
  const {
    messages: sourcedMessages,
    selectedMessageId,
    setChatSourceState,
  } = useChatSourceState();

  // For messages from server (via the new GET_CHAT_MESSAGES query)
  const [serverMessages, setServerMessages] = useState<ChatMessageProps[]>([]);

  // User / Auth state
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

  const { data, loading, error, fetchMore, refetch } = useQuery<
    GetConversationsOutputs,
    GetConversationsInputs
  >(GET_CONVERSATIONS, {
    variables: {
      documentId,
      title_Contains: debouncedTitle || undefined,
      createdAt_Gte: createdAtGte || undefined,
      createdAt_Lte: createdAtLte || undefined,
    },
    fetchPolicy: "network-only",
  });

  // Lazy query for loading messages of a specific conversation
  const [
    fetchChatMessages,
    {
      data: msgData,
      fetchMore: fetchMoreMessages,
      loading: loadingMessages,
      error: messagesError,
    },
  ] = useLazyQuery<GetChatMessagesOutputs, GetChatMessagesInputs>(
    GET_CHAT_MESSAGES
  );

  const { chatTrayState, setChatTrayState } = useUISettings();

  /**
   * On server data load, we map messages to local ChatMessageProps and
   * also store any 'sources' in the chatSourcesAtom (so pins and selection work).
   */
  useEffect(() => {
    console.log("[ChatTray] GET_CHAT_MESSAGES useLazyQuery state:", {
      loading: loadingMessages,
      error: messagesError,
      data: JSON.stringify(msgData),
    });
    if (!msgData?.chatMessages) {
      if (msgData) {
        console.log(
          "[ChatTray] msgData is present but msgData.chatMessages is not:",
          msgData
        );
      }
      return;
    }
    const messages = msgData.chatMessages;
    console.log("[ChatTray] msgData.chatMessages received:", messages);

    // First, register them in our chatSourcesAtom if they have sources
    messages.forEach((srvMsg) => {
      const srvMsgData = srvMsg.data as { sources?: WebSocketSources[]; timeline?: TimelineEntry[]; message_id?: string } | undefined;
      if (srvMsgData?.sources?.length) {
        handleCompleteMessage(
          srvMsg.content,
          srvMsgData.sources,
          srvMsg.id,
          srvMsg.createdAt,
          srvMsgData.timeline
        );
      }
    });

    console.log("messages", messages);

    // Then, map them for immediate display - NOW INCLUDING hasSources and hasTimeline FLAGS
    const mapped = messages.map((msg) => {
      // Type assertion for data field to include timeline
      const msgData = msg.data as { sources?: WebSocketSources[]; timeline?: TimelineEntry[]; message_id?: string } | undefined;
      
      return {
        messageId: msg.id,
        user: msg.msgType === "HUMAN" ? "You" : "Assistant",
        content: msg.content,
        timestamp: new Date(msg.createdAt).toLocaleString(),
        isAssistant: msg.msgType !== "HUMAN",
        hasSources: !!msgData?.sources?.length,
        hasTimeline: !!msgData?.timeline?.length,
        timeline: msgData?.timeline || [],
      };
    });
    setServerMessages(mapped);
  }, [msgData]);

  // Add this effect to handle clicks outside the expanded elements
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

  /**
   * Memoized list of conversation nodes from the GraphQL response.
   */
  const conversations = useMemo(() => {
    return data?.conversations?.edges?.map((edge) => edge?.node) || [];
  }, [data]);

  /**
   * Combine serverMessages + local chat for final display
   */
  const combinedMessages = [...serverMessages, ...chat];

  // Add ref for messages container
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Add scroll helper function
  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  }, []);

  // Scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [combinedMessages, scrollToBottom]);

  // Restore persisted conversation + scroll
  useEffect(() => {
    if (chatTrayState.conversationId) {
      loadConversation(chatTrayState.conversationId);
    } else if (chatTrayState.isNewChat) {
      startNewChat();
    }
    // restore scroll after messages render
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({ top: chatTrayState.scrollOffset });
      }
    }, 0);
  }, []);

  // Persist on unmount or when id/newChat change
  useEffect(() => {
    return () => {
      if (messagesContainerRef.current) {
        setChatTrayState({
          conversationId: selectedConversationId ?? null,
          isNewChat,
          scrollOffset: messagesContainerRef.current.scrollTop,
        });
      }
    };
  }, [selectedConversationId, isNewChat, setChatTrayState]);

  // Track scroll to update offset live
  const handlePersistedScroll = useCallback(() => {
    if (messagesContainerRef.current) {
      const offset = messagesContainerRef.current.scrollTop;
      setChatTrayState((prev) => ({ ...prev, scrollOffset: offset }));
    }
  }, [setChatTrayState]);

  function appendStreamingTokenToChat(
    token: string,
    overrideMessageId?: string
  ): string {
    // Return the messageId
    if (!token) return "";

    let messageId = "";
    setChat((prev) => {
      const lastMessage = prev[prev.length - 1];

      // If we were already streaming the assistant's last message, just append:
      if (lastMessage && lastMessage.isAssistant) {
        messageId = lastMessage.messageId || ""; // Capture existing ID
        console.log("append to existing messageId", messageId);
        const updatedLast = {
          ...lastMessage,
          content: lastMessage.content + token,
        };
        return [...prev.slice(0, -1), updatedLast];
      } else {
        // Otherwise, create a fresh assistant message with a brand-new messageId
        messageId =
          overrideMessageId ||
          `msg_${Date.now()}_${Math.random().toString(36).substr(2)}`;
        console.log("append to new messageId", messageId);
        return [
          ...prev,
          {
            messageId, // Use the same ID we'll return
            user: "Assistant",
            content: token,
            timestamp: new Date().toLocaleString(),
            isAssistant: true,
            hasTimeline: false,
            timeline: [],
          },
        ];
      }
    });
    return messageId; // Return the ID so we can use it in finalizeStreamingResponse
  }

  /**
   * Append an *agent thought* (or tool call/result) to the timeline of the
   * streaming assistant message so the user can watch reasoning unfold.
   */
  const appendThoughtToMessage = (
    thoughtText: string,
    data: MessageData["data"] | undefined
  ): void => {
    const messageId = data?.message_id;
    if (!messageId || !thoughtText) return;

    // Determine timeline entry type
    let entryType: TimelineEntry["type"] = "thought";
    if (data?.tool_name && data?.args) entryType = "tool_call";
    else if (data?.tool_name && !data?.args) entryType = "tool_result";

    const newEntry: TimelineEntry = {
      type: entryType,
      text: thoughtText,
      tool: data?.tool_name,
      args: data?.args,
    };

    // Update chat UI timeline
    setChat((prev) => {
      const idx = prev.findIndex((m) => m.messageId === messageId);
      if (idx === -1) {
        // No message yet (thought arrived very early) – create skeleton.
        return [
          ...prev,
          {
            messageId,
            user: "Assistant",
            content: "", // will be filled later
            timestamp: new Date().toLocaleString(),
            isAssistant: true,
            hasTimeline: true,
            timeline: [newEntry],
          },
        ];
      }

      const msg = prev[idx];
      const timeline = msg.timeline ? [...msg.timeline, newEntry] : [newEntry];
      const updated = {
        ...msg,
        hasTimeline: true,
        timeline,
      } as ChatMessageProps;

      return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
    });
  };

  /**
   * Finalize a partially-streamed response by replacing the last chat entry
   * with the final content (and calling `handleCompleteMessage` to store sources).
   * @param content - the fully streamed final response
   * @param sourcesData - optional array of WebSocketSources describing pinned info
   * @param overrideId - optional message ID to use
   * @param timelineData - optional timeline entries
   */
  const finalizeStreamingResponse = (
    content: string,
    sourcesData?: WebSocketSources[],
    overrideId?: string,
    timelineData?: TimelineEntry[]
  ): void => {
    console.log("finalizeStreamingResponse", {
      content,
      sourcesData,
      overrideId,
    });

    let lastMsgId: string | undefined;
    setChat((prev) => {
      // Make sure we have a recent assistant message to finalize
      if (!prev.length) {
        console.log("No previous messages to finalize");
        return prev;
      }
      const lastIndex = [...prev].reverse().findIndex((msg) => msg.isAssistant);
      console.log("Finding last assistant message, reverse index:", lastIndex);
      if (lastIndex === -1) {
        console.log("No assistant message found to finalize");
        return prev;
      }

      // Because we reversed, compute forward index
      const forwardIndex = prev.length - 1 - lastIndex;
      console.log("Forward index for update:", forwardIndex);
      const updatedMessages = [...prev];
      const assistantMsg = updatedMessages[forwardIndex];
      console.log("XOXO - Found assistant message to update:", {
        messageId: assistantMsg.messageId,
        oldContent: assistantMsg.content.substring(0, 50) + "...",
      });

      // Capture the messageId so we can pass it into handleCompleteMessage
      lastMsgId = assistantMsg.messageId;

      // Overwrite its content with the final chunk
      updatedMessages[forwardIndex] = {
        ...assistantMsg,
        content,
      };
      console.log("Updated message with final content:", {
        messageId: lastMsgId,
        newContent: content.substring(0, 50) + "...",
      });

      // Now store the final content + sources in ChatSourceAtom with the same ID
      handleCompleteMessage(content, sourcesData, lastMsgId, undefined, timelineData);

      return updatedMessages;
    });
  };

  /**
   * Debounce the title filter input.
   *
   * This effect updates `debouncedTitle` 500ms after the user stops typing,
   * which in turn triggers the GET_CONVERSATIONS query to refetch with the new filter.
   *
   * It is crucial that this hook is defined at the top level, not conditionally.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTitle(titleFilter);
    }, 500); // Adjust delay as needed

    return () => clearTimeout(timer);
  }, [titleFilter]);

  /**
   * Whenever the selected conversation changes, (re)establish the WebSocket connection.
   */
  useEffect(() => {
    // If no conversation is selected or no auth token is present, close any socket and exit.
    if (!auth_token || (!selectedConversationId && !isNewChat)) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setWsReady(false);
      return;
    }

    // Build WebSocket URL, including conversation ID
    const wsUrl = getWebSocketUrl(
      documentId,
      auth_token,
      selectedConversationId,
      corpusId
    );
    const newSocket = new WebSocket(wsUrl);

    newSocket.onopen = () => {
      setWsReady(true);
      setWsError(null);
      console.log(
        "WebSocket connected for conversation:",
        selectedConversationId
      );
    };

    newSocket.onerror = (event) => {
      setWsReady(false);
      setWsError("Error connecting to the websocket.");
      console.error("WebSocket error:", event);
    };

    newSocket.onmessage = (event) => {
      try {
        const messageData: MessageData = JSON.parse(event.data);
        if (!messageData) return;
        const { type: msgType, content, data } = messageData;

        console.log("[ChatTray WebSocket] Received message:", {
          type: msgType,
          hasContent: !!content,
          hasSources: !!data?.sources,
          sourceCount: data?.sources?.length,
          hasTimeline: !!data?.timeline,
          timelineCount: data?.timeline?.length,
          message_id: data?.message_id,
        });

        switch (msgType) {
          case "ASYNC_START":
            appendStreamingTokenToChat(content, data?.message_id);
            break;
          case "ASYNC_CONTENT":
            appendStreamingTokenToChat(content, data?.message_id);
            break;
          case "ASYNC_THOUGHT":
            appendThoughtToMessage(content, data);
            break;
          case "ASYNC_SOURCES":
            mergeSourcesIntoMessage(data?.sources, data?.message_id);
            break;
          case "ASYNC_FINISH":
            finalizeStreamingResponse(content, data?.sources, data?.message_id, data?.timeline);
            break;
          case "SYNC_CONTENT": {
            const sourcesToPass =
              data?.sources && Array.isArray(data.sources)
                ? data.sources
                : undefined;
            const timelineToPass =
              data?.timeline && Array.isArray(data.timeline)
                ? data.timeline
                : undefined;
            console.log(
              "[ChatTray WebSocket] SYNC_CONTENT sources:",
              sourcesToPass,
              "timeline:",
              timelineToPass
            );
            handleCompleteMessage(content, sourcesToPass, data?.message_id, undefined, timelineToPass);
            break;
          }
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

    // Cleanup on unmount or conversation change
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [auth_token, documentId, selectedConversationId, isNewChat]);

  /**
   * Load existing conversation by ID, clearing local state, then showing chat UI.
   * @param conversationId The ID of the chosen conversation
   */
  const loadConversation = (conversationId: string): void => {
    setSelectedConversationId(conversationId);
    setIsNewChat(false);
    setShowLoad(false);
    // Clear both local chat state and server messages
    setChat([]);
    setServerMessages([]);

    console.log("[ChatTray] Calling fetchChatMessages with variables:", {
      conversationId,
      limit: 10,
    });
    // Fetch messages with proper variables
    fetchChatMessages({
      variables: {
        conversationId,
        limit: 10,
      },
      // Add fetchPolicy to ensure we always get fresh data
      fetchPolicy: "network-only",
    });
  };

  /**
   * Exit the current conversation and reset chat state.
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
    refetch();
  };

  /**
   * Start a new chat (unselect existing conversation).
   */
  const startNewChat = (): void => {
    setIsNewChat(true);
    setSelectedConversationId(undefined);
    setShowLoad(false);
    setChat([]);
    setServerMessages([]);
    // Potentially you'll create a new conversation server-side
  };

  /**
   * Handle infinite scroll triggers for loading more conversation summary cards.
   * Loads next page if available.
   */
  const handleFetchMoreConversations = useCallback(() => {
    if (
      !loading &&
      data?.conversations?.pageInfo?.hasNextPage &&
      typeof fetchMore === "function"
    ) {
      fetchMore({
        variables: {
          documentId,
          limit: 5,
          cursor: data.conversations.pageInfo.endCursor,
        },
      }).catch((err: any) => {
        console.error("Failed to fetch more conversations:", err);
      });
    }
  }, [loading, data, fetchMore, documentId]);

  /**
   * Send typed message over the WebSocket to the assistant, and add it locally.
   */
  const sendMessageOverSocket = useCallback((): void => {
    const trimmed = newMessage.trim();
    if (!trimmed || !socketRef.current) return;
    if (!wsReady) {
      console.warn("WebSocket not ready yet");
      return;
    }

    // Check if a message is already being sent
    if (sendingLockRef.current) {
      console.warn("Message is already being sent, ignoring duplicate send.");
      return;
    }

    // Lock sending to prevent duplicate sends
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
      // Release the lock after a debounce interval (e.g., 300ms)
      setTimeout(() => {
        sendingLockRef.current = false;
      }, 300);
    }
  }, [newMessage, user_obj?.email, wsReady]);

  // Render error if GraphQL query fails
  if (error) {
    return (
      <ErrorContainer initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <AlertCircle size={24} />
        Failed to load conversations
      </ErrorContainer>
    );
  }

  // Add these utility functions at the top of the file
  const calculateMessageStats = (conversations: any[]) => {
    const counts = conversations.map(
      (conv) => conv?.chatMessages?.totalCount || 0
    );
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    const sum = counts.reduce((a, b) => a + b, 0);
    const mean = sum / counts.length;

    // Calculate standard deviation
    const variance =
      counts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / counts.length;
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
        textColor: "#4A5568", // Dark text for zero count
      };
    }

    // Calculate z-score
    const zScore = (count - stats.mean) / (stats.stdDev || 1);

    // Convert z-score to a 0-1 scale using sigmoid function
    const intensity = 1 / (1 + Math.exp(-zScore));

    // Create gradient based on intensity
    return {
      background: `linear-gradient(135deg, 
        rgba(43, 108, 176, ${0.7 + intensity * 0.3}) 0%, 
        rgba(44, 82, 130, ${0.8 + intensity * 0.2}) 100%)`,
      opacity: 0.8 + intensity * 0.2,
      textColor: intensity > 0.3 ? "white" : "#1A202C", // Flip text color based on intensity
    };
  };

  const handleCompleteMessage = (
    content: string,
    sourcesData?: Array<WebSocketSources>,
    overrideId?: string,
    overrideCreatedAt?: string,
    timelineData?: TimelineEntry[]
  ): void => {
    if (!overrideId) {
      console.warn(
        "handleCompleteMessage called without an overrideId - sources may not display correctly"
      );
    }
    const messageId = overrideId ?? `msg_${Date.now()}`; // Only fallback if really needed
    console.log("XOXO - handleCompleteMessage messageId", messageId);
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
   * Merge *additional* sources arriving via ASYNC_SOURCES into the existing
   * ChatSourceAtom + local chat message so the user can click pins while the
   * answer is still streaming.
   */
  const mergeSourcesIntoMessage = (
    sourcesData: WebSocketSources[] | undefined,
    overrideId?: string
  ): void => {
    if (!sourcesData?.length || !overrideId) return;

    // First convert incoming sources → ChatMessageSource objects.
    const mappedSources = mapWebSocketSourcesToChatMessageSources(
      sourcesData,
      overrideId
    );

    // Update ChatSourceAtom – merge or append sources for the message.
    setChatSourceState((prev) => {
      const idx = prev.messages.findIndex((m) => m.messageId === overrideId);
      if (idx === -1) {
        // Message not yet in atom – create skeleton entry so pins work.
        return {
          ...prev,
          messages: [
            ...prev.messages,
            {
              messageId: overrideId,
              content: "", // will be filled later by finalizeStreamingResponse
              timestamp: new Date().toISOString(),
              sources: mappedSources,
            },
          ],
        };
      }

      // Merge with existing sources (avoid duplicates by annotation_id)
      const existing = prev.messages[idx];
      const mergedSources = [
        ...existing.sources,
        ...mappedSources.filter(
          (ms) =>
            !existing.sources.some(
              (es) => es.annotation_id === ms.annotation_id
            )
        ),
      ];

      const updatedMessages = [...prev.messages];
      updatedMessages[idx] = { ...existing, sources: mergedSources };

      return { ...prev, messages: updatedMessages };
    });

    // Update transient chat UI so pin indicator appears immediately.
    setChat((prev) => {
      const idx = prev.findIndex((m) => m.messageId === overrideId);
      if (idx === -1) return prev;
      const msg = prev[idx];
      return [
        ...prev.slice(0, idx),
        { ...msg, hasSources: true },
        ...prev.slice(idx + 1),
      ];
    });
  };

  /**
   * Main UI return
   */
  return (
    <ChatContainer id="chat-container">
      <ConversationIndicator id="conversation-indicator">
        <AnimatePresence>
          {isNewChat || selectedConversationId ? (
            <motion.div
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                width: "100%",
                position: "relative",
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Fixed Header */}
              <motion.div
                style={{
                  padding: "0.5rem 1rem",
                  borderBottom: "1px solid rgba(0,0,0,0.1)",
                  background: "rgba(255, 255, 255, 0.95)",
                  zIndex: 2,
                  position: "sticky",
                  top: 0,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <Button
                  size="small"
                  onClick={exitConversation}
                  style={{
                    background: "transparent",
                    padding: "0.5rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <ArrowLeft size={16} />
                  Back to Conversations
                </Button>
              </motion.div>

              {/* Scrollable Messages Container */}
              <motion.div
                style={{
                  flex: "1 1 auto",
                  overflowY: "auto",
                  minHeight: 0,
                  padding: "1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                  paddingBottom: "6rem",
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                id="messages-container"
                ref={messagesContainerRef}
                onScroll={handlePersistedScroll}
              >
                {combinedMessages.map((msg, idx) => {
                  // Find if this message has sources in our sourced messages state
                  const sourcedMessage = sourcedMessages.find(
                    (m) => m.messageId === msg.messageId
                  );

                  // Map sources to include onClick handlers and text content
                  const sources =
                    sourcedMessage?.sources.map((source, index) => ({
                      text: source.rawText || `Source ${index + 1}`,
                      onClick: () => {
                        // Update the chatSourcesAtom with the selected source
                        setChatSourceState((prev) => ({
                          ...prev,
                          selectedMessageId: sourcedMessage.messageId,
                          selectedSourceIndex: index,
                        }));
                      },
                    })) || [];

                  return (
                    <ChatMessage
                      key={msg.messageId || idx}
                      {...msg}
                      hasSources={!!sourcedMessage?.sources.length}
                      hasTimeline={msg.hasTimeline}
                      sources={sources}
                      timeline={msg.timeline}
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
                                ? null // deselect if already selected
                                : sourcedMessage.messageId,
                            selectedSourceIndex: null, // Reset source selection when message selection changes
                          }));
                          // Call the onMessageSelect callback when a message with sources is selected
                          if (sourcedMessage.sources.length > 0) {
                            onMessageSelect?.();
                          }
                        }
                      }}
                    />
                  );
                })}
              </motion.div>

              {/* Fixed Footer with Input */}
              <ChatInputContainer
                $isTyping={isNewChat}
                style={{
                  zIndex: 3,
                  background: "rgba(255, 255, 255, 0.95)",
                  backdropFilter: "blur(10px)",
                  borderTop: "1px solid rgba(0, 0, 0, 0.1)",
                }}
              >
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
                <ChatInput
                  value={newMessage}
                  onChange={(e: {
                    target: { value: SetStateAction<string> };
                  }) => setNewMessage(e.target.value)}
                  placeholder={
                    wsReady
                      ? "Type your message..."
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
              </ChatInputContainer>
            </motion.div>
          ) : (
            <motion.div
              id="conversation-menu"
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "1rem",
                padding: "2rem",
                overflowY: "hidden",
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <FilterContainer>
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
              </FilterContainer>
              <ConversationGrid id="conversation-grid">
                <BackButton onClick={() => setShowLoad(false)}>
                  <ArrowLeft size={16} />
                  Back to Menu
                </BackButton>
                {conversations.map((conv, index) => {
                  if (!conv) return null;
                  return (
                    <ConversationCard
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
                        $colorStyle={getMessageCountColor(
                          conv.chatMessages?.totalCount || 0,
                          calculateMessageStats(conversations)
                        )}
                      >
                        {conv.chatMessages?.totalCount || 0}
                      </MessageCount>
                      <CardContent>
                        <CardTitle>
                          {conv.title || "Untitled Conversation"}
                        </CardTitle>
                        <CardMeta>
                          <TimeStamp>
                            {formatDistanceToNow(new Date(conv.createdAt))} ago
                          </TimeStamp>
                          <Creator>{conv.creator?.email}</Creator>
                        </CardMeta>
                      </CardContent>
                    </ConversationCard>
                  );
                })}
                <FetchMoreOnVisible
                  fetchNextPage={handleFetchMoreConversations}
                />
              </ConversationGrid>
              <NewChatFloatingButton
                onClick={() => startNewChat()}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Plus />
              </NewChatFloatingButton>
            </motion.div>
          )}
        </AnimatePresence>
      </ConversationIndicator>
    </ChatContainer>
  );
};
