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

    /* Mobile-friendly header */
    @media (max-width: 768px) {
      padding: 1rem !important;

      h2 {
        font-size: 1.25rem;
      }
    }
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

  /* Stack metadata on small screens */
  @media (max-width: 480px) {
    flex-wrap: wrap;
    gap: 0.75rem;

    span {
      font-size: 0.8rem;
    }
  }
`;

const ContentArea = styled.div`
  display: grid;
  grid-template-columns: auto 1fr;
  height: calc(100vh - 90px);
  background: white;
  position: relative;

  /* Stack layout on mobile */
  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
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

    /* Mobile optimization */
    @media (max-width: 768px) {
      width: 100%;
      height: 56px;
      display: flex;
      overflow-x: auto;
      overflow-y: hidden;
      -webkit-overflow-scrolling: touch;
      white-space: nowrap;
      padding: 0.5rem !important;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(231, 234, 237, 0.7) !important;

      /* Hide scrollbar but keep functionality */
      scrollbar-width: none;
      &::-webkit-scrollbar {
        display: none;
      }

      /* Center icons when in mobile mode */
      display: flex;
      justify-content: space-around;
      align-items: center;
    }
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

      svg {
        color: #2185d0;
      }
    }

    svg {
      margin-right: ${(props) =>
        props.collapsed ? "0" : "0.75rem"} !important;
      transition: all 0.2s ease;
      color: ${(props) => {
        // Custom colors for each icon type
        if (props.children[0].type.name === "FileText") return "#4CAF50";
        if (props.children[0].type.name === "MessageSquare") return "#9C27B0";
        if (props.children[0].type.name === "Notebook") return "#FF9800";
        if (props.children[0].type.name === "Database") return "#E91E63";
        if (props.children[0].type.name === "ChartNetwork") return "#2196F3";
        return "#495057"; // default color
      }};
      opacity: 0.75;
    }

    &:hover svg {
      transform: scale(1.1);
      opacity: 1;
    }

    span {
      opacity: ${(props) => (props.collapsed ? 0 : 1)};
      transition: opacity 0.2s ease;
      ${(props) => props.collapsed && "display: none;"}
    }

    /* Mobile-friendly tabs - icons only */
    @media (max-width: 768px) {
      width: 40px !important;
      height: 40px !important;
      padding: 0 !important;
      margin: 0 0.25rem !important;
      border-radius: 12px !important;
      display: flex !important;
      align-items: center;
      justify-content: center;
      background: transparent;

      span {
        display: none !important; /* Hide text labels on mobile */
      }

      svg {
        margin: 0 !important;
        width: 20px;
        height: 20px;
      }

      &.active {
        background: ${(props) =>
          props.theme.colors?.primary || "#2185d0"} !important;
        color: white !important;

        &:before {
          display: none; /* Remove side indicator on mobile */
        }

        svg {
          color: white;
        }
      }

      /* Add subtle hover effect */
      &:hover:not(.active) {
        background: rgba(0, 0, 0, 0.03) !important;
        transform: translateY(-1px);
      }
    }
  }
`;

// Add a tooltip for mobile tabs
const TabTooltip = styled.div`
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;

  /* Only show on mobile */
  @media (min-width: 769px) {
    display: none;
  }
`;

// Update the TabButton component to include tooltips on mobile
const Tab: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon, label, active, onClick }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <TabButton
      collapsed={false}
      active={active}
      onClick={onClick}
      onTouchStart={() => setShowTooltip(true)}
      onTouchEnd={() => setShowTooltip(false)}
    >
      {icon}
      <span>{label}</span>
      {showTooltip && <TabTooltip>{label}</TabTooltip>}
    </TabButton>
  );
};

const MainContentArea = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
  position: relative;
`;

const SummaryContent = styled.div`
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
  transition: all 0.3s ease;

  &.dimmed {
    opacity: 0.4;
    transform: scale(0.98);
    filter: blur(1px);
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

/**
 * SlidingPanel
 *
 * The right sidebar uses a combination of clamp for width on mid-sized screens
 * and goes full-width on small screens. Child elements remain scrollable.
 */
const SlidingPanel = styled(motion.div)`
  position: absolute;
  top: 0;
  right: 0;
  /* For larger screens: at least 320px, up to 65% of total width, max 520px */
  width: clamp(320px, 65%, 520px);
  height: 100%;
  background: white;
  box-shadow: -4px 0 25px rgba(0, 0, 0, 0.05);
  z-index: 80;
  display: flex;
  flex-direction: column;

  /* On screens <= 768px, take the entire width below the tab bar */
  @media (max-width: 768px) {
    width: 100%;
    height: calc(100% - 56px);
    top: 56px;
  }
