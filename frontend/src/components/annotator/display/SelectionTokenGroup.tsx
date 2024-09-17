import { useEffect, useRef } from "react";
import { PDFPageInfo, TokenId } from "../context";
import { SelectionTokenSpan } from "./Tokens";

import uniqueId from "lodash/uniqueId";

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
            <SelectionTokenSpan
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
