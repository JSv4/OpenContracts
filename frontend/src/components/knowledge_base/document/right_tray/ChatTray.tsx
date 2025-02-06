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

import { ConversationType } from "../../../../types/graphql-api";
import { formatDistanceToNow } from "date-fns";
import {
  BackButton,
  CardContent,
  CardGlow,
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
import { AlertCircle, ArrowLeft, Plus, Search, Send } from "lucide-react";
import { Button, CardMeta } from "semantic-ui-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/**
 * MessageData interface for incoming websocket messages.
 */
interface MessageData {
  type: string;
  content: string;
  data?: {
    sources?: string;
  };
}

/**
 * ChatTray props definition.
 */
interface ChatTrayProps {
  documentId: string;
  showLoad: boolean;
  setShowLoad: React.Dispatch<React.SetStateAction<boolean>>;
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
}) => {
  // Chat state
  const [isTyping, setIsTyping] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [chat, setChat] = useState<ChatMessageProps[]>([]);
  const [wsReady, setWsReady] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | undefined
  >();

  // For messages from server (via the new GET_CHAT_MESSAGES query)
  const [serverMessages, setServerMessages] = useState<ChatMessageProps[]>([]);

  // User / Auth state
  const user_obj = useReactiveVar(userObj);
  const auth_token = useReactiveVar(authToken);

  // WebSocket reference
  const socketRef = useRef<WebSocket | null>(null);

  // Query for minimal conversation data (no messages)
  const { data, loading, error, fetchMore } = useQuery<
    GetConversationsOutputs,
    GetConversationsInputs
  >(GET_CONVERSATIONS, {
    variables: {
      documentId,
    },
    fetchPolicy: "network-only",
  });

  // Lazy query for loading messages of a specific conversation
  const [
    fetchChatMessages,
    { data: msgData, fetchMore: fetchMoreMessages, loading: loadingMessages },
  ] = useLazyQuery<GetChatMessagesOutputs, GetChatMessagesInputs>(
    GET_CHAT_MESSAGES
  );

  // Once we have new message data from server, convert them into ChatMessageProps
  useEffect(() => {
    if (!msgData?.chatMessages) return;
    const messages = msgData.chatMessages; // Direct array of messages
    const mapped = messages.map((msg) => ({
      user: msg.msgType === "HUMAN" ? "You" : "Assistant",
      content: msg.content,
      timestamp: Date.now().toString(),
      isAssistant: msg.msgType !== "HUMAN",
    }));
    setServerMessages(mapped);
  }, [msgData]);

  /**
   * Memoized list of conversation nodes from the GraphQL response.
   */
  const conversations = useMemo(() => {
    return data?.conversations?.edges?.map((edge) => edge?.node) || [];
  }, [data]);

  /**
   * Memoized current conversation based on selected ID.
   */
  const selectedConversation = useMemo(() => {
    if (!selectedConversationId) return null;
    return conversations.find((c) => c?.id === selectedConversationId) || null;
  }, [selectedConversationId, conversations]);

  /**
   * Combine serverMessages + local chat for final display
   */
  const combinedMessages = [...serverMessages, ...chat];

  /**
   * Helper method to append streaming tokens to the last assistant chat entry.
   * If no assistant entry exists yet, this will create one.
   * @param token Partial content to be appended
   */
  const appendStreamingTokenToChat = (token: string): void => {
    if (!token) return;
    setChat((prev) => {
      const lastMessage = prev[prev.length - 1];
      if (
        lastMessage &&
        lastMessage.isAssistant &&
        !Object.prototype.hasOwnProperty.call(lastMessage, "sources")
      ) {
        const updatedLast = {
          ...lastMessage,
          content: lastMessage.content + token,
        };
        return [...prev.slice(0, -1), updatedLast];
      } else {
        return [
          ...prev,
          {
            user: "Assistant",
            content: token,
            timestamp: new Date().toLocaleString(),
            isAssistant: true,
          },
        ];
      }
    });
  };

  /**
   * Helper method to finalize streaming responses, replacing the partial content
   * with the final content from the websocket.
   * @param content The final content text
   * @param sources (Optional) sources for the assistant response
   */
  const finalizeStreamingResponse = (
    content: string,
    sources: string
  ): void => {
    setChat((prev) => {
      if (!prev.length) return prev;
      const updatedLast = {
        ...prev[prev.length - 1],
        content,
      };
      return [...prev.slice(0, -1), updatedLast];
    });
  };

  /**
   * Helper method for synchronous responses (SYNC_CONTENT),
   * which just appends a new message from the assistant.
   * @param content The assistant text
   * @param sources (Optional) sources for the assistant response
   */
  const finalizeSyncResponse = (content: string, sources: string): void => {
    setChat((prev) => [
      ...prev,
      {
        user: "Assistant",
        content,
        timestamp: new Date().toLocaleString(),
        isAssistant: true,
      },
    ]);
  };

  /**
   * Whenever the selected conversation changes, (re)establish the WebSocket connection.
   */
  useEffect(() => {
    // If no conversation is selected or no auth token is present, close any socket and exit.
    if (!selectedConversationId || !auth_token) {
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
      selectedConversationId
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
        const messageData = JSON.parse(event.data) as MessageData;
        if (!messageData) return;
        const { type: msgType, content, data } = messageData;
        switch (msgType) {
          case "ASYNC_START":
            // If necessary, any "start" logic can go here
            break;
          case "ASYNC_CONTENT":
            appendStreamingTokenToChat(content);
            break;
          case "ASYNC_FINISH":
            finalizeStreamingResponse(content, data?.sources || "");
            break;
          case "SYNC_CONTENT":
            finalizeSyncResponse(content, data?.sources || "");
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

    // Cleanup on unmount or conversation change
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [auth_token, documentId, selectedConversationId]);

  /**
   * Load existing conversation by ID, clearing local state, then showing chat UI.
   * @param conversationId The ID of the chosen conversation
   */
  const loadConversation = (conversationId: string): void => {
    setSelectedConversationId(conversationId);
    setIsTyping(true);
    setShowLoad(false);
    // Clear both local chat state and server messages
    setChat([]);
    setServerMessages([]);

    // Fetch messages with proper variables
    fetchChatMessages({
      variables: {
        conversationId,
        orderBy: "created_at",
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
    setIsTyping(false);
    setShowLoad(false);
    setNewMessage("");
    setChat([]);
    setServerMessages([]);
    setSelectedConversationId(undefined);
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  };

  /**
   * Start a new chat (unselect existing conversation).
   */
  const startNewChat = (): void => {
    setIsTyping(true);
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

  /**
   * Main UI return
   */
  return (
    <ChatContainer id="chat-container">
      <ConversationIndicator id="conversation-indicator">
        <AnimatePresence>
          {!isTyping && !selectedConversationId ? (
            // 1) Show initial selector menu if not in conversation
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
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {showLoad ? (
                // Show conversation list, with infinite scroll
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
                        {conv.chatMessages?.totalCount &&
                          conv.chatMessages.totalCount > 0 && (
                            <MessageCount
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              transition={{
                                type: "spring",
                                stiffness: 500,
                                damping: 25,
                                delay: index * 0.05 + 0.2,
                              }}
                            >
                              {conv.chatMessages.totalCount}
                            </MessageCount>
                          )}
                        <CardContent>
                          <CardTitle>
                            {conv.title || "Untitled Conversation"}
                          </CardTitle>
                          <CardMeta>
                            <TimeStamp>
                              {formatDistanceToNow(new Date(conv.createdAt))}{" "}
                              ago
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
              ) : (
                // Show big buttons to create or load
                <>
                  <h3 style={{ marginBottom: "1rem" }}>
                    Start a New Chat or Load Existing
                  </h3>
                  <Button
                    color="blue"
                    size="big"
                    onClick={startNewChat}
                    style={{ width: "50%", marginBottom: "1rem" }}
                  >
                    <Plus size={18} style={{ marginRight: "0.5rem" }} />
                    New Chat
                  </Button>
                  <Button
                    size="big"
                    onClick={() => setShowLoad(true)}
                    style={{ width: "50%" }}
                  >
                    <Search size={18} style={{ marginRight: "0.5rem" }} />
                    Load Conversation
                  </Button>
                </>
              )}
            </motion.div>
          ) : (
            // 2) Once a conversation is selected or started, show chat interface
            <motion.div
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
                width: "100%",
              }}
            >
              <motion.div
                style={{
                  padding: "0.5rem 1rem",
                  borderBottom: "1px solid rgba(0,0,0,0.1)",
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
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

              <motion.div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "1rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1rem",
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {combinedMessages.map((msg, idx) => (
                  <ChatMessage
                    key={idx}
                    user={msg.user}
                    content={msg.content}
                    timestamp={msg.timestamp}
                    isAssistant={msg.isAssistant}
                  />
                ))}
              </motion.div>

              <ChatInputContainer $isTyping={isTyping}>
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
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewMessage(e.target.value)
                  }
                  placeholder={
                    wsReady
                      ? "Type your message..."
                      : "Waiting for connection..."
                  }
                  disabled={!wsReady}
                  onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => {
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
          )}
        </AnimatePresence>
      </ConversationIndicator>
    </ChatContainer>
  );
};
