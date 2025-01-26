import React from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { User, Bot, ExternalLink } from "lucide-react";

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
`;

const SourcesContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
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
`;

const Timestamp = styled.div`
  color: #868e96;
  font-size: 0.75rem;
  margin-top: 0.25rem;
  padding-left: 0.25rem;
`;

const UserName = styled.div`
  font-size: 0.875rem;
  font-weight: 500;
  color: #495057;
  margin-bottom: 0.25rem;
  padding-left: 0.25rem;
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
        {content}
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
