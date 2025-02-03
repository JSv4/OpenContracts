import styled, { keyframes, css } from "styled-components";

// Define keyframes for label animations
export const spiralOut = keyframes`
  from {
    opacity: 0;
    transform: translate(0, 0) scale(0.5);
  }
  to {
    opacity: 1;
    transform: translate(var(--x), var(--y)) scale(1);
  }
`;

// Enhanced version of the existing fadeInSlide animation
const fadeInSlide = keyframes`
  from {
    opacity: 0;
    transform: translateX(-10px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
`;

// Add a subtle hover animation
const pulseGlow = keyframes`
  0% {
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  50% {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  100% {
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
`;

// Label Components
export const LabelContainer = styled.div<{ color: string }>`
  position: absolute;
  display: flex;
  align-items: center;
  z-index: 10000;
  transform-origin: left center;
  transition: all 0.2s ease;

  &::before {
    content: "";
    position: absolute;
    left: -8px;
    top: 50%;
    transform: translateY(-50%);
    width: 8px;
    height: 2px;
    background-color: ${(props) => props.color};
    opacity: 0.8;
    transition: all 0.2s ease;
  }

  &:hover::before {
    width: 12px;
    opacity: 1;
  }

  /* Enhanced hover animation for RadialButtonCloud */
  & > div:last-child {
    opacity: 0;
    transform: translateX(-4px) scale(0.9);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  &:hover > div:last-child {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
`;

// Adjusted to handle spiral movement
export const Label = styled.span<{ color: string; $index: number }>`
  padding: 4px 12px;
  border-radius: 6px;
  background-color: ${(props) =>
    `${props.color}f0`}; // Added slight transparency
  color: white;
  font-size: 0.85em;
  white-space: nowrap;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  opacity: 0;
  transform: translateX(-10px);
  animation: ${fadeInSlide} 0.3s forwards;
  animation-delay: ${(props) => props.$index * 0.05}s;
  pointer-events: auto;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 4px;
  backdrop-filter: blur(4px);

  &:hover {
    transform: translateY(-2px) scale(1.02);
    animation: ${pulseGlow} 2s infinite;
    background-color: ${(props) => props.color}; // Full opacity on hover
  }

  &::after {
    content: "⋮";
    opacity: 0.7;
    font-size: 1.2em;
    font-weight: bold;
    padding-left: 4px;
    transition: all 0.2s ease;
    transform: rotate(90deg);
  }

  &:hover::after {
    opacity: 1;
    transform: rotate(90deg) scale(1.1);
  }
`;

// Styled container for the text
interface PaperContainerProps {
  maxHeight?: string;
  maxWidth?: string;
}

export const PaperContainer = styled.div<PaperContainerProps>`
  background-color: #ffffff;
  background-image: linear-gradient(#f9f9f9 1px, transparent 1px);
  background-size: 100% 1.6em;
  padding: 1.5em;
  font-family: "Helvetica Neue", Arial, sans-serif;
  line-height: 1.6;
  position: relative;
  user-select: text;
  overflow: auto;
  width: 100%;
  height: 100%;
  flex: 1 1 auto;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05);
  white-space: normal;
  transition: all 0.2s ease;

  &:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.05);
  }

  ${(props) =>
    props.maxWidth &&
    css`
      max-width: ${props.maxWidth};
    `}
  ${(props) =>
    props.maxHeight &&
    css`
      max-height: ${props.maxHeight};
    `}
`;
