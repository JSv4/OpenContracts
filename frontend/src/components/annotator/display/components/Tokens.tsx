import styled, { DefaultTheme } from "styled-components";
import _ from "lodash";

/**
 * Narrow theme interface containing only the colour tokens this
 * module needs.  This avoids a global theme augmentation while
 * remaining fully type-safe.
 */
// Remove ColorTheme interface
// interface ColorTheme extends DefaultTheme {
//   color: {
//     B3: string;
//     // Add further colour keys here as needed
//     [key: string]: string;
//   };
// }

interface TokenSpanProps {
  hidden?: boolean;
  color?: string;
  isSelected?: boolean;
  highOpacity?: boolean;
}

export const TokenSpan = styled.span.attrs<
  TokenSpanProps & { theme: DefaultTheme }
>((props) => ({
  style: {
    background: props.isSelected
      ? props.color
        ? props.color.toUpperCase()
        : props.theme.color.B3
      : "none",
    opacity: props.hidden ? 0.0 : props.highOpacity ? 0.4 : 0.2,
  },
}))`
  position: absolute;
  border-radius: 3px;
`;

interface SelectionTokenSpanProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  top: number;
  bottom: number;
  left: number;
  right: number;
  pointerEvents?: React.CSSProperties["pointerEvents"];
  hidden?: boolean;
  color?: string;
  isSelected?: boolean;
  highOpacity?: boolean;
}

/* ------------------------------------------------------------------ */
/* SelectionTokenSpan                                                 */
/* ------------------------------------------------------------------ */
interface SelectionTokenSpanThemeProps extends SelectionTokenSpanProps {
  theme: DefaultTheme;
}

export const SelectionTokenSpan = styled.span.attrs<SelectionTokenSpanThemeProps>(
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
