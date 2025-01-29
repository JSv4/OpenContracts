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
 *
 * Responsive Enhancements:
 *   - The right sidebar uses a clamp-based width for medium screens, then switches
 *     to full-width on very small screens to prevent overflow.
 *   - Child content inside the sidebar is scrollable without causing horizontal overflow.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useReactiveVar } from "@apollo/client";
import { Card, Button, Input, Segment, Header, Modal } from "semantic-ui-react";
import {
  MessageSquare,
  FileText,
  Edit2,
  Download,
  History,
  Notebook,
  Database,
  User,
  Calendar,
  Send,
  Eye,
  Network,
  Plus,
  Clock,
  X,
  ChartNetwork,
  FileType,
  ArrowLeft,
} from "lucide-react";
import {
  GET_CONVERSATIONS,
  GET_DOCUMENT_KNOWLEDGE_BASE,
  GetDocumentKnowledgeBaseInputs,
  GetDocumentKnowledgeBaseOutputs,
  GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS,
  GetDocumentKnowledgeAndAnnotationsInput,
  GetDocumentKnowledgeAndAnnotationsOutput,
} from "../../../graphql/queries";
import { getDocumentRawText, getPawlsLayer } from "../../annotator/api/rest";
import {
  ConversationTypeConnection,
  LabelType,
} from "../../../types/graphql-api";
import { ChatMessage, ChatMessageProps } from "../../widgets/chat/ChatMessage";
import { authToken, userObj } from "../../../graphql/cache";
import styled, { keyframes } from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import {
  AnalysisType,
  ExtractType,
  DatacellType,
  ColumnType,
} from "../../../types/graphql-api";
import {
  DocumentViewer,
  PDFContainer,
} from "../../annotator/display/viewer/DocumentViewer";
import { PDFDocumentLoadingTask } from "pdfjs-dist";
import { useUISettings } from "../../annotator/hooks/useUISettings";
import useWindowDimensions from "../../hooks/WindowDimensionHook";
import { PDFPageInfo } from "../../annotator/types/pdf";
import { Token, ViewState } from "../../types";
import { toast } from "react-toastify";
import {
  useDocText,
  useDocumentType,
  usePages,
  usePageTokenTextMaps,
  usePdfDoc,
  useSearchText,
} from "../../annotator/context/DocumentAtom";
import { createTokenStringSearch } from "../../annotator/utils";
import {
  convertToDocTypeAnnotations,
  convertToServerAnnotation,
} from "../../../utils/transform";
import {
  PdfAnnotations,
  RelationGroup,
} from "../../annotator/types/annotations";
import {
  docTypeAnnotationsAtom,
  pdfAnnotationsAtom,
  structuralAnnotationsAtom,
} from "../../annotator/context/AnnotationAtoms";
import { useCorpusState } from "../../annotator/context/CorpusAtom";
import { useAtom } from "jotai";
import { useInitialAnnotations } from "../../annotator/hooks/AnnotationHooks";
import { LabelSelector } from "../../annotator/labels/label_selector/LabelSelector";
import { PDF } from "../../annotator/renderers/pdf/PDF";
import TxtAnnotatorWrapper from "../../annotator/components/wrappers/TxtAnnotatorWrapper";
import { useAnnotationRefs } from "../../annotator/hooks/useAnnotationRefs";
import { DocTypeLabelDisplay } from "../../annotator/labels/doc_types/DocTypeLabelDisplay";
import { useAnnotationControls } from "../../annotator/context/UISettingsAtom";
import { RelationshipList } from "../../annotator/display/components/RelationshipList";
import { AnnotationList } from "../../annotator/display/components/AnnotationList";
import LayerSwitcher from "../../widgets/buttons/LayerSelector";
import DocNavigation from "../../widgets/buttons/DocNavigation";
import {
  ChatContainer,
  ChatInput,
  ChatInputContainer,
  ConnectionStatus,
  ConversationCount,
  ConversationIndicator,
  ConversationItem,
  ConversationList,
  ConversationSelector,
  ErrorMessage,
  NewChatButton,
  SendButton,
} from "./ChatContainers";
import {
  ContentArea,
  ControlButton,
  ControlButtonGroup,
  ControlButtonGroupLeft,
  EmptyState,
  HeaderContainer,
  LoadingPlaceholders,
  MainContentArea,
  MetadataRow,
  RelationshipCard,
  RelationshipPanel,
  RelationshipType,
  SlidingPanel,
  SummaryContent,
  TabButton,
  TabsColumn,
} from "./StyledContainers";
import { NoteModal, NotesGrid, PostItNote, NotesHeader } from "./StickyNotes";

