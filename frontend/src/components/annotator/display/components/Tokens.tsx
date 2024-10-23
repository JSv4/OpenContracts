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

interface SelectionTokenSpanProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  theme?: any;
  top: number;
  bottom: number;
  left: number;
  right: number;
  pointerEvents?: React.CSSProperties["pointerEvents"]; // Update this line
  hidden?: boolean;
  color?: string;
  isSelected?: boolean;
  highOpacity?: boolean;
}

export const SelectionTokenSpan = styled.span.attrs<SelectionTokenSpanProps>(
  (props) => ({
    id: props.id,
    style: {
      background: props.isSelected
        ? props.color
          ? props.color.toUpperCase()
          : props.theme.color.B3
        : "none",
      opacity: props.hidden ? 0.0 : props.highOpacity ? 0.4 : 0.2,
      left: `${props.left}px`,
      top: `${props.top}px`,
      width: `${props.right - props.left}px`,
      height: `${props.bottom - props.top}px`,
      pointerEvents: props.pointerEvents,
    },
  })
)`
  position: absolute;
  border-radius: 3px;
`;