`;

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  /* Ensure chat messages can scroll without causing horizontal overflows */
  overflow: hidden;
`;

const ChatInputContainer = styled.div`
  padding: 1.5rem;
  border-top: 1px solid rgba(231, 234, 237, 0.7);
  background: white;
  position: relative;

  @media (max-width: 768px) {
    padding: 1rem;
    position: sticky;
    bottom: 0;
    background: white;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
  }
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
      background: white !important;

      &:focus {
        border-color: #2185d0 !important;
        box-shadow: 0 0 0 2px rgba(33, 133, 208, 0.1) !important;
      }

      &:disabled {
        background: rgba(247, 248, 249, 0.7) !important;
        border-color: #e9ecef !important;
        cursor: not-allowed;
        color: #adb5bd !important;
      }
    }
  }
`;

const ErrorMessage = styled.div`
  color: #dc3545;
  font-size: 0.875rem;
  padding: 0.5rem;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(220, 53, 69, 0.1);
  border-radius: 0.5rem;
`;

const SendButton = styled(Button)`
  &&& {
    position: absolute;
    right: 1.75rem;
    bottom: 1.75rem;
    padding: 0.5rem;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #2185d0;
    border: none;
    color: white;
    transition: all 0.2s ease;

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      background: #1678c2;
      box-shadow: 0 4px 8px rgba(33, 133, 208, 0.2);
    }

    &:disabled {
      background: #e9ecef;
      color: #adb5bd;
      cursor: not-allowed;
      transform: none;
    }

    svg {
      width: 1.25rem;
      height: 1.25rem;
      transition: transform 0.2s ease;
    }

    &:hover:not(:disabled) svg {
      transform: translateX(2px);
    }
  }
`;

interface ConnectionStatusProps {
  connected: boolean;
}

const ConnectionStatus = styled(motion.div)<ConnectionStatusProps>`
  position: absolute;
  right: 4.5rem;
  bottom: 1.875rem;
  font-size: 0.875rem;
  color: #adb5bd;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  &::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${(props) => (props.connected ? "#12b886" : "#adb5bd")};
    display: block;
    animation: ${(props) => (props.connected ? "none" : "pulse 2s infinite")};
  }

  @keyframes pulse {
    0% {
      transform: scale(0.95);
      opacity: 0.5;
    }
    50% {
      transform: scale(1.05);
      opacity: 0.8;
    }
    100% {
      transform: scale(0.95);
      opacity: 0.5;
    }
  }
`;

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

const ConversationIndicator = styled(motion.div)`
  position: absolute;
  top: 1rem;
  right: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const ConversationCount = styled(motion.div)`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #2185d0 0%, #1678c2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(33, 133, 208, 0.2);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(33, 133, 208, 0.3);
  }
`;

const ConversationSelector = styled(motion.div)`
  position: absolute;
  top: 0;
  right: 3.5rem;
  background: white;
  border-radius: 1rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  width: 300px;
  overflow: hidden;
  border: 1px solid rgba(231, 234, 237, 0.7);
`;

const ConversationList = styled.div`
  max-height: 400px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: #dee2e6;
    border-radius: 2px;

    &:hover {
      background: #ced4da;
    }
  }
`;

const ConversationItem = styled(motion.button)`
  width: 100%;
  padding: 0.875rem 1rem;
  background: none;
  border: none;
  text-align: left;
  cursor: pointer;
  border-bottom: 1px solid rgba(231, 234, 237, 0.7);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(33, 133, 208, 0.05);
  }

  .title {
    font-weight: 500;
    color: #212529;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .meta {
    font-size: 0.75rem;
    color: #868e96;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .message-count {
    margin-left: auto;
    background: rgba(33, 133, 208, 0.1);
    color: #2185d0;
    padding: 0.125rem 0.5rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 500;
  }
`;

const NewChatButton = styled(motion.button)`
  width: 100%;
  padding: 0.75rem 1rem;
  background: white;
  border: none;
  border-top: 1px solid rgba(231, 234, 237, 0.7);
  color: #2185d0;
  font-weight: 500;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(33, 133, 208, 0.05);
  }

  svg {
    width: 1rem;
    height: 1rem;
  }
