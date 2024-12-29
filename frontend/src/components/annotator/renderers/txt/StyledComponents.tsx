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

const fadeInSlide = keyframes`
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

// Label Components
export const LabelContainer = styled.div`
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
    background-color: ${(props) => props.color || "#cccccc"};
    opacity: 0.8;
  }
`;

// Adjusted to handle spiral movement
export const Label = styled.span<{ color: string; $index: number }>`
  padding: 4px 8px;
  border-radius: 4px;
  background-color: ${(props) => props.color};
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
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }
`;

// Styled container for the text
interface PaperContainerProps {
  maxHeight?: string;
  maxWidth?: string;
}

export const PaperContainer = styled.div<PaperContainerProps>`
  background-color: #f9f9f9;
  padding: 1em;
  font-family: "Helvetica Neue", Arial, sans-serif;
  line-height: 1.6;
  position: relative;
  user-select: text;
  overflow: auto;
  width: 100%;
  height: 100%;
  flex: 1 1 auto;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  white-space: normal;

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
