import React, { useState } from "react";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Bot,
  Pin,
  ChevronUp,
  ChevronDown,
  Clock,
  Zap,
  MessageSquare,
  Wrench,
  CheckCircle,
  Activity,
  Plus,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSetAtom, useAtomValue } from "jotai";
import { chatSourcesAtom } from "../../annotator/context/ChatSourceAtom";
import { useMemo } from "react";
import { useCreateAnnotation } from "../../annotator/hooks/AnnotationHooks";
import { useCorpusState } from "../../annotator/context/CorpusAtom";
import { useSelectedDocument } from "../../annotator/context/DocumentAtom";
import {
  ServerTokenAnnotation,
  ServerSpanAnnotation,
} from "../../annotator/types/annotations";
import {
  MultipageAnnotationJson,
  SinglePageAnnotationJson,
  BoundingBox,
  SpanAnnotationJson,
} from "../../types";

// Timeline entry type based on the schema
export interface TimelineEntry {
  type: "thought" | "content" | "tool_call" | "tool_result" | "sources" | "status";
  text?: string;
  tool?: string;
  args?: any;
  count?: number;
  metadata?: Record<string, any>;
  msg?: string;
}

export interface ChatMessageProps {
  messageId?: string; // Optional because some messages (like streaming ones) might not have an ID yet
  user: string;
  content: string;
  timestamp: string;
  isAssistant: boolean;
  hasSources?: boolean;
  hasTimeline?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  sources?: Array<{
    text: string;
    onClick?: () => void;
  }>;
  timeline?: TimelineEntry[];
}

const MessageContainer = styled(motion.div)<{
  $isAssistant: boolean;
  $isSelected?: boolean;
}>`
  display: flex;
  gap: 1rem;
  padding: 0.75rem 1.5rem;
  transition: all 0.2s ease-in-out;
  position: relative;
  cursor: ${(props) =>
    props.$isSelected !== undefined ? "pointer" : "default"};
  background: ${(props) =>
    props.$isSelected
      ? "rgba(92,124,157,0.05)"
      : props.$isAssistant
      ? "rgba(247, 249, 252, 0.3)"
      : "rgba(247, 248, 249, 0.15)"};

  ${(props) =>
    props.$isSelected &&
    `
    box-shadow: inset 4px 0 0 #5C7C9D;
  `}

  &:hover {
    background: ${(props) =>
      props.$isSelected
        ? "rgba(92,124,157,0.08)"
        : props.$isAssistant
        ? "rgba(247, 249, 252, 0.4)"
        : "rgba(247, 248, 249, 0.25)"};
  }

  /* Add responsive padding */
  @media (max-width: 768px) {
    padding: 0.5rem 1rem;
    gap: 0.75rem;
  }

  @media (max-width: 480px) {
    padding: 0.5rem 0.75rem;
    gap: 0.5rem;
  }
`;

const Avatar = styled.div<{ $isAssistant: boolean }>`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: ${(props) => (props.$isAssistant ? "16px" : "12px")};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: ${(props) =>
    props.$isAssistant
      ? "linear-gradient(135deg, #2185d0 0%, #1678c2 100%)"
      : "linear-gradient(135deg, #2d3748 0%, #4a5568 100%)"};
  box-shadow: ${(props) =>
    props.$isAssistant
      ? "0 4px 12px rgba(33, 133, 208, 0.2)"
      : "0 4px 12px rgba(45, 55, 72, 0.2)"};
  color: ${(props) => (props.$isAssistant ? "white" : "#e2e8f0")};
  transform: translateY(0);
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: ${(props) =>
      props.$isAssistant
        ? "0 6px 16px rgba(33, 133, 208, 0.25)"
        : "0 6px 16px rgba(45, 55, 72, 0.25)"};
  }

  svg {
    width: 1.2rem;
    height: 1.2rem;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
  }

  /* Adjust avatar size on mobile */
  @media (max-width: 480px) {
    width: 2rem;
    height: 2rem;
    border-radius: 10px;

    svg {
      width: 1rem;
      height: 1rem;
    }
  }
`;

