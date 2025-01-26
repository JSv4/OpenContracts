/**
 * DocumentKnowledgeBase Component
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

import React, { useState, useEffect, useRef } from "react";
import { useQuery, useReactiveVar } from "@apollo/client";
import {
  Card,
  Button,
  Input,
  Icon,
  Segment,
  Header,
  Divider,
  Label,
  Modal,
} from "semantic-ui-react";
import {
  MessageSquare,
  FileText,
  Edit2,
  Download,
  History,
  Notebook,
  Database,
  FileType,
  User,
  Calendar,
  Send,
  Eye,
  Network,
  Plus,
  Clock,
  X,
  ChartNetwork,
} from "lucide-react";
import {
  GET_CONVERSATIONS,
  GET_DOCUMENT_KNOWLEDGE_BASE,
  GetDocumentKnowledgeBaseInputs,
  GetDocumentKnowledgeBaseOutputs,
} from "../../../graphql/queries";
import { ConversationTypeConnection } from "../../../types/graphql-api";
import { ChatMessage, ChatMessageProps } from "../../widgets/chat/ChatMessage";
import { authToken, userObj } from "../../../graphql/cache";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";

interface ConversationSelectorProps {
  conversations: Array<{
    id: string;
    title?: string;
    createdAt: string;
    creator: {
      email: string;
    };
    messageCount?: number;
  }>;
  selectedId?: string;
  onSelect: (id: string) => void;
  onCreateNew: () => void;
}

// Enhanced styled components
const FullScreenModal = styled(Modal)`
  &&& {
    position: fixed;
    margin: 0 !important;
    top: 0 !important;
    left: 0 !important;
    width: 100% !important;
    height: 100% !important;
    max-width: 100% !important;
    max-height: 100% !important;
    border-radius: 0 !important;
    background: #f8f9fa;
  }
`;

const HeaderContainer = styled(Segment)`
  &&& {
    margin: 0 !important;
    border-radius: 0 !important;
    padding: 1.5rem 2rem !important;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid rgba(231, 234, 237, 0.7);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
    z-index: 100;
    position: relative;
  }
`;

const MetadataRow = styled.div`
  display: flex;
  gap: 2rem;
  color: #6c757d;
  margin-top: 0.5rem;
  font-size: 0.9rem;

  span {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: color 0.2s ease;

    &:hover {
      color: #2185d0;
    }

    svg {
      opacity: 0.7;
    }
  }
`;

const ContentArea = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  height: calc(100vh - 90px);
  background: white;
  position: relative;
`;

const TabsColumn = styled(Segment)<{ collapsed: boolean }>`
  &&& {
    margin: 0 !important;
    padding: 0.75rem 0 !important;
    border: none !important;
    border-right: 1px solid rgba(231, 234, 237, 0.7) !important;
    border-radius: 0 !important;
    background: rgba(248, 249, 250, 0.8);
    backdrop-filter: blur(10px);
    width: ${(props) => (props.collapsed ? "64px" : "220px")};
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    z-index: 90;
  }
`;

const TabButton = styled(Button)<{ collapsed: boolean }>`
  &&& {
    width: 100%;
    text-align: ${(props) => (props.collapsed ? "center" : "left")} !important;
    border-radius: 0 !important;
    margin: 0.25rem 0 !important;
    padding: ${(props) =>
      props.collapsed ? "1rem" : "0.8rem 1.5rem"} !important;
    background: transparent;
    border: none !important;
    color: #495057;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    overflow: hidden;

    &:hover {
      background: rgba(231, 234, 237, 0.4) !important;
      color: #2185d0;
    }

    &.active {
      background: white !important;
      color: #2185d0;
      font-weight: 500;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);

      &:before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        background: #2185d0;
        border-radius: 0 2px 2px 0;
      }
    }

    svg {
      margin-right: ${(props) =>
        props.collapsed ? "0" : "0.75rem"} !important;
      transition: transform 0.2s ease;
    }

    &:hover svg {
      transform: scale(1.1);
    }

    span {
      opacity: ${(props) => (props.collapsed ? 0 : 1)};
      transition: opacity 0.2s ease;
      ${(props) => props.collapsed && "display: none;"}
    }
  }
`;

const MainContent = styled.div`
  padding: 2rem;
  overflow-y: auto;
  background: white;
  width: 100%;
  height: 100%;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #f1f3f5;
  }

  &::-webkit-scrollbar-thumb {
    background: #dee2e6;
    border-radius: 4px;

    &:hover {
      background: #ced4da;
    }
  }
`;

const DocumentContent = styled.div`
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;

  h1 {
    font-size: 2.5rem;
    font-weight: 700;
    color: #212529;
    margin-bottom: 2rem;
    line-height: 1.2;
  }

  .prose {
    font-size: 1.1rem;
    line-height: 1.7;
    color: #495057;
  }
`;

const SlidingPanel = styled(motion.div)`
  position: absolute;
  top: 0;
  right: 0;
  width: 50%;
  height: 100%;
  background: white;
  box-shadow: -4px 0 25px rgba(0, 0, 0, 0.05);
  z-index: 80;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
`;

const ChatInputContainer = styled.div`
  padding: 1.5rem;
  border-top: 1px solid rgba(231, 234, 237, 0.7);
  background: white;
  position: relative;
`;

const ChatInput = styled(Input)`
  &&& {
    width: 100%;

    input {
      border-radius: 1.5rem !important;
      padding: 0.8rem 1.5rem !important;
      padding-right: 4rem !important;
      border: 2px solid #e9ecef !important;
      transition: all 0.2s ease !important;

      &:focus {
        border-color: #2185d0 !important;
        box-shadow: 0 0 0 2px rgba(33, 133, 208, 0.1) !important;
      }
    }
  }
`;

const SendButton = styled(Button)`
  &&& {
    position: absolute;
    right: 2rem;
    top: 50%;
    transform: translateY(-50%);
    width: 2.5rem;
    height: 2.5rem;
    padding: 0 !important;
    border-radius: 50% !important;
    background: #2185d0 !important;
    color: white !important;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;

    &:hover {
      background: #1678c2 !important;
      transform: translateY(-50%) scale(1.05);
    }

    &:active {
      transform: translateY(-50%) scale(0.95);
    }

    svg {
      width: 16px;
      height: 16px;
      margin-left: 2px;
    }
  }
`;

// Update the ConversationSelector component
const ConversationList = styled.div`
  max-height: 300px;
  overflow-y: auto;
  border-bottom: 1px solid #e9ecef;
`;

const ConversationItem = styled(Segment)`
  &&& {
    cursor: pointer;
    margin: 0 !important;
    padding: 1rem !important;
    border: none !important;
    border-radius: 0 !important;

    &:hover {
      background: #f8f9fa !important;
    }

    &.active {
      background: #e8f4ff !important;
    }
  }
`;

const ConversationSelector: React.FC<ConversationSelectorProps> = ({
  conversations = [],
  selectedId,
  onSelect,
  onCreateNew,
}) => (
  <div>
    <div style={{ padding: "1rem", borderBottom: "1px solid #e9ecef" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <Header as="h3" style={{ margin: 0 }}>
          Conversations
        </Header>
        <Button primary compact icon labelPosition="left" onClick={onCreateNew}>
          <Plus size={16} />
          New Chat
        </Button>
      </div>
    </div>
    <ConversationList>
      {conversations?.length > 0 ? (
        conversations.map((conv) => (
          <ConversationItem
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={selectedId === conv.id ? "active" : ""}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <MessageSquare size={16} />
                {conv.title || "Untitled Conversation"}
              </span>
              {conv.messageCount && (
                <Label circular size="tiny" color="blue">
                  {conv.messageCount}
                </Label>
              )}
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                color: "#6c757d",
                marginTop: "0.5rem",
              }}
            >
              <span style={{ marginRight: "1rem" }}>
                <Clock size={12} style={{ marginRight: "0.3rem" }} />
                {new Date(conv.createdAt).toLocaleDateString()}
              </span>
              <span>
                <User size={12} style={{ marginRight: "0.3rem" }} />
                {conv.creator.email}
              </span>
            </div>
          </ConversationItem>
        ))
      ) : (
        <div style={{ padding: "1rem", textAlign: "center", color: "#6c757d" }}>
          No conversations yet. Start a new chat!
        </div>
      )}
    </ConversationList>
  </div>
);

interface DocumentKnowledgeBaseProps {
  documentId: string;
  corpusId: string;
  onClose?: () => void;
}

const ControlButtonGroup = styled.div`
  position: absolute;
  top: 1.5rem;
  right: 2rem;
  display: flex;
  gap: 0.75rem;
`;

const ControlButton = styled(Button)`
  &&& {
    width: 2.5rem !important;
    height: 2.5rem !important;
    padding: 0 !important;
    border-radius: 50% !important;
    display: flex !important;
    align-items: center;
    justify-content: center;
    background: white !important;
    border: 1px solid rgba(231, 234, 237, 0.7) !important;
    color: #495057 !important;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05);
      border-color: #2185d0 !important;
      color: #2185d0 !important;
    }

    &:active {
      transform: translateY(1px);
    }

    svg {
      width: 16px;
      height: 16px;
    }
  }
`;

const RelatedDocumentButton = styled(Button)`
  &&& {
    width: 100%;
    text-align: left !important;
    padding: 1rem !important;
    background: transparent !important;
    border: none !important;
    border-bottom: 1px solid rgba(231, 234, 237, 0.7) !important;
    color: #495057;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(231, 234, 237, 0.4) !important;
      color: #2185d0;
    }

    .title {
      font-weight: 500;
      margin-bottom: 0.25rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .meta {
      font-size: 0.8rem;
      color: #6c757d;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .relationship {
      font-size: 0.7rem;
      background: #e9ecef;
      padding: 0.25rem 0.5rem;
      border-radius: 1rem;
      margin-left: auto;
    }
  }
`;

const RelationshipPanel = styled.div`
  padding: 1.5rem;
  height: 100%;
  overflow-y: auto;

  h3 {
    font-size: 1.25rem;
    font-weight: 500;
    color: #212529;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
`;

const RelationshipCard = styled(Card)`
  &&& {
    width: 100%;
    margin-bottom: 1rem !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02) !important;
    border: 1px solid rgba(231, 234, 237, 0.7) !important;
    transition: all 0.2s ease;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.05) !important;
      border-color: #2185d0 !important;
    }

    .content {
      padding: 1.25rem !important;
    }
  }
`;

const RelationshipType = styled.div`
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 500;
  color: #2185d0;
  background: rgba(33, 133, 208, 0.1);
  padding: 0.25rem 0.75rem;
  border-radius: 1rem;
  margin-bottom: 0.75rem;
`;

const DocumentKnowledgeBase: React.FC<DocumentKnowledgeBaseProps> = ({
  documentId,
  corpusId,
  onClose,
}) => {
  const auth_token = useReactiveVar(authToken);
  const user_obj = useReactiveVar(userObj);
  const [showGraph, setShowGraph] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  const [newMessage, setNewMessage] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | undefined
  >();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);

  // Chat messages we display (initially from GET_CONVERSATIONS, plus any new tokens from WebSocket)
  const [chat, setChat] = useState<ChatMessageProps[]>([]);

  // WebSocket reference
  const socketRef = useRef<WebSocket | null>(null);

  // Fetch everything needed for this knowledge base
  const { data: knowledgeData } = useQuery<
    GetDocumentKnowledgeBaseOutputs,
    GetDocumentKnowledgeBaseInputs
  >(GET_DOCUMENT_KNOWLEDGE_BASE, {
    variables: {
      documentId,
      corpusId,
    },
    skip: !documentId || !corpusId,
  });

  // Fetch conversations
  const { data: conversationData } = useQuery<{
    conversations: ConversationTypeConnection;
  }>(GET_CONVERSATIONS, {
    variables: {
      documentId,
      corpusId,
    },
    skip: !documentId || !corpusId,
  });

  // Document metadata
  const metadata = knowledgeData?.document ?? {
    title: "Loading...",
    fileType: "",
    creator: { email: "" },
    created: new Date().toISOString(),
  };

  // Build a minimal conversation list for the selector
  const conversations = conversationData?.conversations?.edges
    ?.map((edge) => {
      const node = edge?.node;
      if (!node) return null;
      return {
        id: node.id,
        title: node.title,
        createdAt: node.createdAt,
        creator: node.creator,
        messageCount: node.chatMessages?.edges?.length || 0,
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    title?: string;
    createdAt: string;
    creator: { email: string };
    messageCount?: number;
  }>;

  // Determine which conversation is selected
  const selectedConversation = conversationData?.conversations?.edges?.find(
    (edge) => edge?.node?.id === selectedConversationId
  )?.node;

  // Helper to transform the GraphQL chat messages to local ChatMessageProps
  const transformGraphQLMessages = React.useCallback((): ChatMessageProps[] => {
    if (!selectedConversation) return [];
    const edges = selectedConversation.chatMessages?.edges || [];
    return edges.map(({ node }: any) => ({
      user: node.creator.email,
      content: node.content,
      timestamp: new Date(node.createdAt).toLocaleString(),
      isAssistant: node.msgType === "ASSISTANT" || node.msgType === "LLM",
      sources:
        node.sourceAnnotations?.edges?.map(({ node: annotation }: any) => ({
          text: annotation.rawText,
          onClick: () => console.log("Navigate to annotation", annotation.id),
        })) || [],
    }));
  }, [selectedConversation]);

  // On initial load or if the user changes conversation, update chat from GraphQL
  useEffect(() => {
    if (!selectedConversation) return;
    setChat(transformGraphQLMessages());
  }, [selectedConversation, transformGraphQLMessages]);

  // Automatically pick first conversation if not set
  useEffect(() => {
    if (!selectedConversationId && conversations?.length) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, selectedConversationId]);

  // Create new conversation (TODO: implement an actual mutation)
  const handleCreateNewConversation = () => {
    console.log("Create new conversation (mutation TBD)");
  };

  /**
   * --------------------------
   *  WebSocket Setup & Events
   * --------------------------
   */
  useEffect(() => {
    // If user is logged in & we have a token, connect to the WS
    const userIsAuthenticated = !!(auth_token && user_obj);

    // If no doc, no corpus, or not authenticated, skip
    if (!documentId || !corpusId || !userIsAuthenticated) return;

    // Socket URL (example)
    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${wsProtocol}://${window.location.host}/ws/document/${documentId}?token=${auth_token}`;

    console.log("Connecting to WebSocket at:", wsUrl);

    socketRef.current = new WebSocket(wsUrl);

    const ws = socketRef.current;

    // Listen for open event
    ws.onopen = () => {
      console.log("WebSocket connected");
    };

    // Listen for message events
    ws.onmessage = (event) => {
      try {
        const messageData = JSON.parse(event.data);
        if (!messageData) return;

        const { type: msgType, content, data } = messageData;

        switch (msgType) {
          case "ASYNC_START":
            // Server signals beginning of a streaming response
            break;
          case "ASYNC_CONTENT":
            // Intermediate streaming token
            appendStreamingTokenToChat(content);
            break;
          case "ASYNC_FINISH":
            // Final content of the streaming response
            finalizeStreamingResponse(content, data?.sources || "");
            break;
          case "SYNC_CONTENT":
            // Single (non-streaming) message from server
            finalizeSyncResponse(content, data?.sources || "");
            break;
          default:
            console.warn("Unknown message type:", msgType);
            break;
        }
      } catch (err) {
        console.error("Failed to parse websocket message:", err);
      }
    };

    // Listen for close event
    ws.onclose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason);
    };

    // Listen for error event
    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    // Cleanup on unmount
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [documentId, corpusId, user_obj, auth_token]);

  // Helper: handle partial streaming tokens from server
  const appendStreamingTokenToChat = (token: string) => {
    if (!token) return;
    setChat((prev) => {
      // If last message is an "assistant" streaming message, append the new token
      if (
        prev.length &&
        prev[prev.length - 1].isAssistant &&
        !prev[prev.length - 1].sources
      ) {
        const updatedLast = {
          ...prev[prev.length - 1],
          content: prev[prev.length - 1].content + token,
        };
        return [...prev.slice(0, -1), updatedLast];
      } else {
        // Otherwise, add a new message
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

  // Helper: finalize streaming messages
  const finalizeStreamingResponse = (content: string, sources: string) => {
    setChat((prev) => {
      if (!prev.length) return prev;
      // Update the last assistant message with final streaming content
      const updatedLast = {
        ...prev[prev.length - 1],
        content: content,
      };
      return [...prev.slice(0, -1), updatedLast];
    });
  };

  // Helper: handle single (non-streaming) response
  const finalizeSyncResponse = (content: string, sources: string) => {
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

  // Send a message over the WebSocket
  const sendMessageOverSocket = React.useCallback(() => {
    const trimmed = newMessage.trim();
    if (!trimmed || !socketRef.current) return;

    // Show user message immediately in the chat
    setChat((prev) => [
      ...prev,
      {
        user: user_obj?.email || "You",
        content: trimmed,
        timestamp: new Date().toLocaleString(),
        isAssistant: false,
      },
    ]);

    // Send JSON with a "query" field
    const payload = {
      query: trimmed,
    };
    socketRef.current.send(JSON.stringify(payload));
    setNewMessage("");
  }, [newMessage, user_obj?.email]);

  // We'll render notes from real data instead of dummyNotes
  const notes = knowledgeData?.document?.allNotes ?? [];

  // We'll render related docs from real data instead of dummyRelatedDocs
  // For this example, we treat any doc in allDocRelationships where the current doc is "source"
  // or "target" as "related." You can refine the logic as needed.
  const docRelationships = knowledgeData?.document?.allDocRelationships ?? [];

  // Update useEffect to show/hide right panel based on activeTab
  useEffect(() => {
    setShowRightPanel(
      ["chat", "notes", "metadata", "relationships"].includes(activeTab)
    );
  }, [activeTab]);

  return (
    <FullScreenModal open={true} onClose={onClose} closeIcon>
      <HeaderContainer>
        <div>
          <Header as="h2" style={{ margin: 0 }}>
            {metadata.title}
          </Header>
          <MetadataRow>
            <span>
              <FileType size={16} /> {metadata.fileType}
            </span>
            <span>
              <User size={16} /> {metadata.creator?.email}
            </span>
            <span>
              <Calendar size={16} /> Created:{" "}
              {new Date(metadata.created).toLocaleDateString()}
            </span>
          </MetadataRow>
        </div>
        <ControlButtonGroup>
          <ControlButton onClick={() => setShowGraph(true)}>
            <Network size={16} />
          </ControlButton>
          <ControlButton>
            <Eye size={16} />
          </ControlButton>
          <ControlButton>
            <Edit2 size={16} />
          </ControlButton>
          <ControlButton>
            <Download size={16} />
          </ControlButton>
          <ControlButton>
            <History size={16} />
          </ControlButton>
        </ControlButtonGroup>
      </HeaderContainer>

      <ContentArea>
        <TabsColumn
          collapsed={sidebarCollapsed}
          onMouseEnter={() => setSidebarCollapsed(false)}
          onMouseLeave={() => setSidebarCollapsed(true)}
        >
          <TabButton
            active={activeTab === "chat"}
            onClick={() => setActiveTab("chat")}
            collapsed={sidebarCollapsed}
          >
            <MessageSquare size={18} />
            <span>Chat</span>
          </TabButton>
          <TabButton
            active={activeTab === "summary"}
            onClick={() => setActiveTab("summary")}
            collapsed={sidebarCollapsed}
          >
            <FileText size={18} />
            <span>Summary</span>
          </TabButton>
          <TabButton
            active={activeTab === "notes"}
            onClick={() => setActiveTab("notes")}
            collapsed={sidebarCollapsed}
          >
            <Notebook size={18} />
            <span>Notes</span>
          </TabButton>
          <TabButton
            active={activeTab === "metadata"}
            onClick={() => setActiveTab("metadata")}
            collapsed={sidebarCollapsed}
          >
            <Database size={18} />
            <span>Metadata</span>
          </TabButton>
          <TabButton
            active={activeTab === "relationships"}
            onClick={() => setActiveTab("relationships")}
            collapsed={sidebarCollapsed}
          >
            <ChartNetwork size={18} />
            <span>Relationships</span>
          </TabButton>
        </TabsColumn>

        <MainContent>
          <DocumentContent>
            <h1>{metadata.title}</h1>

            {/* Document Annotations */}
            {knowledgeData?.document?.allAnnotations?.map((annotation: any) => (
              <div key={annotation.id} className="mb-6">
                <div className="text-sm text-gray-500 mb-2">
                  {annotation.annotationLabel.text}
                </div>
                <div className="prose">{annotation.rawText}</div>
              </div>
            ))}

            {/* Markdown Summary */}
            {knowledgeData?.document?.mdSummaryFile && (
              <div className="prose max-w-none mt-8">
                <ReactMarkdown>
                  {knowledgeData.document.mdSummaryFile}
                </ReactMarkdown>
              </div>
            )}
          </DocumentContent>
        </MainContent>

        <AnimatePresence>
          {showRightPanel && (
            <SlidingPanel
              initial={{ transform: "translateX(100%)", opacity: 0 }}
              animate={{ transform: "translateX(0%)", opacity: 1 }}
              exit={{ transform: "translateX(100%)", opacity: 0 }}
              transition={{
                duration: 0.3,
                ease: [0.4, 0, 0.2, 1],
                opacity: {
                  duration: 0.2,
                },
              }}
            >
              {activeTab === "chat" && (
                <ChatContainer>
                  <ConversationSelector
                    conversations={conversations}
                    selectedId={selectedConversationId}
                    onSelect={setSelectedConversationId}
                    onCreateNew={handleCreateNewConversation}
                  />
                  <div style={{ flex: 1, overflow: "auto", padding: "1rem" }}>
                    {chat.map((msg, idx) => (
                      <ChatMessage key={idx} {...msg} />
                    ))}
                  </div>
                  <ChatInputContainer>
                    <div style={{ position: "relative" }}>
                      <ChatInput
                        value={newMessage}
                        onChange={(e: {
                          target: { value: React.SetStateAction<string> };
                        }) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        action
                      />
                      <SendButton primary icon onClick={sendMessageOverSocket}>
                        <Send size={16} />
                      </SendButton>
                    </div>
                  </ChatInputContainer>
                </ChatContainer>
              )}

              {activeTab === "notes" && (
                <div className="p-4 space-y-4 overflow-y-auto h-full">
                  {notes.map((note) => (
                    <Card key={note.id} fluid>
                      <Card.Content>
                        <div className="flex justify-between items-start mb-3">
                          <div className="text-sm text-gray-500">
                            <span className="font-medium text-gray-700">
                              {note.creator.email}
                            </span>
                            <div>{new Date(note.created).toLocaleString()}</div>
                          </div>
                        </div>
                        <div className="prose max-w-none">
                          {/* If note.title is used, we can display it, e.g. <h4>{note.title}</h4> */}
                          {note.content}
                        </div>
                      </Card.Content>
                    </Card>
                  ))}
                </div>
              )}

              {activeTab === "metadata" && (
                <div className="p-4 space-y-6">
                  <div>
                    <h3 className="font-medium mb-2">Document Details</h3>
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="text-gray-500">File Type:</span>
                        <p>{metadata.fileType}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Uploader:</span>
                        <p>{metadata.creator?.email}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Created:</span>
                        <p>{new Date(metadata.created).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "relationships" && (
                <RelationshipPanel>
                  <h3>
                    <ChartNetwork size={20} />
                    Document Relationships
                  </h3>
                  {docRelationships.map((rel) => {
                    const otherDoc =
                      rel.sourceDocument.id === documentId
                        ? rel.targetDocument
                        : rel.sourceDocument;

                    return (
                      <RelationshipCard key={rel.id}>
                        <Card.Content>
                          <RelationshipType>
                            {rel.relationshipType}
                          </RelationshipType>
                          <Card.Header style={{ marginBottom: "0.5rem" }}>
                            {otherDoc.title || "Untitled Document"}
                          </Card.Header>
                          <Card.Meta>
                            <div
                              style={{
                                display: "flex",
                                gap: "1rem",
                                color: "#6c757d",
                              }}
                            >
                              <span>
                                <FileType
                                  size={14}
                                  style={{ marginRight: "0.25rem" }}
                                />
                                {otherDoc.fileType}
                              </span>
                              <span>
                                <User
                                  size={14}
                                  style={{ marginRight: "0.25rem" }}
                                />
                                {otherDoc.creator?.email}
                              </span>
                            </div>
                          </Card.Meta>
                          {rel.annotationLabel && (
                            <Card.Description style={{ marginTop: "0.75rem" }}>
                              {rel.annotationLabel.text}
                            </Card.Description>
                          )}
                        </Card.Content>
                      </RelationshipCard>
                    );
                  })}
                </RelationshipPanel>
              )}
            </SlidingPanel>
          )}
        </AnimatePresence>
      </ContentArea>

      {/* Update the Graph Modal to be more minimal */}
      <Modal
        open={showGraph}
        onClose={() => setShowGraph(false)}
        size="large"
        basic
      >
        <Modal.Content>{/* Your graph visualization content */}</Modal.Content>
        <Modal.Actions>
          <ControlButton onClick={() => setShowGraph(false)}>
            <X size={16} />
          </ControlButton>
        </Modal.Actions>
      </Modal>
    </FullScreenModal>
  );
};

export default DocumentKnowledgeBase;
