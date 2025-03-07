import { motion } from "framer-motion";
import { Button, Input } from "semantic-ui-react";
import styled from "styled-components";

export const BackButton = styled.button`
  position: sticky;
  top: 0;
  left: 0;
  background: white;
  border: none;
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #4a5568;
  cursor: pointer;
  width: 100%;
  border-bottom: 1px solid #e2e8f0;
  z-index: 10;

  &:hover {
    background: #f7fafc;
  }
`;

export const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  position: relative;
`;

export const ChatInputContainer = styled(motion.div)<{ $isTyping?: boolean }>`
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  background: white;
  border-top: 1px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 -4px 6px rgba(0, 0, 0, 0.02);
`;

export const ChatInput = styled.input`
  flex: 1;
  padding: 0.75rem 1rem;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
  transition: all 0.2s ease;
  background: #f7fafc;

  &:focus {
    outline: none;
    border-color: #4299e1;
    background: white;
    box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.15);
  }

  &:disabled {
    background: #edf2f7;
    cursor: not-allowed;
  }
`;

export const ConversationIndicator = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(180deg, #f7fafc 0%, #edf2f7 100%);
`;

export const ConversationCount = styled(motion.div)`
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

export const ConversationSelector = styled(motion.div)`
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

export const ConversationList = styled.div`
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

export const ConversationItem = styled(motion.button)`
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

export const NewChatButton = styled(motion.button)`
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

export const ErrorMessage = styled.div`
  color: #e53e3e;
  font-size: 0.875rem;
  padding: 0.5rem 0;
  display: flex;
  align-items: center;
`;

export const SendButton = styled(motion.button)`
  background: #4299e1;
  color: white;
  border: none;
  border-radius: 8px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    background: #3182ce;
  }

  &:disabled {
    background: #cbd5e0;
    cursor: not-allowed;
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

interface ConnectionStatusProps {
  connected: boolean;
}

export const ConnectionStatus = styled(motion.div)<ConnectionStatusProps>`
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.75rem;
  background: ${(props) => (props.connected ? "#48BB78" : "#F56565")};
  color: white;
  opacity: 0.9;
  transition: all 0.2s ease;

  &:before {
    content: "${(props) =>
      props.connected ? "🟢 Connected" : "🔴 Disconnected"}";
  }
`;

export const ConversationGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
  padding: 1.5rem;
  overflow-y: auto;
  position: relative;
`;

export const ConversationCard = styled(motion.div)`
  background: white;
  border-radius: 12px;
  padding: 1.25rem;
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;

  &:hover {
    box-shadow: 0 8px 12px rgba(0, 0, 0, 0.1);
    border-color: rgba(0, 0, 0, 0.1);
  }
`;

export const CardContent = styled.div`
  flex: 1;
  min-width: 0;
`;

export const CardTitle = styled.h3`
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: #2d3748;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const CardMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 0.5rem;
  font-size: 0.875rem;
`;

export const TimeStamp = styled.span`
  color: #718096;
`;

export const Creator = styled.span`
  color: #4a5568;
  font-weight: 500;
`;

export const MessageCount = styled(motion.div)<{
  $colorStyle?: { background: string; opacity: number; textColor: string };
}>`
  position: absolute;
  right: 1.5rem;
  top: 50%;
  transform: translateY(-50%);
  background: ${(props) =>
    props.$colorStyle?.background ||
    (props.children === "0"
      ? "linear-gradient(135deg, #EDF2F7 0%, #E2E8F0 100%)"
      : "linear-gradient(135deg, #2B6CB0 0%, #2C5282 100%)")};
  color: ${(props) =>
    props.$colorStyle?.textColor ||
    (props.children === "0" ? "#4A5568" : "white")};
  padding: 0.4rem 1rem;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  opacity: ${(props) =>
    props.$colorStyle?.opacity || (props.children === "0" ? 0.9 : 1)};
  box-shadow: ${(props) =>
    props.children === "0"
      ? "0 2px 8px rgba(0, 0, 0, 0.06)"
      : "0 4px 12px rgba(43, 108, 176, 0.15), 0 0 0 1px rgba(43, 108, 176, 0.2)"};
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  &::after {
    content: ${(props) => (props.children === "0" ? "' New'" : "' messages'")};
    font-size: 0.75rem;
    opacity: 0.9;
    font-weight: 500;
    margin-left: 1px;
  }

  ${ConversationCard}:hover & {
    transform: translateY(-50%) scale(1.05);
    box-shadow: ${(props) =>
      props.children === "0"
        ? "0 4px 12px rgba(0, 0, 0, 0.08)"
        : "0 8px 16px rgba(43, 108, 176, 0.2), 0 0 0 1px rgba(43, 108, 176, 0.25)"};
  }
`;

export const AnimatedCard = motion.div;

export const ConversationCardSkeleton = styled(motion.div)`
  background: #ffffff;
  opacity: 0.7;
  backdrop-filter: blur(12px);
  border-radius: 16px;
  padding: 1.5rem;
  border: 1px solid #ffffff4d;
  position: relative;
  overflow: hidden;

  &::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.8) 50%,
      transparent 100%
    );
    animation: shimmer 1.5s infinite;
  }

  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }
`;

export const ErrorContainer = styled(motion.div)`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  background: #fed7d7;
  color: #c53030;
  border-radius: 8px;
  margin: 1rem;
`;

export const NewChatFloatingButton = styled(motion.button)`
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 56px;
  height: 56px;
  border-radius: 28px;
  background: #4299e1;
  color: white;
  border: none;
  box-shadow: 0 4px 6px rgba(66, 153, 225, 0.2);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;

  svg {
    width: 24px;
    height: 24px;
  }

  &:hover {
    background: #3182ce;
    transform: translateY(-2px);
    box-shadow: 0 6px 8px rgba(66, 153, 225, 0.3);
  }
`;

export const FilterContainer = styled.div`
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  background: white;
  border-bottom: 1px solid #e2e8f0;
  z-index: 10;
`;