const ContentContainer = styled.div`
  flex: 1;
  min-width: 0;
`;

const MessageContent = styled.div<{ $isAssistant: boolean }>`
  background: ${(props) =>
    props.$isAssistant
      ? "rgba(255, 255, 255, 0.7)"
      : "rgba(247, 248, 249, 0.5)"};
  backdrop-filter: blur(12px);
  border-radius: 1.25rem;
  padding: 1.25rem 1.5rem;
  color: ${(props) => (props.$isAssistant ? "#1a1f36" : "#2d3748")};
  font-size: 0.95rem;
  line-height: 1.6;
  position: relative;
  margin-bottom: 0.25rem;
  box-shadow: ${(props) =>
    props.$isAssistant
      ? "0 2px 8px rgba(23, 25, 35, 0.04)"
      : "0 1px 4px rgba(23, 25, 35, 0.03)"};
  border: 1px solid
    ${(props) =>
      props.$isAssistant
        ? "rgba(255, 255, 255, 0.5)"
        : "rgba(247, 248, 249, 0.3)"};
  word-wrap: break-word;
  overflow-wrap: break-word;
  word-break: break-all;

  &::before {
    content: "";
    position: absolute;
    top: 1rem;
    ${(props) => (props.$isAssistant ? "left" : "right")}: -0.5rem;
    width: 1rem;
    height: 1rem;
    background: ${(props) =>
      props.$isAssistant
        ? "linear-gradient(135deg, #f8f9fa, #ffffff)"
        : "linear-gradient(135deg, #e9ecef, #f1f3f5)"};
    transform: rotate(45deg);
    border-radius: 0.125rem;
  }

  /* Add styles for markdown content */
  & > div {
    overflow-x: auto;
  }

  pre {
    background: rgba(247, 248, 249, 0.6);
    backdrop-filter: blur(8px);
    border-radius: 0.75rem;
    padding: 1.25rem;
    border: 1px solid rgba(226, 232, 240, 0.3);
  }

  code {
    color: #2b6cb0;
    background: rgba(43, 108, 176, 0.08);
    border-radius: 4px;
    padding: 0.2em 0.4em;
  }

  table {
    border-collapse: collapse;
    width: 100%;
    margin: 1rem 0;
  }

  th,
  td {
    border: 1px solid #dee2e6;
    padding: 0.5rem;
  }

  th {
    background: rgba(0, 0, 0, 0.02);
  }

  /* Improve mobile readability */
  @media (max-width: 768px) {
    font-size: 0.9rem;
    padding: 0.875rem 1rem;

    pre {
      padding: 0.5rem;
      font-size: 0.8rem;
      max-width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    code {
      font-size: 0.85em;
    }

    table {
      display: block;
      max-width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
  }

  /* Enhance mobile chat bubble appearance */
  @media (max-width: 480px) {
    border-radius: 0.875rem;
    padding: 0.75rem 0.875rem;

    &::before {
      display: none; /* Remove chat bubble arrow on very small screens */
    }
  }
`;

const SourcesContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.75rem;
  transition: all 0.2s ease-in-out;
`;

const SourcePreviewContainer = styled.div`
  position: relative;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 0.75rem;
  border: 1px solid rgba(92, 124, 157, 0.2);
  overflow: hidden;
  transition: all 0.2s ease-in-out;
`;

const SourcePreviewHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: rgba(92, 124, 157, 0.05);
  border-bottom: 1px solid rgba(92, 124, 157, 0.1);
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    background: rgba(92, 124, 157, 0.1);
  }
`;

const SourcePreviewTitle = styled.div`
  font-size: 0.875rem;
  font-weight: 500;
  color: #5c7c9d;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const SourcePreviewContent = styled(motion.div)`
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  color: #4a5568;
  max-height: 300px;
  overflow-y: auto;
`;

const SourceList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.25rem;
`;

