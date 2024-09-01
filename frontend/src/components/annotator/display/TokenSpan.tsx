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
