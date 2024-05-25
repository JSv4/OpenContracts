import { useEffect, useRef } from "react";
import _ from "lodash";
import uniqueId from "lodash/uniqueId";

import { TokenId, PDFPageInfo } from "./context";
import {} from "./";
import { TokenSpan } from "./TokenSpan";

interface SearchSelectionTokenProps {
  color?: string;
  className?: string;
  hidden?: boolean;
  pageInfo: PDFPageInfo;
  highOpacity?: boolean;
  tokens: TokenId[] | null;
  scrollTo?: boolean;
}

export const SearchSelectionTokens = ({
  color,
  className,
  hidden,
  pageInfo,
  highOpacity,
  tokens,
  scrollTo,
}: SearchSelectionTokenProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollTo) {
      if (containerRef.current !== undefined && containerRef.current !== null) {
        // console.log("Scroll to", scrollTo);
        containerRef.current.scrollIntoView();
      }
    }
  }, [scrollTo]);

  return (
    <div ref={containerRef} id={`SearchSelectionTokenWrapper_${uniqueId()}`}>
      {tokens ? (
        tokens.map((t, i) => {
          const b = pageInfo.getScaledTokenBounds(
            pageInfo.tokens[t.tokenIndex]
          );
          return (
            <TokenSpan
              hidden={hidden}
              key={i}
              className={className}
              isSelected={true}
              highOpacity={highOpacity}
              color={color ? color : undefined}
              style={{
                left: `${b.left}px`,
                top: `${b.top}px`,
                width: `${b.right - b.left}px`,
                height: `${b.bottom - b.top}px`,
                // Tokens don't respond to pointerEvents because
                // they are ontop of the bounding boxes and the canvas,
                // which do respond to pointer events.
                pointerEvents: "none",
              }}
            />
          );
        })
      ) : (
        <></>
      )}
    </div>
  );
};