const SourceChip = styled.div<{ $isSelected: boolean }>`
  position: relative;
  overflow: visible;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background: ${(props) =>
    props.$isSelected
      ? "rgba(92, 124, 157, 0.15)"
      : "rgba(255, 255, 255, 0.7)"};
  border: 1px solid
    ${(props) =>
      props.$isSelected
        ? "rgba(92, 124, 157, 0.3)"
        : "rgba(92, 124, 157, 0.1)"};
  border-radius: 0.75rem;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    background: ${(props) =>
      props.$isSelected
        ? "rgba(92, 124, 157, 0.2)"
        : "rgba(255, 255, 255, 0.9)"};
    border-color: rgba(92, 124, 157, 0.3);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(92, 124, 157, 0.1);
  }

  &:active {
    transform: translateY(0);
  }
`;

const SourceHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
`;

const SourceTitle = styled.div<{ $isSelected: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
  color: ${(props) => (props.$isSelected ? "#2d3748" : "#4a5568")};
`;

const SourceText = styled(motion.div)<{ $isExpanded: boolean }>`
  font-size: 0.8125rem;
  color: #4a5568;
  line-height: 1.5;
  position: relative;
  overflow: hidden;

  ${(props) =>
    !props.$isExpanded &&
    `
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  `}
`;

const ExpandButton = styled.button<{ $isExpanded: boolean }>`
  background: none;
  border: none;
  padding: 0.25rem;
  color: #5c7c9d;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  transition: all 0.2s ease-in-out;

  &:hover {
    color: #4a6b8c;
  }

  svg {
    width: 14px;
    height: 14px;
    transition: transform 0.2s ease-in-out;
    transform: ${(props) =>
      props.$isExpanded ? "rotate(180deg)" : "rotate(0deg)"};
  }
`;

// NEW styled components for annotation from source
const AnnotateButton = styled.button`
  background: none;
  border: none;
  padding: 0.25rem;
  color: #5c7c9d;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  transition: all 0.2s ease-in-out;

  &:hover {
    color: #4a6b8c;
  }
`;

const LabelMenu = styled.div`
  position: absolute;
  top: 2.2rem;
  right: 0.5rem;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(200, 200, 200, 0.8);
  border-radius: 0.5rem;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  z-index: 2000;
`;

const LabelButton = styled.button`
  border: none;
  background: transparent;
  padding: 0.4rem 0.75rem;
  font-size: 0.8125rem;
  border-radius: 0.375rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
  }
`;
// END new styled components

// Timeline styled components
const TimelineContainer = styled.div`
  position: relative;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 0.75rem;
  border: 1px solid rgba(156, 163, 175, 0.2);
  overflow: hidden;
  transition: all 0.2s ease-in-out;
  margin-top: 0.75rem;
`;

const TimelineHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: rgba(156, 163, 175, 0.05);
  border-bottom: 1px solid rgba(156, 163, 175, 0.1);
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    background: rgba(156, 163, 175, 0.1);
  }
`;

const TimelineTitle = styled.div`
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const TimelineContent = styled(motion.div)`
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  color: #4a5568;
  max-height: 400px;
  overflow-y: auto;
`;

