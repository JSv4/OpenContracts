import { motion } from "framer-motion";
import { Button, Input } from "semantic-ui-react";
import styled from "styled-components";

export const BackButton = styled(motion.button)`
  position: absolute;
  top: 1rem;
  left: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.8);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  svg {
    transition: transform 0.2s ease;
  }
`;

export const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh; // Full viewport height
  background: linear-gradient(150deg, #f8faff 0%, #f0f4f8 100%);
  overflow: hidden;
  border-left: 1px solid rgba(226, 232, 240, 0.3);
  position: relative;
`;

export const ChatInputContainer = styled(motion.div)<{ $isTyping: boolean }>`
  padding: 1.25rem 1.5rem;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  border-top: 1px solid rgba(226, 232, 240, 0.5);
  box-shadow: 0 -8px 32px rgba(23, 25, 35, 0.08),
    0 -1px 4px rgba(23, 25, 35, 0.02);
  display: flex;
  align-items: center;
  gap: 1rem;
  z-index: 10;

  /* Safe area support for modern devices */
  padding-bottom: calc(1.25rem + env(safe-area-inset-bottom));
`;

export const ChatInput = styled(Input)`
  &&& {
    flex: 1;
    position: relative;

    input {
      width: 100%;
      border-radius: 1.5rem !important;
      padding: 1.25rem 1.75rem !important;
      padding-right: 4rem !important;
      border: 2px solid rgba(226, 232, 240, 0.5) !important;
      background: rgba(255, 255, 255, 0.9) !important;
      backdrop-filter: blur(12px) !important;
      color: #1a202c !important;
      font-weight: 500 !important;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
      height: 3.5rem !important;
      font-size: 1rem !important;

      &:focus {
        border-color: #3182ce !important;
        background: rgba(255, 255, 255, 1) !important;
        box-shadow: 0 0 0 4px rgba(49, 130, 206, 0.15) !important;
        transform: translateY(-1px);
      }

      &::placeholder {
        color: #718096 !important;
        font-weight: 400 !important;
        opacity: 0.8;
      }
    }
  }
`;

export const ConversationIndicator = styled(motion.div)`
  position: absolute;
  top: 1rem;
  right: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  height: 100%;
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

export const SendButton = styled(Button)`
  &&& {
    position: absolute;
    right: 0.375rem;
    height: 2.75rem;
    width: 2.75rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #3182ce 0%, #2c5282 100%);
    border: none;
    color: white;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    padding: 0;
    margin: 0.375rem;

    &:hover:not(:disabled) {
      transform: translateY(-2px) scale(1.05);
      background: linear-gradient(135deg, #2b6cb0 0%, #2a4365 100%);
      box-shadow: 0 8px 16px rgba(49, 130, 206, 0.25);
    }

    &:disabled {
      background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e0 100%);
      cursor: not-allowed;
      opacity: 0.7;
    }

    svg {
      width: 1.25rem;
      height: 1.25rem;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
    }
  }
`;

interface ConnectionStatusProps {
  connected: boolean;
}

export const ConnectionStatus = styled(motion.div)<ConnectionStatusProps>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: ${(props) => (props.connected ? "#48bb78" : "#a0aec0")};
  font-weight: 500;
  padding: 0.5rem 1rem;
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(226, 232, 240, 0.5);
  transition: all 0.2s ease-out;

  &::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${(props) => (props.connected ? "#48bb78" : "#a0aec0")};
    display: block;
    box-shadow: 0 0 0 rgba(72, 187, 120, 0.4);
    animation: ${(props) =>
      props.connected ? "glow 1.5s infinite" : "pulse 2s infinite"};
  }

  @keyframes glow {
    0% {
      box-shadow: 0 0 0 0 rgba(72, 187, 120, 0.4);
    }
    70% {
      box-shadow: 0 0 0 6px rgba(72, 187, 120, 0);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(72, 187, 120, 0);
    }
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

export const ConversationGrid = styled(motion.div)`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.5rem;
  width: 100%;
  height: calc(100vh - 7rem); // Account for header/footer space
  overflow-y: auto;
  scroll-behavior: smooth;
  margin-bottom: 5.5rem; // Space for input container

  /* Silky smooth scrolling for modern browsers */
  overflow-y: overlay;
  scrollbar-gutter: stable;

  /* Elegant scrollbar styling */
  &::-webkit-scrollbar {
    width: 8px;
    background: transparent;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.02);
    border-radius: 4px;
    margin: 0.5rem;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.08);
    border-radius: 4px;
    border: 2px solid transparent;
    background-clip: padding-box;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(0, 0, 0, 0.12);
      border-width: 1px;
    }
  }

  /* Prevent content jump on short pages */
  &::after {
    content: "";
    min-height: 0.5rem;
    padding-bottom: env(safe-area-inset-bottom);
  }
`;

export const CardGlow = styled.div<{ mouseX?: number; mouseY?: number }>`
  position: absolute;
  inset: 0;
  background: radial-gradient(
    800px circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
    rgba(49, 130, 206, 0.06),
    transparent 40%
  );
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
`;

export const ConversationCard = styled(motion.div)`
  position: relative;
  background: linear-gradient(
    to bottom right,
    rgba(255, 255, 255, 0.98),
    rgba(255, 255, 255, 0.94)
  );
  backdrop-filter: blur(12px);
  border-radius: 16px;
  padding: 1.75rem;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.8);
  transition: all 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  width: 100%;
  min-height: 6rem;
  display: flex;
  align-items: center;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02), 0 4px 16px rgba(0, 0, 0, 0.02),
    0 4px 24px rgba(0, 0, 0, 0.02), inset 0 0 0 1px rgba(255, 255, 255, 0.5);

  &:before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 16px;
    padding: 1px;
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.5) 0%,
      rgba(255, 255, 255, 0.2) 50%,
      transparent 100%
    );
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask: linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
  }

  &:hover {
    transform: translateY(-2px) scale(1.005);
    background: linear-gradient(
      to bottom right,
      rgba(255, 255, 255, 1),
      rgba(255, 255, 255, 0.98)
    );
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.04), 0 12px 32px rgba(0, 0, 0, 0.04),
      0 0 0 1px rgba(255, 255, 255, 0.9),
      inset 0 0 0 1px rgba(255, 255, 255, 0.6);
  }

  &:active {
    transform: translateY(0) scale(0.995);
    transition: all 0.1s ease;
  }
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

export const CardContent = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 1;
  min-width: 0; // Enables text truncation
`;

export const CardTitle = styled.h3`
  color: #1a202c;
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
  letter-spacing: -0.01em;
  line-height: 1.4;
  padding-right: 5.5rem; // Space for message count

  /* Enhanced gradient text */
  background: linear-gradient(135deg, #1a202c 0%, #2d3748 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  text-fill-color: transparent;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  ${ConversationCard}:hover & {
    background: linear-gradient(135deg, #000000 0%, #1a202c 100%);
    -webkit-background-clip: text;
    background-clip: text;
  }
`;

export const CardMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.9rem;
  color: #4a5568;
  margin: 0;
  line-height: 1.6;
  flex-wrap: wrap;
`;

export const TimeStamp = styled.span`
  color: #718096;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  opacity: 0.9;
  white-space: nowrap;

  &::before {
    content: "•";
    color: #cbd5e0;
    opacity: 0.6;
  }
`;

export const Creator = styled.span`
  color: #2d3748;
  font-size: 0.85rem;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
`;

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
  gap: 0.5rem;
  padding: 1rem;
  color: #dc3545;
  background: rgba(220, 53, 69, 0.1);
  border-radius: 8px;
  margin: 1rem;
`;

export const NewChatFloatingButton = styled(motion.button)`
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #2b6cb0 0%, #2c5282 100%);
  border: none;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(43, 108, 176, 0.2),
    0 2px 4px rgba(43, 108, 176, 0.1), inset 0 0 0 1px rgba(255, 255, 255, 0.1);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 100;

  /* Safe area support */
  padding-bottom: env(safe-area-inset-bottom);
  margin-bottom: env(safe-area-inset-bottom);

  &:hover {
    transform: translateY(-2px) scale(1.05);
    background: linear-gradient(135deg, #3182ce 0%, #2b6cb0 100%);
    box-shadow: 0 8px 24px rgba(43, 108, 176, 0.25),
      0 4px 8px rgba(43, 108, 176, 0.15),
      inset 0 0 0 1px rgba(255, 255, 255, 0.2);
  }

  &:active {
    transform: translateY(0) scale(0.98);
    transition: all 0.1s ease;
  }

  svg {
    width: 1.5rem;
    height: 1.5rem;
    stroke-width: 2;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
  }

  /* Optional: Add a tooltip on hover */
  &::before {
    content: "New Chat";
    position: absolute;
    right: 120%;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    font-size: 0.875rem;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: all 0.2s ease;
  }

  &:hover::before {
    opacity: 1;
    transform: translateY(-50%) translateX(-0.5rem);
  }
`;