`;

// Add these styled components for our shimmer effect
const shimmerAnimation = keyframes`
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
`;

const PlaceholderBase = styled.div`
  background: linear-gradient(90deg, #f0f0f0 0%, #f7f7f7 50%, #f0f0f0 100%);
  background-size: 1000px 100%;
  animation: ${shimmerAnimation} 2s infinite linear;
  border-radius: 8px;
`;

const SummaryPlaceholder = styled.div`
  padding: 3rem;
  max-width: 800px;
  margin: 0 auto;

  ${PlaceholderBase} {
    height: 28px;
    margin-bottom: 1.5rem;

    &:nth-child(1) {
      width: 70%;
    }
    &:nth-child(2) {
      width: 90%;
    }
    &:nth-child(3) {
      width: 85%;
    }
    &:nth-child(4) {
      width: 95%;
    }

    &:last-child {
      margin-bottom: 0;
    }
  }
`;

const NotePlaceholder = styled(motion.div)`
  padding: 2rem;
  background: white;
  border-radius: 16px;
  margin-bottom: 1.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(231, 234, 237, 0.7);
  max-width: 700px;
  margin-left: auto;
  margin-right: auto;

  ${PlaceholderBase} {
    &.header {
      height: 24px;
      width: 40%;
      margin-bottom: 1.5rem;
    }

    &.content {
      height: 20px;
      margin-bottom: 1rem;

      &:last-child {
        margin-bottom: 0;
      }
      &:nth-child(2) {
        width: 95%;
      }
      &:nth-child(3) {
        width: 85%;
      }
    }
  }
`;

const RelationshipPlaceholder = styled(motion.div)`
  padding: 2rem;
  background: white;
  border-radius: 16px;
  margin-bottom: 1.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(231, 234, 237, 0.7);
  max-width: 700px;
  margin-left: auto;
  margin-right: auto;

  ${PlaceholderBase} {
    &.type {
      height: 22px;
      width: 120px;
      margin-bottom: 1.5rem;
    }

    &.title {
      height: 24px;
      width: 80%;
      margin-bottom: 1rem;
    }

    &.meta {
      height: 18px;
      width: 50%;
    }
  }
`;

const LoadingPlaceholders: React.FC<{
  type: "summary" | "notes" | "relationships";
}> = ({ type }) => {
  const placeholderCount = 3;

  if (type === "summary") {
    return (
      <SummaryPlaceholder>
        {[...Array(4)].map((_, i) => (
          <PlaceholderBase key={i} />
        ))}
      </SummaryPlaceholder>
    );
  }

  return (
    <>
      {[...Array(placeholderCount)].map((_, i) => {
        const Placeholder =
          type === "notes" ? NotePlaceholder : RelationshipPlaceholder;
        return (
          <Placeholder
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.1 }}
          >
            <PlaceholderBase className={type === "notes" ? "header" : "type"} />
            {type === "notes" ? (
              <>
                <PlaceholderBase className="content" />
                <PlaceholderBase className="content" />
              </>
            ) : (
              <>
                <PlaceholderBase className="title" />
                <PlaceholderBase className="meta" />
              </>
            )}
          </Placeholder>
        );
      })}
    </>
  );
};

const EmptyStateContainer = styled(motion.div)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  text-align: center;
  color: #6c757d;

  svg {
    color: #adb5bd;
    margin-bottom: 1.5rem;
    stroke-width: 1.5;
  }

  h3 {
    color: #495057;
    font-size: 1.25rem;
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  p {
    color: #868e96;
    font-size: 0.875rem;
    max-width: 280px;
    line-height: 1.5;
  }
`;

const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
}> = ({ icon, title, description }) => (
  <EmptyStateContainer
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
  >
    {icon}
    <h3>{title}</h3>
    <p>{description}</p>
  </EmptyStateContainer>
);

// Get WebSocket URL from environment or fallback to window.location for production
const getWebSocketUrl = (documentId: string, token: string): string => {
  // Use environment variable if defined (for development)
  const wsBaseUrl =
    process.env.REACT_APP_WS_URL ||
    process.env.REACT_APP_API_URL ||
    `${window.location.protocol === "https:" ? "wss" : "ws"}://${
      window.location.host
    }`;
  console.log("process.env.REACT_APP_WS_URL", process.env.REACT_APP_WS_URL);
  console.log("process.env.REACT_APP_API_URL", process.env.REACT_APP_API_URL);
  console.log("window.location.protocol", window.location.protocol);
  console.log("window.location.host", window.location.host);
  console.log("process.env", process.env);
  console.log("wsBaseUrl", wsBaseUrl);

  // Remove any trailing slashes from the base URL and ensure proper protocol
  const normalizedBaseUrl = wsBaseUrl
    .replace(/\/+$/, "")
    .replace(/^http/, "ws")
    .replace(/^https/, "wss");

  return `${normalizedBaseUrl}/ws/document/${encodeURIComponent(
    documentId
  )}/query/?token=${encodeURIComponent(token)}`;
};

