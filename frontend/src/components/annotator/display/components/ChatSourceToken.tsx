import { FC } from "react";
import { ChatMessageSource } from "../../context/ChatSourceAtom";
import { PDFPageInfo } from "../../types/pdf";
import { ChatSourceBoundary } from "./ChatSourceBoundary";
import { ChatSourceTokens } from "./ChatSourceTokens";

interface ChatSourceTokenProps {
  source: ChatMessageSource;
  pageInfo: PDFPageInfo;
  hidden: boolean;
  showBoundingBox?: boolean;
  scrollIntoView?: boolean;
  /** If you want to highlight it as "selected" for a pinned annotation. */
  selected?: boolean;
}

/**
 * Renders bounding box + token highlights for a given ChatMessageSource
 * on the appropriate PDF page.
 */
export const ChatSourceToken: FC<ChatSourceTokenProps> = ({
  source,
  pageInfo,
  hidden,
  showBoundingBox = true,
  scrollIntoView = false,
  selected = false,
}) => {
  const color = "#5C7C9D"; // e.g. your highlight color
  const pageNumber = pageInfo.page.pageNumber;

  // First check if this source is meant for this page
  if (source.page !== pageNumber) {
    // This source isn't meant for this page
    return null;
  }

  console.log("[ChatSourceToken] Attempting to render for:", {
    sourceId: source.id,
    sourcePage: source.page,
    currentPage: pageNumber,
    hasTokens: !!source.tokensByPage[pageNumber],
    tokenCount: source.tokensByPage[pageNumber]?.length,
    hasBounds: !!source.boundsByPage[pageNumber],
    allTokens: source.tokensByPage,
    allBounds: source.boundsByPage,
  });

  const tokens = source.tokensByPage[pageNumber];
  const bounds = source.boundsByPage[pageNumber];
  if (!tokens && !bounds) {
    console.log("[ChatSourceToken] No tokens or bounds found for:", {
      sourceId: source.id,
      sourcePage: source.page,
      currentPage: pageNumber,
      tokensByPage: source.tokensByPage,
      boundsByPage: source.boundsByPage,
    });
    return null;
  }

  // Draw bounding box as a separate overlay
  let boundaryElement = null;
  if (bounds) {
    console.log("[ChatSourceToken] Rendering bounds:", bounds);
    const scaledBounds = pageInfo.getScaledBounds(bounds);
    boundaryElement = (
      <ChatSourceBoundary
        id={source.id}
        hidden={hidden}
        showBoundingBox={showBoundingBox}
        color={color}
        bounds={scaledBounds}
        scrollIntoView={scrollIntoView}
        selected={selected}
      />
    );
  }

  // Draw token highlights - tokens are already TokenId[] type
  let tokenElements = null;
  if (tokens) {
    console.log("[ChatSourceToken] Rendering tokens:", tokens);
    tokenElements = (
      <ChatSourceTokens
        tokens={tokens}
        hidden={hidden}
        color={color}
        highOpacity={!showBoundingBox}
        pageInfo={pageInfo}
        scrollTo={false}
      />
    );
  }

  return (
    <>
      {boundaryElement}
      {tokenElements}
    </>
  );
};