const TimelineList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const TimelineItem = styled.div<{ $type: TimelineEntry['type'] }>`
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem;
  background: ${(props) => {
    switch (props.$type) {
      case 'thought': return 'rgba(168, 85, 247, 0.05)';
      case 'tool_call': return 'rgba(59, 130, 246, 0.05)';
      case 'tool_result': return 'rgba(34, 197, 94, 0.05)';
      case 'content': return 'rgba(249, 115, 22, 0.05)';
      case 'sources': return 'rgba(92, 124, 157, 0.05)';
      case 'status': return 'rgba(156, 163, 175, 0.05)';
      default: return 'rgba(255, 255, 255, 0.7)';
    }
  }};
  border: 1px solid ${(props) => {
    switch (props.$type) {
      case 'thought': return 'rgba(168, 85, 247, 0.1)';
      case 'tool_call': return 'rgba(59, 130, 246, 0.1)';
      case 'tool_result': return 'rgba(34, 197, 94, 0.1)';
      case 'content': return 'rgba(249, 115, 22, 0.1)';
      case 'sources': return 'rgba(92, 124, 157, 0.1)';
      case 'status': return 'rgba(156, 163, 175, 0.1)';
      default: return 'rgba(156, 163, 175, 0.1)';
    }
  }};
  border-radius: 0.5rem;
  transition: all 0.2s ease-in-out;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px ${(props) => {
      switch (props.$type) {
        case 'thought': return 'rgba(168, 85, 247, 0.1)';
        case 'tool_call': return 'rgba(59, 130, 246, 0.1)';
        case 'tool_result': return 'rgba(34, 197, 94, 0.1)';
        case 'content': return 'rgba(249, 115, 22, 0.1)';
        case 'sources': return 'rgba(92, 124, 157, 0.1)';
        case 'status': return 'rgba(156, 163, 175, 0.1)';
        default: return 'rgba(156, 163, 175, 0.1)';
      }
    }};
  }
`;

const TimelineIcon = styled.div<{ $type: TimelineEntry['type'] }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  flex-shrink: 0;
  background: ${(props) => {
    switch (props.$type) {
      case 'thought': return 'linear-gradient(135deg, #a855f7, #9333ea)';
      case 'tool_call': return 'linear-gradient(135deg, #3b82f6, #2563eb)';
      case 'tool_result': return 'linear-gradient(135deg, #22c55e, #16a34a)';
      case 'content': return 'linear-gradient(135deg, #f97316, #ea580c)';
      case 'sources': return 'linear-gradient(135deg, #5c7c9d, #4a6b8c)';
      case 'status': return 'linear-gradient(135deg, #9ca3af, #6b7280)';
      default: return 'linear-gradient(135deg, #9ca3af, #6b7280)';
    }
  }};
  color: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  svg {
    width: 1rem;
    height: 1rem;
  }
`;

const TimelineItemContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const TimelineItemTitle = styled.div`
  font-weight: 500;
  color: #1f2937;
  margin-bottom: 0.25rem;
  font-size: 0.875rem;
`;

const TimelineItemText = styled.div`
  color: #4b5563;
  font-size: 0.8125rem;
  line-height: 1.5;
  word-break: break-word;
`;

const TimelineItemArgs = styled.div`
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 0.375rem;
  border: 1px solid rgba(0, 0, 0, 0.05);
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.75rem;
  color: #374151;
  overflow-x: auto;