const PostItNote = styled(motion.button)`
  background: #fff7b1;
  padding: 1.25rem;
  border-radius: 2px;
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05), 0 10px 15px -8px rgba(0, 0, 0, 0.1);
  position: relative;
  border: none;
  width: 100%;
  text-align: left;
  cursor: pointer;
  transform-origin: center;
  transition: all 0.2s ease;

  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 28px;
    background: rgba(0, 0, 0, 0.02);
    border-radius: 2px 2px 0 0;
  }

  &::after {
    content: "";
    position: absolute;
    top: -4px;
    left: 50%;
    transform: translateX(-50%);
    width: 40%;
    height: 8px;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 0 0 3px 3px;
  }

  .content {
    max-height: 200px;
    overflow: hidden;
    position: relative;
    font-family: "Kalam", cursive;
    line-height: 1.6;
    color: #2c3e50;

    &::after {
      content: "";
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 40px;
      background: linear-gradient(transparent, #fff7b1);
    }
  }

  .meta {
    margin-top: 1rem;
    font-size: 0.75rem;
    color: #666;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.05),
      0 15px 25px -12px rgba(0, 0, 0, 0.15);
  }
`;

const NotesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
  padding: 1.5rem;

  /* Responsive grid */
  @media (max-width: 1200px) {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  }

  @media (max-width: 768px) {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    padding: 1rem;
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
    gap: 1rem;
    padding: 0.75rem;
  }
`;

const NoteModal = styled(Modal)`
  &&& {
    max-width: 90vw;
    margin: 2rem auto;
    border-radius: 12px;
    overflow: hidden;

    @media (min-width: 768px) {
      max-width: 80vw;
    }

    @media (min-width: 1024px) {
      max-width: 60vw;
    }

    .content {
      padding: 1.5rem;
      font-family: "Kalam", cursive;
      line-height: 1.6;
      color: #2c3e50;

      @media (min-width: 768px) {
        padding: 2rem;
      }
    }

    .meta {
      padding: 1rem 1.5rem;
      background: #f8f9fa;
      border-top: 1px solid #eee;
      font-size: 0.875rem;
      color: #666;

      @media (min-width: 768px) {
        padding: 1rem 2rem;
      }
    }
  }
`;

const NotesHeader = styled.div`
  padding: 1.5rem 2rem 1rem;
  border-bottom: 1px solid rgba(231, 234, 237, 0.7);
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 10;

  h3 {
    font-size: 1.25rem;
    font-weight: 500;
    color: #212529;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .meta {
    font-size: 0.875rem;
    color: #6c757d;
    margin-top: 0.5rem;
  }
