import React, { useState } from "react";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Bot,
  ExternalLink,
  Pin,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSetAtom } from "jotai";
import { chatSourcesAtom } from "../../annotator/context/ChatSourceAtom";

export interface ChatMessageProps {
  messageId?: string; // Optional because some messages (like streaming ones) might not have an ID yet
  user: string;
  content: string;
  timestamp: string;
  isAssistant: boolean;
  hasSources?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  sources?: Array<{
    text: string;
    onClick?: () => void;
  }>;
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

interface SourceItemProps {
  text: string;
  index: number;
  isSelected: boolean;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const SourceItem: React.FC<SourceItemProps> = ({
  text,
  index,
  isSelected,
  onClick,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpand = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  return (
    <SourceChip $isSelected={isSelected} onClick={onClick}>
      <SourceHeader>
        <SourceTitle $isSelected={isSelected}>
          <Pin size={12} />
          Source {index + 1}
        </SourceTitle>
        <ExpandButton
          $isExpanded={isExpanded}
          onClick={toggleExpand}
          title={isExpanded ? "Show less" : "Show more"}
        >
          {isExpanded ? "Show less" : "Show more"}
          <ChevronDown />
        </ExpandButton>
      </SourceHeader>
      <SourceText
        $isExpanded={isExpanded}
        initial={false}
        animate={{ height: isExpanded ? "auto" : "3em" }}
        transition={{ duration: 0.2 }}
      >
        {text}
      </SourceText>
    </SourceChip>
  );
};

interface SourcePreviewProps {
  sources: Array<{ text: string; onClick?: () => void }>;
  selectedIndex?: number;
  onSourceSelect: (index: number) => void;
}

const SourcePreview: React.FC<SourcePreviewProps> = ({
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
  hasSources,
  isSelected,
  onSelect,
}) => {
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

  return (
    <MessageContainer
      $isAssistant={isAssistant}
      $isSelected={isSelected}
      onClick={onSelect}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
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
          {sources.length > 0 && (
            <SourcePreview
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
