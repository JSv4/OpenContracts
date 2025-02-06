import { motion } from "framer-motion";
import { Button, Input } from "semantic-ui-react";
import styled from "styled-components";

export const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: linear-gradient(150deg, #f8faff 0%, #f0f4f8 100%);
  overflow: hidden;
  border-left: 1px solid rgba(226, 232, 240, 0.3);
`;

export const ChatInputContainer = styled.div`
  padding: 1.5rem;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  position: relative;
  border-top: 1px solid rgba(226, 232, 240, 0.3);
  box-shadow: 0 -4px 20px rgba(23, 25, 35, 0.03);
  display: flex;
  align-items: center;
  gap: 1rem;
`;

export const ChatInput = styled(Input)`
  &&& {
    flex: 1;
    position: relative;

    input {
      width: 100%;
      border-radius: 1.5rem !important;
      padding: 1rem 1.5rem !important;
      padding-right: 3.5rem !important;
      border: 1px solid rgba(226, 232, 240, 0.5) !important;
      background: rgba(255, 255, 255, 0.8) !important;
      backdrop-filter: blur(8px) !important;
      color: #1a202c !important;
      font-weight: 500 !important;
      transition: all 0.2s ease-out !important;
      height: 3rem !important;

      &:focus {
        border-color: #3182ce !important;
        background: rgba(255, 255, 255, 0.95) !important;
        box-shadow: 0 0 0 3px rgba(49, 130, 206, 0.1) !important;
      }

      &::placeholder {
        color: #718096 !important;
        font-weight: 400 !important;
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
    right: 0.25rem;
    height: 2.5rem;
    width: 2.5rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #3182ce;
    border: none;
    color: white;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    padding: 0;
    margin: 0.25rem;

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      background: #2c5282;
      box-shadow: 0 4px 12px rgba(49, 130, 206, 0.25);
    }

    &:disabled {
      background: #e2e8f0;
      cursor: not-allowed;
    }

    svg {
      width: 1.25rem;
      height: 1.25rem;
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.1));
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
