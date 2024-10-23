import { useEffect, useRef } from "react";
import { PDFPageInfo, TokenId } from "../../context";

import uniqueId from "lodash/uniqueId";
import styled from "styled-components";

// Add interface for the custom props
interface SelectionBoxProps {
  isSelected?: boolean;
  highOpacity?: boolean;
  color?: string;
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  pointerEvents?: string;
}

// Update the styled component definition to include the custom props
const SelectionBox = styled.span<SelectionBoxProps>`
  position: absolute;
  background-color: ${(props) => props.color || "yellow"};
  opacity: ${(props) => (props.highOpacity ? 0.5 : 0.3)};
  pointer-events: none;
  ${(props) =>
    props.isSelected &&
    `
    border: 2px solid blue;
  `}
  ${(props) => props.left !== undefined && `left: ${props.left}px;`}
  ${(props) => props.right !== undefined && `right: ${props.right}px;`}
  ${(props) => props.top !== undefined && `top: ${props.top}px;`}
  ${(props) => props.bottom !== undefined && `bottom: ${props.bottom}px;`}
`;

export interface SelectionTokenGroupProps {
  id?: string;
  color?: string;
  className?: string;
  hidden?: boolean;
  pageInfo: PDFPageInfo;
  highOpacity?: boolean;
  tokens: TokenId[] | null;
  scrollTo?: boolean;
}

export const SelectionTokenGroup = ({
  id,
  color,
  className,
  hidden,
  pageInfo,
  highOpacity,
  tokens,
  scrollTo,
}: SelectionTokenGroupProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollTo) {
      if (containerRef.current !== undefined && containerRef.current !== null) {
        console.log("Scroll to", scrollTo);
        containerRef.current.scrollIntoView();
      }
    }
  }, [scrollTo]);

  return (
    <div ref={containerRef} id={`SelectionTokenWrapper_${uniqueId()}`}>
      {tokens ? (
        tokens.map((t, i) => {
          const b = pageInfo.getScaledTokenBounds(
            pageInfo.tokens[t.tokenIndex]
          );
          return (
            <SelectionBox
              id={`${uniqueId()}`}
              hidden={hidden}
              key={i}
              className={className}
              isSelected={true}
              highOpacity={highOpacity}
              color={color ? color : undefined}
              left={b.left}
              right={b.right}
              top={b.top}
              bottom={b.bottom}
              pointerEvents="none"
            />
          );
        })
      ) : (
        <></>
      )}
    </div>
  );
};