`;

interface SourceItemProps {
  messageId: string;
  text: string;
  index: number;
  isSelected: boolean;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const SourceItem: React.FC<SourceItemProps> = ({
  messageId,
  text,
  index,
  isSelected,
  onClick,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [labelMenuOpen, setLabelMenuOpen] = useState(false);

  // Hooks
  const { selectedDocument } = useSelectedDocument();
  const { humanSpanLabels, humanTokenLabels } = useCorpusState();
  const chatStateValue = useAtomValue(chatSourcesAtom);
  const createAnnotation = useCreateAnnotation();

  const availableLabels = useMemo(() => {
    if (selectedDocument?.fileType?.startsWith("text/")) {
      return humanSpanLabels;
    }
    return humanTokenLabels;
  }, [selectedDocument, humanSpanLabels, humanTokenLabels]);

  // UI handlers
  const toggleExpand = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleAnnotateClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setLabelMenuOpen((prev) => !prev);
  };

  const handleLabelSelect = (label: any) => {
    const msg = chatStateValue.messages.find((m) => m.messageId === messageId);
    if (!msg) return setLabelMenuOpen(false);
    const sourceData = msg.sources[index];
    if (!sourceData) return setLabelMenuOpen(false);

    try {
      if (selectedDocument?.fileType?.startsWith("text/")) {
        if (sourceData.startIndex === undefined || sourceData.endIndex === undefined) return setLabelMenuOpen(false);
        const spanJson: SpanAnnotationJson = {
          start: sourceData.startIndex,
          end: sourceData.endIndex,
        };
        const newAnnot = new ServerSpanAnnotation(
          sourceData.page ?? 0,
          label,
          sourceData.rawText,
          false,
          spanJson,
          [],
          false,
          false,
          false
        );
        createAnnotation(newAnnot);
      } else {
        const mpJson: MultipageAnnotationJson = {};
        Object.entries(sourceData.boundsByPage).forEach(([pStr, bounds]) => {
          const pNum = parseInt(pStr, 10);
          mpJson[pNum] = {
            bounds: bounds as BoundingBox,
            tokensJsons: sourceData.tokensByPage[pNum] || [],
            rawText: sourceData.rawText,
          };
        });
        const firstPage = Number(Object.keys(mpJson)[0] || 0);
        const newAnnot = new ServerTokenAnnotation(
          firstPage,
          label,
          sourceData.rawText,
          false,
          mpJson,
          [],
          false,
          false,
          false
        );
        createAnnotation(newAnnot);
      }
    } catch (err) {
      /* eslint-disable no-console */
      console.error("Failed to create annotation from source", err);
    } finally {
      setLabelMenuOpen(false);
    }
  };

  return (
    <SourceChip $isSelected={isSelected} onClick={onClick} className="source-chip">
      <SourceHeader>
        <SourceTitle $isSelected={isSelected}>
          <Pin size={12} /> Source {index + 1}
        </SourceTitle>
        <div style={{ display: "flex", gap: "0.25rem" }}>
          <AnnotateButton title="Annotate" onClick={handleAnnotateClick}>
            <Plus size={14} /> Annotate
          </AnnotateButton>
          <ExpandButton $isExpanded={isExpanded} onClick={toggleExpand} title={isExpanded ? "Show less" : "Show more"}>
            {isExpanded ? "Show less" : "Show more"}
            <ChevronDown />
          </ExpandButton>
        </div>
      </SourceHeader>
      {labelMenuOpen && (
        <LabelMenu>
          {availableLabels.map((lab) => (
            <LabelButton key={lab.id} onClick={() => handleLabelSelect(lab)}>
              <span style={{ marginRight: 6, width: 8, height: 8, background: lab.color || "#1a75bc", display: "inline-block", borderRadius: 4 }} />
              {lab.text}
            </LabelButton>
          ))}
        </LabelMenu>
      )}
      <SourceText $isExpanded={isExpanded} initial={false} animate={{ height: isExpanded ? "auto" : "3em" }} transition={{ duration: 0.2 }}>
        {text}
      </SourceText>
    </SourceChip>
  );
};

interface SourcePreviewProps {
  messageId: string;
  sources: Array<{ text: string; onClick?: () => void }>;
  selectedIndex?: number;
  onSourceSelect: (index: number) => void;
}

const SourcePreview: React.FC<SourcePreviewProps> = ({
  messageId,
  sources,
  selectedIndex,
  onSourceSelect,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleHeaderClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <SourcePreviewContainer
      className="source-preview-container"
      onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
    >
      <SourcePreviewHeader onClick={handleHeaderClick}>
        <SourcePreviewTitle>
          <Pin size={14} />
          {sources.length} {sources.length === 1 ? "Source" : "Sources"}
        </SourcePreviewTitle>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </SourcePreviewHeader>
      <AnimatePresence>
        {isExpanded && (
          <SourcePreviewContent
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SourceList>
              {sources.map((source, index) => (
                <SourceItem
                  key={index}
                  messageId={messageId}
                  text={source.text}
                  index={index}
                  isSelected={selectedIndex === index}
                  onClick={(e: React.MouseEvent<HTMLDivElement>) => {
                    e.stopPropagation();
                    onSourceSelect(index);
                    source.onClick?.();
                  }}
                />
              ))}
            </SourceList>
          </SourcePreviewContent>
        )}
      </AnimatePresence>
    </SourcePreviewContainer>
  );
};

// Helper function to get icon for timeline entry type
const getTimelineIcon = (type: TimelineEntry['type']) => {
  switch (type) {
    case 'thought':
      return <Zap />;
    case 'tool_call':
      return <Wrench />;
    case 'tool_result':
      return <CheckCircle />;
    case 'content':
      return <MessageSquare />;
    case 'sources':
      return <Pin />;
    case 'status':
      return <Activity />;
    default:
      return <Clock />;
  }
};

// Helper function to get title for timeline entry type
const getTimelineTitle = (entry: TimelineEntry) => {
  switch (entry.type) {
    case 'thought':
      return 'Thinking';
    case 'tool_call':
      return `Calling ${entry.tool || 'Tool'}`;
    case 'tool_result':
      return `${entry.tool || 'Tool'} Result`;
    case 'content':
      return 'Generating Response';
    case 'sources':
      return 'Found Sources';
    case 'status':
      return entry.msg || 'Status Update';
    default:
      return 'Timeline Entry';
  }
};

interface TimelinePreviewProps {
  timeline: TimelineEntry[];
}

const TimelinePreview: React.FC<TimelinePreviewProps> = ({ timeline }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleHeaderClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <TimelineContainer
      className="timeline-container"
      onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
    >
      <TimelineHeader onClick={handleHeaderClick}>
        <TimelineTitle>
          <Clock size={14} />
          Timeline ({timeline.length} {timeline.length === 1 ? 'step' : 'steps'})
        </TimelineTitle>
        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </TimelineHeader>
      <AnimatePresence>
        {isExpanded && (
          <TimelineContent
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <TimelineList>
              {timeline.map((entry, index) => (
                <TimelineItem key={index} $type={entry.type}>
                  <TimelineIcon $type={entry.type}>
                    {getTimelineIcon(entry.type)}
                  </TimelineIcon>
                  <TimelineItemContent>
                    <TimelineItemTitle>
                      {getTimelineTitle(entry)}
                    </TimelineItemTitle>
                    {entry.text && (
                      <TimelineItemText>{entry.text}</TimelineItemText>
                    )}
                    {entry.args && (
                      <TimelineItemArgs>
                        <strong>Arguments:</strong>
                        <pre>{JSON.stringify(entry.args, null, 2)}</pre>
                      </TimelineItemArgs>
                    )}
                    {entry.count !== undefined && (
                      <TimelineItemText>
                        <strong>Count:</strong> {entry.count}
                      </TimelineItemText>
                    )}
                  </TimelineItemContent>
                </TimelineItem>
              ))}
            </TimelineList>
          </TimelineContent>
        )}
      </AnimatePresence>
    </TimelineContainer>
  );
};

const SourceIndicator = styled.div<{ $isSelected?: boolean }>`
  position: absolute;
  right: 1rem;
  top: 1rem;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.8rem;
  background: ${(props) =>
    props.$isSelected ? "#5C7C9D" : "rgba(92, 124, 157, 0.1)"};
  color: ${(props) => (props.$isSelected ? "white" : "#5C7C9D")};
  border-radius: 1rem;
  font-size: 0.8rem;
  font-weight: 500;
  transform: none;
  opacity: 1;
  transition: all 0.2s ease;
  cursor: pointer;
  backdrop-filter: blur(8px);
  border: 1px solid
    ${(props) =>
      props.$isSelected ? "transparent" : "rgba(92, 124, 157, 0.2)"};

  svg {
    width: 14px;
    height: 14px;
    transition: transform 0.2s ease;
  }

  &:hover {
    background: ${(props) =>
      props.$isSelected ? "#4A6B8C" : "rgba(92, 124, 157, 0.15)"};
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(92, 124, 157, 0.15);

    svg {
      transform: rotate(-15deg);
    }
  }

  @media (max-width: 768px) {
    padding: 0.3rem 0.6rem;
    font-size: 0.75rem;
  }
