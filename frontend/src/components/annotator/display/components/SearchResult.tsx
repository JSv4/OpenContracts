import React, { useContext, useState } from "react";
import styled from "styled-components";
import _ from "lodash";
import { PDFPageInfo, AnnotationStore } from "../../context";
import { VerticallyJustifiedEndDiv } from "../../sidebar/common";

import { ResultBoundary } from "./ResultBoundary";
import { BoundingBox, TextSearchTokenResult } from "../../../types";
import { LabelDisplayBehavior } from "../../../../graphql/types";
import { getBorderWidthFromBounds } from "../../../../utils/transform";
import { SearchSelectionTokens } from "./SelectionTokens";
import { LabelTagContainer } from "./Containers";

interface SearchResultProps {
  total_results: number;
  selectionRef:
    | React.MutableRefObject<Record<string, HTMLElement | null>>
    | undefined;
  showBoundingBox: boolean;
  hidden: boolean;
  pageInfo: PDFPageInfo;
  match: TextSearchTokenResult;
  labelBehavior: LabelDisplayBehavior;
  showInfo?: boolean;
}

export const SearchResult = ({
  total_results,
  selectionRef,
  showBoundingBox,
  hidden,
  pageInfo,
  labelBehavior,
  match,
  showInfo = true,
}: SearchResultProps) => {
  const color = "#ffff00";
  const [hovered, setHovered] = useState(false);

  const annotationStore = useContext(AnnotationStore);

  console.log("Get scaled result for search result - scale", pageInfo.scale);
  const bounds = pageInfo.getScaledBounds(
    match.bounds[pageInfo.page.pageNumber - 1]
  );
  console.log("Bounds", bounds);

  const border = getBorderWidthFromBounds(bounds);

  return (
    <>
      <ResultBoundary
        id={match.id}
        hidden={hidden}
        showBoundingBox={showBoundingBox}
        selectionRef={selectionRef}
        color={color}
        bounds={bounds}
        selected={false}
        onHover={setHovered}
      >
        {showInfo && !annotationStore.hideLabels ? (
          <SelectionInfo
            bounds={bounds}
            border={border}
            color={color}
            showBoundingBox={showBoundingBox}
          >
            <SelectionInfoContainer>
              <VerticallyJustifiedEndDiv>
                <LabelTagContainer
                  hidden={false}
                  hovered={hovered}
                  color={color}
                  display_behavior={labelBehavior}
                >
                  <div style={{ whiteSpace: "nowrap", overflowX: "visible" }}>
                    <span>
                      Search Result {match.id} of {total_results}
                    </span>
                  </div>
                </LabelTagContainer>
              </VerticallyJustifiedEndDiv>
            </SelectionInfoContainer>
          </SelectionInfo>
        ) : null}
      </ResultBoundary>
      {
        // NOTE: It's important that the parent element of the tokens
        // is the PDF canvas, because we need their absolute position
        // to be relative to that and not another absolute/relatively
        // positioned element. This is why SelectionTokens are not inside
        // SelectionBoundary.
        match.tokens[pageInfo.page.pageNumber - 1] !== undefined ? (
          <SearchSelectionTokens
            color={color}
            highOpacity={!showBoundingBox}
            hidden={hidden}
            pageInfo={pageInfo}
            tokens={match.tokens[pageInfo.page.pageNumber - 1]}
          />
        ) : (
          <></>
        )
      }
    </>
  );
};

// We use transform here because we need to translate the label upward
// to sit on top of the bounds as a function of *its own* height,
// not the height of it's parent.
interface SelectionInfoProps {
  border: number;
  bounds: BoundingBox;
  color: string;
  showBoundingBox: boolean;
}
const SelectionInfo = styled.div<SelectionInfoProps>(
  ({ border, bounds, color, showBoundingBox }) => {
    if (showBoundingBox) {
      return `
        position: absolute;
        width: ${bounds.right - bounds.left}px;
        right: -${border}px;
        transform:translateY(-100%);
        border: ${border} solid  ${color};
        background: ${color};
        font-weight: bold;
        font-size: 12px;
        user-select: none;
        * {
            vertical-align: middle;
        }`;
    } else {
      return `
        position: absolute;
        width: ${bounds.right - bounds.left}px;
        right: -${border}px;
        transform:translateY(-100%);
        border: ${border} solid ${color} transparent;
        background: rgba(255, 255, 255, 0.0);
        font-weight: bold;
        font-size: 12px;
        user-select: none;
        * {
            vertical-align: middle;
        }`;
    }
  }
);

const SelectionInfoContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
`;