`;

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
    readOnly,
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
  const { scrollContainerRef, annotationElementRefs, registerRef } =
    useAnnotationRefs();
  const { activeSpanLabel, setActiveSpanLabel } = useAnnotationControls();

  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [markdownError, setMarkdownError] = useState<boolean>(false);

  const containerRefCallback = useCallback(
    (node: HTMLDivElement | null) => {
      // console.log("Started Annotation Renderer");
      if (node !== null) {
        scrollContainerRef.current = node;
        registerRef("scrollContainer", scrollContainerRef);
      }
    },
    [scrollContainerRef, registerRef]
  );

  const { data: combinedData, loading } = useQuery<
    GetDocumentKnowledgeAndAnnotationsOutput,
    GetDocumentKnowledgeAndAnnotationsInput
  >(GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS, {
    variables: {
      documentId,
      corpusId,
      analysisId: undefined, // or pass an analysis ID if needed
    },
    onCompleted: (data) => {
      setDocumentType(data.document.fileType ?? "");

      if (
        data.document.fileType === "application/pdf" &&
        data.document.pdfFile
      ) {
        console.debug("React to PDF doc load request");
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
        node.sourceAnnotations?.edges?.map(({ node: annotation }: any) => ({
          text: annotation.rawText,
          onClick: () => console.log("Navigate to annotation", annotation.id),
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
    const userIsAuthenticated = !!(auth_token && user_obj);
    if (!documentId || !corpusId || !userIsAuthenticated) return;

    const wsUrl = getWebSocketUrl(documentId, auth_token);
    console.log("Connecting to WebSocket at:", wsUrl);

    socketRef.current = new WebSocket(wsUrl);
    const ws = socketRef.current;

    ws.onopen = () => {
      console.log("WebSocket connected");
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
        console.error("Failed to parse websocket message:", err);
      }
    };

    ws.onclose = (event) => {
      console.log("WebSocket closed:", event.code, event.reason);
      setWsReady(false);
      setWsError("Connection closed. Please try again.");
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
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
        content: content,
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

      const payload = {
        query: trimmed,
      };
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

  useEffect(() => {
    setShowRightPanel(
      ["chat", "notes", "metadata", "relationships"].includes(activeTab)
    );
  }, [activeTab]);

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

  // Add a new tab for document viewing
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | undefined>();
  const [analyses, setAnalyses] = useState<AnalysisType[]>([]);
  const [extracts, setExtracts] = useState<ExtractType[]>([]);
  const [datacells, setDatacells] = useState<DatacellType[]>([]);
  const [columns, setColumns] = useState<ColumnType[]>([]);

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
            active={activeTab === "summary"}
            onClick={() => setActiveTab("summary")}
            collapsed={sidebarCollapsed}
            style={{
              borderBottom: "1px solid rgba(231, 234, 237, 0.7)",
              marginBottom: "0.5rem",
              paddingBottom: "1rem",
            }}
          >
            <FileText size={18} />
            <span>Summary</span>
          </TabButton>

          <TabButton
            active={activeTab === "chat"}
            onClick={() => setActiveTab("chat")}
            collapsed={sidebarCollapsed}
          >
            <MessageSquare size={18} />
            <span>Chat</span>
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
          <TabButton
            active={activeTab === "document"}
            onClick={() => setActiveTab("document")}
            collapsed={sidebarCollapsed}
          >
            <FileText size={18} />
            <span>Document</span>
          </TabButton>
        </TabsColumn>

        <MainContentArea>
          {activeTab === "document" ? (
            <PDFContainer ref={containerRefCallback}>
              <LabelSelector
                sidebarWidth={"0px"}
                activeSpanLabel={activeSpanLabel ?? null}
                setActiveLabel={setActiveSpanLabel}
              />
              <DocTypeLabelDisplay />
              {viewComponents}
            </PDFContainer>
          ) : (
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
          )}
        </MainContentArea>

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
                  <ConversationIndicator>
                    <AnimatePresence>
                      {showSelector && (
                        <ConversationSelector
                          initial={{ opacity: 0, scale: 0.9, x: 20 }}
                          animate={{ opacity: 1, scale: 1, x: 0 }}
                          exit={{ opacity: 0, scale: 0.9, x: 20 }}
                          transition={{
                            type: "spring",
                            damping: 20,
                            stiffness: 300,
                          }}
                        >
                          <ConversationList>
                            {conversations.map(
                              (conv) =>
                                conv && (
                                  <ConversationItem
                                    key={conv.id}
                                    onClick={() =>
                                      setSelectedConversationId(conv.id)
                                    }
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
                                      {new Date(
                                        conv.createdAt
                                      ).toLocaleDateString()}
                                      <User size={12} />
                                      {conv.creator?.email}
                                    </div>
                                  </ConversationItem>
                                )
                            )}
                          </ConversationList>
                          <NewChatButton
                            onClick={handleCreateNewConversation}
                            whileHover={{ y: -1 }}
                          >
                            <Plus size={16} />
                            New Chat
                          </NewChatButton>
                        </ConversationSelector>
                      )}
                    </AnimatePresence>
                    <ConversationCount
                      onClick={() => setShowSelector(!showSelector)}
                      whileHover={{ scale: 1.05 }}
                    >
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
                        wsReady
                          ? "Type your message..."
                          : "Waiting for connection..."
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
              )}

              {activeTab === "notes" && (
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
                              ((index % 3) - 1) * 1.5 +
                              (Math.random() * 1 - 0.5),
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
                                <Card.Description
                                  style={{ marginTop: "0.75rem" }}
                                >
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
              )}
            </SlidingPanel>
          )}
        </AnimatePresence>
      </ContentArea>

      <Modal
        open={showGraph}
        onClose={() => setShowGraph(false)}
        size="large"
        basic
      >
        <Modal.Content>
          {/* Graph visualization content goes here */}
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
