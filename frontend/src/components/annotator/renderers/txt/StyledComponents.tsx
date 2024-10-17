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

// Label Components
export const LabelContainer = styled.div`
  position: absolute;
  display: flex;
  align-items: center;
  z-index: 10000;
`;

// Adjusted to handle spiral movement
export const Label = styled.span<{ color: string; $index: number }>`
  padding: 0.125em 0.5em;
  border-radius: 0.25em;
  background-color: ${(props) => props.color};
  color: white;
  font-size: 0.85em;
  margin-right: 0.5em; // Adjusted margin
  position: relative;
  white-space: nowrap;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  ${({ $index }) => css`
    animation: ${spiralOut} 0.5s forwards;
    animation-delay: ${$index * 0.05}s;
  `}
  pointer-events: auto;
  cursor: pointer;
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
