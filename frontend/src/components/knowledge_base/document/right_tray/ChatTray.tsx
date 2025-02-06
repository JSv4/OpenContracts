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
  TimeStamp,
} from "../ChatContainers";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowLeft, Plus, Search } from "lucide-react";
import { Button, CardMeta } from "semantic-ui-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChatMessage,
  ChatMessageProps,
} from "../../../widgets/chat/ChatMessage";
import { useQuery, useReactiveVar } from "@apollo/client";
import {
  GET_CONVERSATIONS,
  GetConversationsInputs,
  GetConversationsOutputs,
} from "../../../../graphql/queries";
import { authToken, userObj } from "../../../../graphql/cache";
import { getWebSocketUrl } from "../utils";

export const ChatTray = ({
  setShowLoad,
  showLoad,
  documentId,
}: {
  documentId: string;
  showLoad: boolean;
  setShowLoad: (value: React.SetStateAction<boolean>) => void;
}) => {
  const [isTyping, setIsTyping] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [chat, setChat] = useState<ChatMessageProps[]>([]);
  const [wsReady, setWsReady] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | undefined
  >();

  const user_obj = useReactiveVar(userObj);
  const auth_token = useReactiveVar(authToken);

  const socketRef = useRef<WebSocket | null>(null);

  const { data, loading, error } = useQuery<
    GetConversationsOutputs,
    GetConversationsInputs
  >(GET_CONVERSATIONS, {
    variables: {
      documentId,
    },
    fetchPolicy: "network-only", // Make sure we're always getting fresh data
  });
  const conversations = useMemo(() => {
    return data?.conversations?.edges?.map((edge) => edge?.node) || [];
  }, [data]);

  // This holds the partial content coming in from the assistant
  const partialAssistantContent = useRef("");

  const selectedConversation = useMemo(() => {
    if (!selectedConversationId) return null;
    return conversations.find((c) => c?.id === selectedConversationId);
  }, [selectedConversationId, conversations]);

  /**
   * Establish or re-establish the WebSocket connection
   * whenever the selected conversation changes.
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
      // Handle incoming messages
      const { data } = event;
      console.log("Received message:", data);
      // Update local chat state if needed
      // ...
    };

    newSocket.onclose = (event) => {
      setWsReady(false);
      console.warn("WebSocket closed:", event);
    };

    // Keep track of our newly opened socket reference
    socketRef.current = newSocket;

    // On cleanup, close the socket
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [auth_token, documentId, selectedConversationId]);

  /**
   * Handler for joining or loading a conversation.
   */
  function loadConversation(conversationId: string) {
    setSelectedConversationId(conversationId);
    setIsTyping(true);
    setShowLoad(false);
    setChat([]);
    partialAssistantContent.current = "";
  }

  const exitConversation = () => {
    setIsTyping(false);
    setShowLoad(false);
    setNewMessage("");
    setChat([]);
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  };

  // Add function to start new chat
  const startNewChat = () => {
    setIsTyping(true);
    setSelectedConversationId(undefined);
    setShowLoad(false);
    setChat([]);
    partialAssistantContent.current = "";
  };

  // Pull messages from allMessages
  const conversationMessages = useMemo(() => {
    return selectedConversation?.allMessages || [];
  }, [selectedConversation]);

  /**
   * Convert existing conversation messages (GraphQL) to ChatMessageProps shape.
   * We treat "HUMAN" as user messages, and "LLM" as assistant messages.
   */
  const mappedConversationMessages = conversationMessages.map((msg) => ({
    user: msg.msgType === "HUMAN" ? "You" : "Assistant",
    content: msg.content,
    timestamp: Date.now().toString(), // example
    isAssistant: msg.msgType === "LLM",
  }));

  // Combined all messages for rendering:
  // existing conversation + newly received assistant messages.
  const combinedMessages = [...mappedConversationMessages, ...chat];

  console.log(conversationMessages);

  if (error) {
    return (
      <ErrorContainer initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <AlertCircle size={24} />
        Failed to load conversations
      </ErrorContainer>
    );
  }

  const sendMessageOverSocket = useCallback(() => {
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
      const payload = { query: trimmed };
      socketRef.current.send(JSON.stringify(payload));
      setNewMessage("");
      setWsError(null);
    } catch (error) {
      console.error("Failed to send message:", error);
      setWsError("Failed to send message. Please try again.");
    }
  }, [newMessage, user_obj?.email, wsReady]);

  return (
    <ChatContainer>
      <ConversationIndicator>
        <AnimatePresence>
          {!isTyping && !selectedConversationId ? (
            // Show menu if not in chat interface
            <motion.div
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
                // Show conversation list when loading
                <ConversationGrid>
                  <BackButton onClick={() => setShowLoad(false)}>
                    <ArrowLeft size={16} />
                    Back to Menu
                  </BackButton>
                  {conversations
                    .filter(
                      (conv): conv is ConversationType =>
                        conv !== null && conv !== undefined
                    )
                    .map((conv) => (
                      <ConversationCard
                        key={conv.id}
                        onClick={() => loadConversation(conv.id)}
                      >
                        <CardGlow />
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
                    ))}
                </ConversationGrid>
              ) : (
                // Show two big buttons for "New" or "Load"
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
            // Show chat interface
            <>
              <BackButton onClick={exitConversation}>
                <ArrowLeft size={16} />
                Back to Menu
              </BackButton>

              {/* Existing chat messages and input */}
              <motion.div
                style={{ flex: 1, overflowY: "auto", padding: "1rem" }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
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
            </>
          )}
        </AnimatePresence>
      </ConversationIndicator>
    </ChatContainer>
  );
};
