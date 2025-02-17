import { FC } from "react";
import { ChatSourceTokenResult } from "../../context/ChatSourceAtom";
import { PDFPageInfo } from "../../types/pdf";
import { ResultBoundary } from "./ResultBoundary";
import { SearchSelectionTokens } from "./SelectionTokens";

interface ChatSourceTokenProps {
  source: ChatSourceTokenResult;
  pageInfo: PDFPageInfo;
  hidden: boolean;
  showBoundingBox?: boolean;
  scrollIntoView?: boolean;
}

export const ChatSourceToken: FC<ChatSourceTokenProps> = ({
  source,
  pageInfo,
  hidden,
  showBoundingBox = true,
  scrollIntoView = false,
}) => {
  const color = "#5C7C9D"; // Our agreed muted steel blue

  const bounds = pageInfo.getScaledBounds(
    source.bounds[pageInfo.page.pageNumber - 1]
  );

  return (
    <>
      <ResultBoundary
        id={source.id}
        hidden={hidden}
        showBoundingBox={showBoundingBox}
        color={color}
        bounds={bounds}
        selected={false}
        scrollIntoView={scrollIntoView}
      />
      {source.tokens[pageInfo.page.pageNumber - 1] !== undefined && (
        <SearchSelectionTokens
          color={color}
          highOpacity={!showBoundingBox}
          hidden={hidden}
          pageInfo={pageInfo}
          tokens={source.tokens[pageInfo.page.pageNumber - 1]}
        />
      )}
    </>
  );
};