const pdfjsLib = require("pdfjs-dist");

// Setting worker path to worker bundle.
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.js`;

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

interface DocumentKnowledgeBaseProps {
  documentId: string;
  corpusId: string;
  onClose?: () => void;
}

// Get WebSocket URL from environment or fallback to window.location for production
const getWebSocketUrl = (documentId: string, token: string): string => {
  // Use environment variable if defined (for development)
  const wsBaseUrl =
    process.env.REACT_APP_WS_URL ||
    process.env.REACT_APP_API_URL ||
    `${window.location.protocol === "https:" ? "wss" : "ws"}://${
      window.location.host
    }`;
  const normalizedBaseUrl = wsBaseUrl
    .replace(/\/+$/, "")
    .replace(/^http/, "ws")
    .replace(/^https/, "wss");

  return `${normalizedBaseUrl}/ws/document/${encodeURIComponent(
    documentId
  )}/query/?token=${encodeURIComponent(token)}`;
};

// Create a wrapper component to handle the fallback
const SafeMarkdown: React.FC<{ children: string }> = ({ children }) => {
  try {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    );
  } catch (error) {
    console.warn(
      "Failed to render with remarkGfm, falling back to basic markdown:",
      error
    );
    return <ReactMarkdown>{children}</ReactMarkdown>;
  }
};

// Panels from the old "AnnotatorSidebar":
const AnnotationsPanel: React.FC = () => {
  return (
    <div className="sidebar__annotations" style={{ padding: "1rem" }}>
      <AnnotationList read_only={false} />
    </div>
  );
};

const RelationsPanel: React.FC = () => {
  return (
    <div className="sidebar__relation__annotation" style={{ padding: "1rem" }}>
      <RelationshipList read_only={false} />
    </div>
  );
};

const LabelsPanel: React.FC = () => {
  return <AnnotationList read_only={false} />;
};

const DocumentKnowledgeBase: React.FC<DocumentKnowledgeBaseProps> = ({
  documentId,
  corpusId,
  onClose,
}) => {
  const { width } = useWindowDimensions();
  const {
    setProgress,
    progress,
    zoomLevel,
    setShiftDown,
    readOnly,
    setZoomLevel,
    isSidebarVisible,
    setSidebarVisible,
  } = useUISettings({
    width,
  });
  const [viewComponents, setViewComponents] = useState<JSX.Element>(<></>);
  const auth_token = useReactiveVar(authToken);
  const user_obj = useReactiveVar(userObj);
  const [showGraph, setShowGraph] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("summary");

  // NEW: a layer to toggle between "knowledge" (summary) and "document" (PDF/TXT).
  const [activeLayer, setActiveLayer] = useState<"knowledge" | "document">(
    "knowledge"
  );

  const [newMessage, setNewMessage] = useState("");
  const [showSelector, setShowSelector] = useState(false);
  const [viewState, setViewState] = useState<ViewState>(ViewState.LOADING);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | undefined
  >();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [chat, setChat] = useState<ChatMessageProps[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const [wsReady, setWsReady] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);

  const { setDocumentType } = useDocumentType();
  const { setDocText } = useDocText();
  const {
    pageTokenTextMaps: pageTextMaps,
    setPageTokenTextMaps: setPageTextMaps,
  } = usePageTokenTextMaps();
  const { pages, setPages } = usePages();
  const [, setPdfAnnotations] = useAtom(pdfAnnotationsAtom);
  const [, setStructuralAnnotations] = useAtom(structuralAnnotationsAtom);
  const [, setDocTypeAnnotations] = useAtom(docTypeAnnotationsAtom);
  const { setCorpus } = useCorpusState();
  const { setInitialAnnotations } = useInitialAnnotations();
  const { searchText, setSearchText } = useSearchText();
  const { scrollContainerRef, registerRef } = useAnnotationRefs();
  const { activeSpanLabel, setActiveSpanLabel } = useAnnotationControls();

  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [markdownError, setMarkdownError] = useState<boolean>(false);

  const containerRefCallback = useCallback(
    (node: HTMLDivElement | null) => {
      if (node !== null) {
        scrollContainerRef.current = node;
        registerRef("scrollContainer", scrollContainerRef);
      }
    },
    [scrollContainerRef, registerRef]
  );

  const handleKeyUpPress = useCallback(
    (event: { keyCode: any }) => {
      const { keyCode } = event;
      if (keyCode === 16) {
        setShiftDown(false);
      }
    },
    [setShiftDown]
  );

  const handleKeyDownPress = useCallback(
    (event: { keyCode: any }) => {
      const { keyCode } = event;
      if (keyCode === 16) {
        setShiftDown(true);
      }
    },
    [setShiftDown]
  );

  // Fetch combined knowledge & annotation data
  const { data: combinedData, loading } = useQuery<
    GetDocumentKnowledgeAndAnnotationsOutput,
    GetDocumentKnowledgeAndAnnotationsInput
  >(GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS, {
    variables: {
      documentId,
      corpusId,
      analysisId: undefined,
    },
    onCompleted: (data) => {
      setDocumentType(data.document.fileType ?? "");
      if (
        data.document.fileType === "application/pdf" &&
        data.document.pdfFile
      ) {
        setViewComponents(<PDF read_only={true} />);
        const loadingTask: PDFDocumentLoadingTask = pdfjsLib.getDocument(
          data.document.pdfFile
        );
        loadingTask.onProgress = (p: { loaded: number; total: number }) => {
          setProgress(Math.round((p.loaded / p.total) * 100));
        };

        Promise.all([
          loadingTask.promise,
          getPawlsLayer(data.document.pawlsParseFile || ""),
        ])
          .then(([pdfDocProxy, pawlsData]) => {
            setPdfDoc(pdfDocProxy);

            const loadPages: Promise<PDFPageInfo>[] = [];
            for (let i = 1; i <= pdfDocProxy.numPages; i++) {
              loadPages.push(
                pdfDocProxy.getPage(i).then((p) => {
                  let pageTokens: Token[] = [];
                  if (pawlsData.length === 0) {
                    toast.error(
                      "Token layer isn't available for this document... annotations can't be displayed."
                    );
                  } else {
                    const pageIndex = p.pageNumber - 1;
                    pageTokens = pawlsData[pageIndex].tokens;
                  }
                  return new PDFPageInfo(p, pageTokens, zoomLevel);
                }) as unknown as Promise<PDFPageInfo>
              );
            }
            return Promise.all(loadPages);
          })
          .then((loadedPages) => {
            setPages(loadedPages);
            let { doc_text, string_index_token_map } =
              createTokenStringSearch(loadedPages);
            setPageTextMaps({
              ...string_index_token_map,
              ...pageTextMaps,
            });
            setDocText(doc_text);
            // Loaded state set by useEffect for state change in doc state store.
          })
          .catch((err) => {
            console.error("Error loading PDF document:", err);
            setViewState(ViewState.ERROR);
          });
      } else if (
        data.document.fileType === "application/txt" ||
        data.document.fileType === "text/plain"
      ) {
        console.debug("React to TXT document");

        setViewComponents(
          <TxtAnnotatorWrapper readOnly={true} allowInput={false} />
        );

        Promise.all([getDocumentRawText(data.document.txtExtractFile || "")])
          .then(([txt]) => {
            setDocText(txt);
            setViewState(ViewState.LOADED);
          })
          .catch((err) => {
            console.error("Error loading TXT document:", err);
            setViewState(ViewState.ERROR);
          });
      } else {
        console.error("Unexpected filetype: ", data.document.fileType);
        setViewComponents(
          <div>
            <p>Unsupported filetype: {data.document.fileType}</p>
          </div>
        );
      }
    },
    skip: !documentId || !corpusId,
  });

  const metadata = combinedData?.document ?? {
    title: "Loading...",
    fileType: "",
    creator: { email: "" },
    created: new Date().toISOString(),
  };

  const conversations =
    combinedData?.document?.allDocRelationships
      ?.map((rel) => {
        const node = rel.sourceDocument || rel.targetDocument;
        if (!node) return null;
        return {
          id: node.id,
          title: node.title,
          createdAt: rel.created,
          creator: node.creator,
          messageCount: node.chatMessages?.edges?.length || 0,
        };
      })
      .filter(Boolean) || [];

  const selectedConversation =
    combinedData?.document?.allDocRelationships?.find(
      (rel) =>
        rel.sourceDocument?.id === selectedConversationId ||
        rel.targetDocument?.id === selectedConversationId
    )?.sourceDocument ||
    combinedData?.document?.allDocRelationships?.find(
      (rel) =>
        rel.sourceDocument?.id === selectedConversationId ||
        rel.targetDocument?.id === selectedConversationId
    )?.targetDocument;

  const transformGraphQLMessages = React.useCallback((): ChatMessageProps[] => {
    if (!selectedConversation) return [];
    const edges = selectedConversation.chatMessages?.edges || [];
    return edges.map(({ node }: any) => ({
      user: node.creator.email,
      content: node.content,
      timestamp: new Date(node.createdAt).toLocaleString(),
      isAssistant: node.msgType === "ASSISTANT" || node.msgType === "LLM",
      sources:
        node.sourceAnnotations?.edges?.map(({ node: ann }: any) => ({
          text: ann.rawText,
          onClick: () => console.log("Navigate to annotation", ann.id),
        })) || [],
    }));
  }, [selectedConversation]);

  useEffect(() => {
    if (!selectedConversation) return;
    setChat(transformGraphQLMessages());
  }, [selectedConversation, transformGraphQLMessages]);

  useEffect(() => {
    if (!selectedConversationId && conversations.length > 0) {
      setSelectedConversationId(conversations[0]?.id || undefined);
    }
  }, [conversations, selectedConversationId]);

  const handleCreateNewConversation = () => {
    console.log("Create new conversation (mutation TBD)");
  };

  useEffect(() => {
    window.addEventListener("keyup", handleKeyUpPress);
    window.addEventListener("keydown", handleKeyDownPress);
    return () => {
      window.removeEventListener("keyup", handleKeyUpPress);
      window.removeEventListener("keydown", handleKeyDownPress);
    };
  }, [handleKeyUpPress, handleKeyDownPress]);

  useEffect(() => {
    const userIsAuthenticated = !!(auth_token && user_obj);
    if (!documentId || !corpusId || !userIsAuthenticated) return;

    const wsUrl = getWebSocketUrl(documentId, auth_token);
    socketRef.current = new WebSocket(wsUrl);
    const ws = socketRef.current;

    ws.onopen = () => {
      setWsReady(true);
      setWsError(null);
    };

    ws.onmessage = (event) => {
      try {
        const messageData = JSON.parse(event.data);
        if (!messageData) return;
        const { type: msgType, content, data } = messageData;
        switch (msgType) {
          case "ASYNC_START":
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

    ws.onclose = (event) => {
      setWsReady(false);
      setWsError("Connection closed. Please try again.");
    };

    ws.onerror = (error) => {
      setWsReady(false);
      setWsError("Failed to connect. Please try again.");
    };

    return () => {
      if (ws) {
        setWsReady(false);
        ws.close();
      }
    };
  }, [documentId, corpusId, user_obj, auth_token]);

  const appendStreamingTokenToChat = (token: string) => {
    if (!token) return;
    setChat((prev) => {
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

  const finalizeStreamingResponse = (content: string, sources: string) => {
    setChat((prev) => {
      if (!prev.length) return prev;
      const updatedLast = {
        ...prev[prev.length - 1],
        content,
      };
      return [...prev.slice(0, -1), updatedLast];
    });
  };

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

  const sendMessageOverSocket = React.useCallback(() => {
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

  const notes = combinedData?.document?.allNotes ?? [];
  const docRelationships = combinedData?.document?.allDocRelationships ?? [];

  // Load MD summary if available
  useEffect(() => {
    const fetchMarkdownContent = async () => {
      if (!combinedData?.document?.mdSummaryFile) {
        setMarkdownContent(null);
        return;
      }
      try {
        const response = await fetch(combinedData.document.mdSummaryFile);
        if (!response.ok) throw new Error("Failed to fetch markdown content");
        const text = await response.text();
        setMarkdownContent(text);
        setMarkdownError(false);
      } catch (error) {
        console.error("Error fetching markdown content:", error);
        setMarkdownContent(null);
        setMarkdownError(true);
      }
    };
    fetchMarkdownContent();
  }, [combinedData?.document?.mdSummaryFile]);

  const [selectedNote, setSelectedNote] = useState<(typeof notes)[0] | null>(
    null
  );

  /* doc viewer (pdf or text snippet) */
  const { setPdfDoc } = usePdfDoc();

  // Minimal arrays of tabs for each layer
  const knowledgeTabs = [
    { key: "summary", label: "Summary", icon: <FileText size={18} /> },
    { key: "chat", label: "Chat", icon: <MessageSquare size={18} /> },
    { key: "notes", label: "Notes", icon: <Notebook size={18} /> },
    {
      key: "relationships",
      label: "Doc Relationships",
      icon: <ChartNetwork size={18} />,
    },
  ];
  const documentTabs = [
    { key: "chat", label: "Chat", icon: <MessageSquare size={18} /> },
    { key: "notes", label: "Notes", icon: <Notebook size={18} /> },
    {
      key: "relationships",
      label: "Doc Relationships",
      icon: <ChartNetwork size={18} />,
    },
    { key: "annotations", label: "Annotations", icon: <FileText size={18} /> },
    {
      key: "relations",
      label: "Annotation Relationships",
      icon: <ChartNetwork size={18} />,
    },
    { key: "labels", label: "Labels", icon: <Database size={18} /> },
  ];

  // Decide which tabs to show based on active layer
  const visibleTabs =
    activeLayer === "knowledge" ? knowledgeTabs : documentTabs;

  // Decide if we show the right panel
  useEffect(() => {
    if (!activeTab) {
      // If no tab is selected, always hide the panel
      setShowRightPanel(false);
    } else if (activeLayer === "knowledge") {
      setShowRightPanel(activeTab !== "summary");
    } else {
      // for the "document" layer, any tab means show the right panel
      setShowRightPanel(
        [
          "chat",
          "notes",
          "relationships",
          "annotations",
          "relations",
          "labels",
        ].includes(activeTab)
      );
    }
  }, [activeLayer, activeTab]);

  // The content for the right panel
  const rightPanelContent = (() => {
    switch (activeTab) {
      case "chat":
        return (
          <ChatContainer>
            <ConversationIndicator>
              <AnimatePresence>
                {showSelector && (
                  <ConversationSelector
                    initial={{ opacity: 0, scale: 0.9, x: 20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9, x: 20 }}
                    transition={{ type: "spring", damping: 20, stiffness: 300 }}
                  >
                    <ConversationList>
                      {conversations.map(
                        (conv) =>
                          conv && (
                            <ConversationItem
                              key={conv.id}
                              onClick={() => setSelectedConversationId(conv.id)}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <div className="title">
                                <MessageSquare size={14} />
                                {conv.title || "Untitled Conversation"}
                                {conv.messageCount && (
                                  <span className="message-count">
                                    {conv.messageCount}
                                  </span>
                                )}
                              </div>
                              <div className="meta">
                                <Clock size={12} />
                                {new Date(conv.createdAt).toLocaleDateString()}
                                <User size={12} />
                                {conv.creator?.email}
                              </div>
                            </ConversationItem>
                          )
                      )}
                    </ConversationList>
                    <NewChatButton onClick={handleCreateNewConversation}>
                      <Plus size={16} />
                      New Chat
                    </NewChatButton>
                  </ConversationSelector>
                )}
              </AnimatePresence>
              <ConversationCount onClick={() => setShowSelector(!showSelector)}>
                {conversations.length}
              </ConversationCount>
            </ConversationIndicator>
            <div style={{ flex: 1, overflow: "auto", padding: "1rem" }}>
              {chat.map((msg, idx) => (
                <ChatMessage key={idx} {...msg} />
              ))}
            </div>
            <ChatInputContainer>
              {wsError ? (
                <ErrorMessage>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    {wsError}
                    <Button
                      size="small"
                      onClick={() => window.location.reload()}
                      style={{ marginLeft: "0.75rem" }}
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
                  transition={{ duration: 0.2 }}
                >
                  {wsReady ? "Connected" : "Connecting..."}
                </ConnectionStatus>
              )}
              <ChatInput
                value={newMessage}
                onChange={(e: {
                  target: { value: React.SetStateAction<string> };
                }) => setNewMessage(e.target.value)}
                placeholder={
                  wsReady ? "Type your message..." : "Waiting for connection..."
                }
                disabled={!wsReady}
                onKeyPress={(e: { key: string }) =>
                  e.key === "Enter" && sendMessageOverSocket()
                }
              />
              <SendButton
                onClick={sendMessageOverSocket}
                disabled={!wsReady || !newMessage.trim()}
                whileHover={{ scale: 1.05 }}
              >
                <Send size={18} />
              </SendButton>
            </ChatInputContainer>
          </ChatContainer>
        );
      case "notes":
        return (
          <div className="flex-1 overflow-auto">
            <NotesHeader>
              <h3>
                <Notebook size={20} />
                Document Notes
              </h3>
              <div className="meta">
                {notes.length} note{notes.length !== 1 ? "s" : ""}
              </div>
            </NotesHeader>
            {loading ? (
              <LoadingPlaceholders type="notes" />
            ) : notes.length === 0 ? (
              <EmptyState
                icon={<Notebook size={40} />}
                title="No notes yet"
                description="Start adding notes to this document"
              />
            ) : (
              <NotesGrid>
                {notes.map((note, index) => (
                  <PostItNote
                    key={note.id}
                    onClick={() => setSelectedNote(note)}
                    initial={{ opacity: 0, y: 20, rotate: 0 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      rotate:
                        ((index % 3) - 1) * 1.5 + (Math.random() * 1 - 0.5),
                      transition: {
                        opacity: { duration: 0.3 },
                        y: { duration: 0.3 },
                        rotate: { duration: 0.4, ease: "easeOut" },
                      },
                    }}
                    whileHover={{
                      y: -4,
                      rotate: ((index % 3) - 1) * 0.5,
                      transition: { duration: 0.2 },
                    }}
                  >
                    <div className="content">
                      <SafeMarkdown>{note.content}</SafeMarkdown>
                    </div>
                    <div className="meta">
                      {note.creator.email} •{" "}
                      {new Date(note.created).toLocaleDateString()}
                    </div>
                  </PostItNote>
                ))}
              </NotesGrid>
            )}
          </div>
        );
      case "relationships":
        return (
          <div className="p-4 flex-1 flex flex-col">
            {loading ? (
              <LoadingPlaceholders type="relationships" />
            ) : docRelationships.length === 0 ? (
              <EmptyState
                icon={<ChartNetwork size={40} />}
                title="No relationships yet"
                description="Connect this document with others to create relationships"
              />
            ) : (
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
          </div>
        );
      case "annotations":
        return <AnnotationsPanel />;
      case "relations":
        return <RelationsPanel />;
      case "labels":
        return <LabelsPanel />;
      default:
        return null;
    }
  })();

  // The main viewer content:
  let viewerContent: JSX.Element = <></>;
  if (metadata.fileType === "application/pdf") {
    viewerContent = (
      <PDFContainer ref={containerRefCallback}>
        <LabelSelector
          sidebarWidth="0px"
          activeSpanLabel={activeSpanLabel ?? null}
          setActiveLabel={setActiveSpanLabel}
        />
        <DocTypeLabelDisplay />
        <PDF read_only={true} />
      </PDFContainer>
    );
  } else if (
    metadata.fileType === "application/txt" ||
    metadata.fileType === "text/plain"
  ) {
    viewerContent = (
      <PDFContainer ref={containerRefCallback}>
        <LabelSelector
          sidebarWidth="0px"
          activeSpanLabel={activeSpanLabel ?? null}
          setActiveLabel={setActiveSpanLabel}
        />
        <DocTypeLabelDisplay />
        <TxtAnnotatorWrapper readOnly={true} allowInput={false} />
      </PDFContainer>
    );
  } else {
    viewerContent = (
      <div style={{ padding: "2rem" }}>
        {viewState === ViewState.ERROR ? (
          <EmptyState
            icon={<FileText size={40} />}
            title="Unsupported File"
            description="This document type can't be displayed."
          />
        ) : (
          <EmptyState
            icon={<FileText size={40} />}
            title="Loading..."
            description="Please wait for the document to finish loading."
          />
        )}
      </div>
    );
  }

  const layers = [
    {
      id: "knowledge",
      label: "Knowledge Base",
      icon: <Database size={16} />,
      isActive: activeLayer === "knowledge",
      onClick: () => {
        setActiveLayer("knowledge");
        setActiveTab("summary");
      },
    },
    {
      id: "document",
      label: "Document",
      icon: <FileText size={16} />,
      isActive: activeLayer === "document",
      onClick: () => {
        setActiveLayer("document");
        if (
          ![
            "chat",
            "notes",
            "relationships",
            "annotations",
            "relations",
            "labels",
          ].includes(activeTab)
        ) {
          setActiveTab("chat");
        }
      },
    },
  ];

  // Modify the tab click handler to support toggling
  const handleTabClick = (tabKey: string) => {
    if (activeTab === tabKey) {
      // If clicking the active tab, deselect it and close panel
      setActiveTab("");
      setShowRightPanel(false);
    } else {
      // Otherwise, select the new tab
      setActiveTab(tabKey);
      setShowRightPanel(true);
    }
  };

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
      </HeaderContainer>

      <ContentArea>
        {/* LEFT SIDEBAR TABS */}
        <TabsColumn
          collapsed={sidebarCollapsed}
          onMouseEnter={() => setSidebarCollapsed(false)}
          onMouseLeave={() => setSidebarCollapsed(true)}
        >
          {visibleTabs.map((t) => (
            <TabButton
              key={t.key}
              active={activeTab === t.key}
              onClick={() => handleTabClick(t.key)}
              collapsed={sidebarCollapsed}
            >
              {t.icon}
              <span>{t.label}</span>
            </TabButton>
          ))}
        </TabsColumn>

        <MainContentArea>
          {/* The main content depends on which layer is active */}
          {activeLayer === "knowledge" ? (
            <SummaryContent className={showRightPanel ? "dimmed" : ""}>
              {loading ? (
                <LoadingPlaceholders type="summary" />
              ) : markdownContent ? (
                <div className="prose max-w-none">
                  <SafeMarkdown>{markdownContent}</SafeMarkdown>
                </div>
              ) : (
                <EmptyState
                  icon={<FileText size={40} />}
                  title="No summary available"
                  description={
                    markdownError
                      ? "Failed to load the document summary"
                      : "This document doesn't have a summary yet"
                  }
                />
              )}
            </SummaryContent>
          ) : (
            // Document layer
            <div style={{ flex: 1, position: "relative" }}>{viewerContent}</div>
          )}

          {/* FLOATING LAYER SWITCHER (bottom-right) */}

          <LayerSwitcher layers={layers} />

          {/* Floating navigation bar (top-left) */}
          {activeLayer === "document" ? (
            <DocNavigation
              zoomLevel={zoomLevel}
              onZoomIn={() => setZoomLevel(Math.min(zoomLevel + 0.1, 4))}
              onZoomOut={() => setZoomLevel(Math.min(zoomLevel - 0.1, 4))}
              onSearch={setSearchText}
            />
          ) : null}
          {/* Right Panel, if needed */}
          <AnimatePresence>
            {showRightPanel && (
              <SlidingPanel
                initial={{ transform: "translateX(100%)", opacity: 0 }}
                animate={{ transform: "translateX(0%)", opacity: 1 }}
                exit={{ transform: "translateX(100%)", opacity: 0 }}
                transition={{
                  duration: 0.3,
                  ease: [0.4, 0, 0.2, 1],
                  opacity: { duration: 0.2 },
                }}
              >
                <ControlButtonGroupLeft>
                  <ControlButton
                    onClick={() => {
                      setShowRightPanel(false);
                      setActiveTab(""); // Clear the active tab when closing
                    }}
                  >
                    <ArrowLeft color="red" />
                  </ControlButton>
                </ControlButtonGroupLeft>
                {rightPanelContent}
              </SlidingPanel>
            )}
          </AnimatePresence>
        </MainContentArea>
      </ContentArea>

      <Modal
        open={showGraph}
        onClose={() => setShowGraph(false)}
        size="large"
        basic
      >
        <Modal.Content>
          {/* Graph or relationship visualization */}
        </Modal.Content>
        <Modal.Actions>
          <ControlButton onClick={() => setShowGraph(false)}>
            <X size={16} />
          </ControlButton>
        </Modal.Actions>
      </Modal>

      <NoteModal
        closeIcon
        open={!!selectedNote}
        onClose={() => setSelectedNote(null)}
        size="large"
      >
        {selectedNote && (
          <>
            <Modal.Content>
              <SafeMarkdown>{selectedNote.content}</SafeMarkdown>
            </Modal.Content>
            <div className="meta">
              Added by {selectedNote.creator.email} on{" "}
              {new Date(selectedNote.created).toLocaleString()}
            </div>
          </>
        )}
      </NoteModal>
    </FullScreenModal>
  );
};

export default DocumentKnowledgeBase;