`;

const TimelineIndicator = styled.div<{ $isSelected?: boolean }>`
  position: absolute;
  right: ${(props) => (props.$isSelected ? "8rem" : "1rem")};
  top: 1rem;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.8rem;
  background: ${(props) =>
    props.$isSelected ? "#6B7280" : "rgba(156, 163, 175, 0.1)"};
  color: ${(props) => (props.$isSelected ? "white" : "#6B7280")};
  border-radius: 1rem;
  font-size: 0.8rem;
  font-weight: 500;
  transform: none;
  opacity: 1;
  transition: all 0.2s ease;
  cursor: pointer;
  backdrop-filter: blur(8px);
  border: 1px solid
    ${(props) =>
      props.$isSelected ? "transparent" : "rgba(156, 163, 175, 0.2)"};

  svg {
    width: 14px;
    height: 14px;
    transition: transform 0.2s ease;
  }

  &:hover {
    background: ${(props) =>
      props.$isSelected ? "#4B5563" : "rgba(156, 163, 175, 0.15)"};
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(156, 163, 175, 0.15);

    svg {
      transform: rotate(-15deg);
    }
  }

  @media (max-width: 768px) {
    padding: 0.3rem 0.6rem;
    font-size: 0.75rem;
    right: ${(props) => (props.$isSelected ? "6rem" : "1rem")};
  }
