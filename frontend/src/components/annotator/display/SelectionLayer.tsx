import React, { useCallback } from "react";
import { normalizeBounds, PDFPageInfo } from "../context";
import { AnnotationLabelType } from "../../../graphql/types";
import { BoundingBox } from "../../types";
import { SelectionBoundary, SelectionTokens } from "./Selection";

export const SelectionLayer = React.memo(
  ({
    pageInfo,
    activeSpanLabel,
    pageSelection,
    pageQueuedSelections,
  }: {
    pageInfo: PDFPageInfo;
    activeSpanLabel: AnnotationLabelType | undefined;
    pageSelection: { pageNumber: number; bounds: BoundingBox } | undefined;
    pageQueuedSelections: BoundingBox[];
  }) => {
    const ConvertBoundsToSelections = useCallback(
      (
        selection: BoundingBox,
        activeLabel: AnnotationLabelType
      ): JSX.Element => {
        const annotation = pageInfo.getAnnotationForBounds(
          normalizeBounds(selection),
          activeLabel
        );

        const tokens =
          annotation && annotation.tokens ? annotation.tokens : null;

        return (
          <>
            <SelectionBoundary
              showBoundingBox
              hidden={false}
              color={activeLabel.color || ""}
              bounds={selection}
              selected={false}
            />
            <SelectionTokens pageInfo={pageInfo} tokens={tokens} />
          </>
        );
      },
      [pageInfo]
    );

    return (
      <>
        {pageSelection?.pageNumber === pageInfo.page.pageNumber - 1 &&
        activeSpanLabel
          ? ConvertBoundsToSelections(pageSelection.bounds, activeSpanLabel)
          : null}
        {pageQueuedSelections.length > 0 && activeSpanLabel
          ? pageQueuedSelections.map((selection) =>
              ConvertBoundsToSelections(selection, activeSpanLabel)
            )
          : null}
      </>
    );
  }
);
