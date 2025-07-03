import { motion } from "framer-motion";
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
  margin-bottom: 0.75rem;

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

  /* Add smooth transitions for resize */
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  /* Enhance visual hierarchy */
  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(
      to right,
      transparent,
      rgba(66, 153, 225, 0.1),
      transparent
    );
  }
`;

export const ChatInputContainer = styled(motion.div)<{ $isTyping?: boolean }>`
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  padding: 1rem;
  background: white;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.03);

  /* Glass morphism effect */
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.98);

  /* Smooth transitions */
  transition: all 0.2s ease;

  /* Ensure proper containment */
  box-sizing: border-box;
  width: 100%;
  min-height: auto;
  max-height: 40vh; /* Limit maximum expansion */

  &:focus-within {
    box-shadow: 0 -2px 20px rgba(66, 153, 225, 0.08);
    border-top-color: rgba(66, 153, 225, 0.2);
  }
`;

export const ChatInputWrapper = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  background: #f8fafb;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  transition: all 0.2s ease;
  overflow: hidden;

  &:hover {
    border-color: #cbd5e0;
    background: #f7fafc;
  }

  &:focus-within {
    border-color: #4299e1;
    background: white;
    box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.1);
  }
`;

export const ChatInput = styled.textarea`
  width: 100%;
  padding: 0.875rem 1rem;
  border: none;
  font-size: 0.95rem;
  line-height: 1.5;
  font-family: inherit;
  resize: none;
  outline: none;
  background: transparent;
  color: #2d3748;
  min-height: 44px;
  max-height: 200px;
  overflow-y: auto;

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: #cbd5e0;
    border-radius: 3px;

    &:hover {
      background: #a0aec0;
    }
  }

  &::placeholder {
    color: #a0aec0;
    transition: opacity 0.2s ease;
  }

  &:focus::placeholder {
    opacity: 0.6;
  }

  &:disabled {
    background: transparent;
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

export const CharacterCount = styled.div<{ $nearLimit?: boolean }>`
  position: absolute;
  bottom: 0.5rem;
  right: 0.75rem;
  font-size: 0.75rem;
  color: ${(props) => (props.$nearLimit ? "#e53e3e" : "#a0aec0")};
  transition: all 0.2s ease;
  pointer-events: none;
  opacity: 0.7;
`;

export const SendButton = styled(motion.button)<{ $hasText?: boolean }>`
  background: ${(props) => (props.$hasText ? "#4299e1" : "#e2e8f0")};
  color: ${(props) => (props.$hasText ? "white" : "#a0aec0")};
  border: none;
  border-radius: 10px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: ${(props) => (props.$hasText ? "pointer" : "not-allowed")};
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  align-self: flex-end;
  flex-shrink: 0;

  &:hover {
    background: ${(props) => (props.$hasText ? "#3182ce" : "#e2e8f0")};
    transform: ${(props) => (props.$hasText ? "scale(1.05)" : "none")};
  }

  &:active {
    transform: ${(props) => (props.$hasText ? "scale(0.95)" : "none")};
  }

  &:disabled {
    background: #e2e8f0;
    color: #a0aec0;
    cursor: not-allowed;
    transform: none !important;
  }

  svg {
    width: 18px;
    height: 18px;
    transition: transform 0.2s ease;
  }

  &:hover svg {
    transform: ${(props) =>
      props.$hasText ? "translateX(1px) translateY(-1px)" : "none"};
  }
`;

export const InputActions = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-top: 1px solid rgba(226, 232, 240, 0.5);
  background: rgba(249, 250, 251, 0.5);
`;

export const ActionButton = styled(motion.button)`
  background: transparent;
  border: none;
  color: #718096;
  padding: 0.25rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: rgba(0, 0, 0, 0.05);
    color: #4a5568;
  }

  svg {
    width: 18px;
    height: 18px;
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
  grid-template-columns: 1fr;
  gap: 0.75rem;
  padding: 0.75rem;
  width: 100%;
  overflow-y: auto;
  position: relative;
`;

export const ConversationCard = styled(motion.div)`
  display: grid;
  grid-template-columns: 1fr;
  grid-template-areas:
    "content"
    "meta";
  background: white;
  border-radius: 12px;
  padding: 1.5rem 1.75rem;
  cursor: pointer;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.05);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: visible;

  &::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 3px;
    height: 100%;
    background: linear-gradient(to bottom, #4299e1, #2b6cb0);
    opacity: 0.7;
    transition: width 0.3s ease;
  }

  &:hover {
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.08);
    border-color: rgba(66, 153, 225, 0.3);
    transform: translateY(-2px);

    &::before {
      width: 6px;
    }
  }
`;

export const CardContent = styled.div`
  grid-area: content;
  min-width: 0;
  padding-right: 3rem; /* Make space for the badge */
`;

export const CardTitle = styled.h3`
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #2d3748;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  position: relative;
  padding-bottom: 0.25rem;

  &::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 0;
    width: 0;
    height: 2px;
    background: linear-gradient(to right, #4299e1, transparent);
    transition: width 0.3s ease;
  }

  ${ConversationCard}:hover & {
    &::after {
      width: 100%;
    }
  }
`;

export const CardMeta = styled.div`
  grid-area: meta;
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 0.75rem;
  font-size: 0.875rem;
`;

export const TimeStamp = styled.span`
  color: #718096;
  display: flex;
  align-items: center;

  &::before {
    content: "";
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background-color: #4299e1;
    margin-right: 6px;
  }
`;

export const Creator = styled.span`
  color: #4a5568;
  font-weight: 500;
  position: relative;
  padding-left: 12px;

  &::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 12px;
    width: 1px;
    background-color: #cbd5e0;
  }
`;

export const MessageCount = styled(motion.div)<{
  $colorStyle?: { background: string; opacity: number; textColor: string };
}>`
  position: absolute;
  top: 50%;
  right: -12px; /* Extend beyond the card boundary */
  transform: translateY(-50%);
  background: ${(props) =>
    props.$colorStyle?.background ||
    (props.children === "0"
      ? "linear-gradient(135deg, #EDF2F7 0%, #E2E8F0 100%)"
      : "linear-gradient(135deg, #2B6CB0 0%, #2C5282 100%)")};
  color: ${(props) =>
    props.$colorStyle?.textColor ||
    (props.children === "0" ? "#4A5568" : "white")};
  padding: 0.4rem 0.75rem;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  opacity: ${(props) =>
    props.$colorStyle?.opacity || (props.children === "0" ? 0.9 : 1)};
  box-shadow: ${(props) =>
    props.children === "0"
      ? "0 2px 8px rgba(0, 0, 0, 0.06)"
      : "0 4px 12px rgba(43, 108, 176, 0.15), 0 0 0 1px rgba(43, 108, 176, 0.2)"};
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  height: 2rem;
  z-index: 2;

  &::after {
    content: ${(props) => (props.children === "0" ? "' New'" : "' msgs'")};
    font-size: 0.7rem;
    opacity: 0.9;
    font-weight: 500;
    margin-left: 3px;
  }

  ${ConversationCard}:hover & {
    transform: translateY(-50%) translateX(-4px);
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