`;

const Timestamp = styled.div`
  color: #868e96;
  font-size: 0.75rem;
  margin-top: 0.25rem;
  padding-left: 0.25rem;

  @media (max-width: 480px) {
    font-size: 0.7rem;
    margin-top: 0.125rem;
  }
`;

const UserName = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 0.375rem;
  padding-left: 0.25rem;
  letter-spacing: -0.01em;

  @media (max-width: 480px) {
    font-size: 0.8rem;
    margin-bottom: 0.25rem;
  }
`;

export const ChatMessage: React.FC<ChatMessageProps> = ({
  messageId,
  user,
  content,
  timestamp,
  isAssistant,
  sources = [],
  timeline = [],
  hasSources,
  hasTimeline,
  isSelected,
  onSelect,
}) => {
  console.log("[ChatMessage] Rendering with props:", {
    messageId,
    user,
    content,
    timestamp,
    isAssistant,
    sources,
    timeline,
    hasSources,
    hasTimeline,
    isSelected,
  });
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<
    number | undefined
  >();

  const setChatState = useSetAtom(chatSourcesAtom);

  const handleSourceSelect = (index: number) => {
    setSelectedSourceIndex(index === selectedSourceIndex ? undefined : index);
    if (messageId !== undefined) {
      setChatState((prev) => ({
        ...prev,
        selectedMessageId: messageId,
        selectedSourceIndex: index === prev.selectedSourceIndex ? null : index,
      }));
    }
  };

  console.log("[ChatMessage] About to render. Content:", content);
  return (
    <MessageContainer
      $isAssistant={isAssistant}
      $isSelected={isSelected}
      onClick={onSelect}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {hasTimeline && timeline.length > 0 && (
        <TimelineIndicator $isSelected={isSelected}>
          <Clock size={14} />
          {timeline.length} {timeline.length === 1 ? 'step' : 'steps'}
        </TimelineIndicator>
      )}
      {hasSources && (
        <SourceIndicator $isSelected={isSelected}>
          <Pin size={14} />
          {sources.length > 0 ? `${sources.length} sources` : "View sources"}
        </SourceIndicator>
      )}
      <Avatar $isAssistant={isAssistant}>
        {isAssistant ? <Bot /> : <User />}
      </Avatar>
      <ContentContainer>
        <UserName>{isAssistant ? "AI Assistant" : user}</UserName>
        <MessageContent $isAssistant={isAssistant}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          {timeline.length > 0 && <TimelinePreview timeline={timeline} />}
          {sources.length > 0 && (
            <SourcePreview
              messageId={messageId || ""}
              sources={sources}
              selectedIndex={selectedSourceIndex}
              onSourceSelect={handleSourceSelect}
            />
          )}
        </MessageContent>
        <Timestamp>{timestamp}</Timestamp>
      </ContentContainer>
    </MessageContainer>
  );
};
