import { motion } from "framer-motion";
import { Button, Input } from "semantic-ui-react";
import styled from "styled-components";

export const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: white;
  /* Ensure chat messages can scroll without causing horizontal overflows */
  overflow: hidden;
`;

export const ChatInputContainer = styled.div`
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

export const ChatInput = styled(Input)`
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

export const ConversationIndicator = styled(motion.div)`
  position: absolute;
  top: 1rem;
  right: 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
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

export const ConnectionStatus = styled(motion.div)<ConnectionStatusProps>`
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
