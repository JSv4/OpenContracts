import styled from "styled-components";
import _ from "lodash";

interface TokenSpanProps {
  hidden?: boolean;
  color?: string;
  isSelected?: boolean;
  highOpacity?: boolean;
}

export const TokenSpan = styled.span<TokenSpanProps>(
  ({ theme, hidden, color, isSelected, highOpacity }) => `
    position: absolute;
    background: ${
      isSelected ? (color ? color.toUpperCase() : theme.color.B3) : "none"
    };
    opacity: ${hidden ? 0.0 : highOpacity ? 0.4 : 0.2};
    border-radius: 3px;
`
);

interface SelectionTokenSpanProps {
  id?: string;
  hidden?: boolean;
  color?: string;
  isSelected?: boolean;
  highOpacity?: boolean;
  left: number;
  right: number;
  top: number;
  bottom: number;
  pointerEvents: string;
  theme?: any;
}

export const SelectionTokenSpan = styled.span.attrs(
  ({
    id,
    theme,
    top,
    bottom,
    left,
    right,
    pointerEvents,
    hidden,
    color,
    isSelected,
    highOpacity,
  }: SelectionTokenSpanProps) => ({
    id,
    style: {
      background: isSelected
        ? color
          ? color.toUpperCase()
          : theme.color.B3
        : "none",
      opacity: hidden ? 0.0 : highOpacity ? 0.4 : 0.2,
      left: `${left}px`,
      top: `${top}px`,
      width: `${right - left}px`,
      height: `${bottom - top}px`,
      pointerEvents: pointerEvents,
    },
  })
)`
  position: absolute;
  border-radius: 3px;
`;
