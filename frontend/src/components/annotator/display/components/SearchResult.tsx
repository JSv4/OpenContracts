import { useState } from "react";
import styled from "styled-components";
import _ from "lodash";
import { VerticallyJustifiedEndDiv } from "../../sidebar/common";

import { ResultBoundary } from "./ResultBoundary";
import { BoundingBox, TextSearchTokenResult } from "../../../types";
import { getBorderWidthFromBounds } from "../../../../utils/transform";
import { SearchSelectionTokens } from "./SelectionTokens";
import { LabelTagContainer } from "./Containers";
import { PDFPageInfo } from "../../types/pdf";
import { useAnnotationDisplay } from "../../context/UISettingsAtom";

interface SearchResultProps {
  total_results: number;
  showBoundingBox: boolean;
  hidden: boolean;
  pageInfo: PDFPageInfo;
  match: TextSearchTokenResult;
  showInfo?: boolean;
}

export const SearchResult = ({
  total_results,
  showBoundingBox,
  hidden,
  pageInfo,
  match,
  showInfo = true,
}: SearchResultProps) => {
  const { showLabels, hideLabels } = useAnnotationDisplay();

  const color = "#ffff00";
  const [hovered, setHovered] = useState(false);

  const bounds = pageInfo.getScaledBounds(
    match.bounds[pageInfo.page.pageNumber - 1]
  );

  const border = getBorderWidthFromBounds(bounds);

  return (
    <>
      <ResultBoundary
        id={match.id}
        hidden={hidden}
        showBoundingBox={showBoundingBox}
        color={color}
        bounds={bounds}
        selected={false}
        onHover={setHovered}
      >
        {showInfo && !hideLabels ? (
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
                  display_behavior={showLabels}
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
        ) : null
      }
    </>
  );
};

// We use transform here because we need to translate the label upward
// to sit on top of the bounds as a function of *its own* height,
// not the height of its parent.
interface SelectionInfoProps {
  border: number;
  bounds: BoundingBox;
  color: string;
  showBoundingBox: boolean;
}

const SelectionInfo = styled.div.attrs<SelectionInfoProps>(
  ({ border, bounds, color, showBoundingBox }) => ({
    style: {
      position: "absolute",
      width: `${bounds.right - bounds.left}px`,
      right: `-${border}px`,
      transform: "translateY(-100%)",
      border: showBoundingBox
        ? `${border}px solid ${color}`
        : `${border}px solid ${color} transparent`,
      background: showBoundingBox ? color : "rgba(255, 255, 255, 0.0)",
      fontWeight: "bold",
      fontSize: "12px",
      userSelect: "none",
    },
  })
)`
  * {
    vertical-align: middle;
  }
`;

const SelectionInfoContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
`;
