import React from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { User, Bot, ExternalLink, Pin } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;

  /* Adjust spacing on mobile */
  @media (max-width: 480px) {
    gap: 0.375rem;
    margin-top: 0.5rem;
  }
`;

const SourceButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: white;
  border: 1px solid rgba(33, 133, 208, 0.2);
  border-radius: 2rem;
  color: #2185d0;
  font-size: 0.8rem;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  box-shadow: 0 2px 4px rgba(33, 133, 208, 0.05);

  &:hover {
    background: rgba(33, 133, 208, 0.1);
    border-color: #2185d0;
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(33, 133, 208, 0.1);
  }

  &:active {
    transform: translateY(0);
  }

  svg {
    width: 0.875rem;
    height: 0.875rem;
    stroke-width: 2.5;
    transition: transform 0.2s ease;
  }

  &:hover svg {
    transform: translateX(2px);
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

export const ChatMessage: React.FC<ChatMessageProps> = ({
  user,
  content,
  timestamp,
  isAssistant,
  sources = [],
  hasSources,
  isSelected,
  onSelect,
}) => (
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
          <SourcesContainer>
            {sources.map((source, idx) => (
              <SourceButton
                key={idx}
                onClick={(e) => {
                  e.stopPropagation(); // Prevent message selection when clicking source
                  source.onClick?.();
                }}
                title={source.text}
              >
                <ExternalLink />[{idx + 1}] {source.text}
              </SourceButton>
            ))}
          </SourcesContainer>
        )}
      </MessageContent>
      <Timestamp>{timestamp}</Timestamp>
    </ContentContainer>
  </MessageContainer>
);
