import React from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { User, Bot, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface ChatMessageProps {
  user: string;
  content: string;
  timestamp: string;
  isAssistant: boolean;
  sources?: Array<{
    text: string;
    onClick?: () => void;
  }>;
}

const MessageContainer = styled(motion.div)<{ $isAssistant: boolean }>`
  display: flex;
  gap: 1rem;
  padding: 0.5rem 1.5rem;

  &:hover {
    background: rgba(247, 248, 249, 0.7);
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
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: ${(props) =>
    props.$isAssistant
      ? "linear-gradient(135deg, #2185d0 0%, #1678c2 100%)"
      : "linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)"};
  box-shadow: ${(props) =>
    props.$isAssistant
      ? "0 2px 4px rgba(33, 133, 208, 0.2)"
      : "0 2px 4px rgba(0, 0, 0, 0.05)"};
  color: ${(props) => (props.$isAssistant ? "white" : "#495057")};

  svg {
    width: 1.2rem;
    height: 1.2rem;
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
      ? "linear-gradient(to right, #f8f9fa, #ffffff)"
      : "linear-gradient(to right, #e9ecef, #f1f3f5)"};
  border-radius: 1rem;
  padding: 1rem 1.25rem;
  color: #212529;
  font-size: 0.95rem;
  line-height: 1.5;
  position: relative;
  margin-bottom: 0.25rem;

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
    background: rgba(0, 0, 0, 0.03);
    padding: 0.75rem;
    border-radius: 0.5rem;
    overflow-x: auto;
  }

  code {
    font-family: ui-monospace, monospace;
    font-size: 0.9em;
    padding: 0.2em 0.4em;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 0.25rem;
  }

  pre code {
    background: none;
    padding: 0;
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
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: white;
  border: 1px solid rgba(33, 133, 208, 0.2);
  border-radius: 2rem;
  color: #2185d0;
  font-size: 0.75rem;
  transition: all 0.2s ease;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    background: rgba(33, 133, 208, 0.1);
    border-color: #2185d0;
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }

  svg {
    width: 0.875rem;
    height: 0.875rem;
  }

  /* Mobile optimizations */
  @media (max-width: 768px) {
    padding: 0.25rem 0.5rem;
    font-size: 0.7rem;
    max-width: 150px;

    svg {
      width: 0.75rem;
      height: 0.75rem;
    }
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
  font-weight: 500;
  color: #495057;
  margin-bottom: 0.25rem;
  padding-left: 0.25rem;

  @media (max-width: 480px) {
    font-size: 0.8rem;
    margin-bottom: 0.125rem;
  }
`;

export const ChatMessage: React.FC<ChatMessageProps> = ({
  user,
  content,
  timestamp,
  isAssistant,
  sources = [],
}) => (
  <MessageContainer
    $isAssistant={isAssistant}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3, ease: "easeOut" }}
  >
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
                onClick={() => source.onClick?.()}
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
