import React, { FC, useEffect, useRef } from "react";
import styled from "styled-components";
import { PDFPageInfo } from "../../types/pdf";

/**
 * For your new tokens, which are just string indexes (e.g. "42"),
 * we define a simpler prop type.
 */
interface SourceSelectionTokenProps {
  color?: string;
  hidden: boolean;
  pageInfo: PDFPageInfo;
  highOpacity?: boolean;
  tokens: string[]; // the string-based token indexes
  scrollTo?: boolean;
  className?: string;
}

/**
 * Basic styled div for token highlighting.
 */
const TokenSpan = styled.div<{
  hidden: boolean;
  isSelected: boolean;
  highOpacity?: boolean;
  color?: string;
}>`
  position: absolute;
  background-color: ${(props) =>
    props.color ? props.color : "rgba(255, 255, 0, 0.3)"};
  opacity: ${(props) => (props.hidden ? 0 : props.highOpacity ? 1 : 0.5)};
  pointer-events: none;
  transition: opacity 0.2s ease-in-out;
`;

export const SourceSelectionTokens: FC<SourceSelectionTokenProps> = ({
  color,
  className,
  hidden,
  pageInfo,
  highOpacity,
  tokens,
  scrollTo,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollTo && containerRef.current) {
      containerRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [scrollTo]);

  return (
    <div ref={containerRef}>
      {tokens.map((tokenIndexStr, i) => {
        const tokenIndex = parseInt(tokenIndexStr, 10);
        const pageToken = pageInfo.tokens?.[tokenIndex];
        if (!pageToken) return null;

        // Use PDFPageInfo's getScaledTokenBounds() to get bounding box
        const b = pageInfo.getScaledTokenBounds(pageToken);

        return (
          <TokenSpan
            key={i}
            hidden={hidden}
            isSelected={true}
            highOpacity={highOpacity}
            color={color}
            className={className}
            style={{
              left: `${b.left}px`,
              top: `${b.top}px`,
              width: `${b.right - b.left}px`,
              height: `${b.bottom - b.top}px`,
              pointerEvents: "none",
            }}
          />
        );
      })}
    </div>
  );
};
