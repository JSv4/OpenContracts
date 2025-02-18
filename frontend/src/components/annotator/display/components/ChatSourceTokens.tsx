/**
 * ChatSourceTokens.tsx - Token highlights (similar to SelectionTokens).
 */
import React, { FC, useEffect, useRef } from "react";
import styled from "styled-components";
import { PDFPageInfo } from "../../types/pdf";
import { TokenId } from "../../types/annotations";

/**
 * Updated to use TokenId[] instead of string[]
 */
interface ChatSourceTokensProps {
  tokens: TokenId[];
  hidden: boolean;
  color?: string;
  highOpacity?: boolean;
  pageInfo: PDFPageInfo;
  scrollTo?: boolean;
}

const TokenDiv = styled.div<{
  $hidden: boolean;
  $color?: string;
  $highOpacity?: boolean;
}>`
  position: absolute;
  background-color: ${(props) => props.$color ?? "rgba(255, 255, 0, 0.3)"};
  opacity: ${(props) => (props.$hidden ? 0 : props.$highOpacity ? 1 : 0.5)};
  pointer-events: none;
  transition: opacity 0.2s ease-in-out;
`;

export const ChatSourceTokens: FC<ChatSourceTokensProps> = ({
  tokens,
  hidden,
  color,
  highOpacity,
  pageInfo,
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
      {tokens.map((token, i) => {
        const pageToken = pageInfo.tokens?.[token.tokenIndex];
        if (!pageToken) return null;

        const b = pageInfo.getScaledTokenBounds(pageToken);
        const style = {
          left: `${b.left}px`,
          top: `${b.top}px`,
          width: `${b.right - b.left}px`,
          height: `${b.bottom - b.top}px`,
        };

        return (
          <TokenDiv
            key={i}
            $hidden={hidden}
            $color={color}
            $highOpacity={highOpacity}
            style={style}
          />
        );
      })}
    </div>
  );
};
