import React, { useState, useRef, useCallback } from "react";
import {
  BoundingBox,
  PermissionTypes,
  SinglePageAnnotationJson,
} from "../../../types";

import { normalizeBounds } from "../../../../utils/transform";
import { PDFPageInfo } from "../../types/pdf";
import { AnnotationLabelType } from "../../../../types/graphql-api";
import { ServerTokenAnnotation } from "../../types/annotations";
import { SelectionBoundary } from "../../display/components/SelectionBoundary";
import { SelectionTokenGroup } from "../../display/components/SelectionTokenGroup";

interface SelectionLayerProps {
  pageInfo: PDFPageInfo;
  corpus_permissions: PermissionTypes[];
  read_only: boolean;
  activeSpanLabel: AnnotationLabelType | null;
  createAnnotation: (annotation: ServerTokenAnnotation) => void;
  pageNumber: number;
}

const SelectionLayer = ({
  pageInfo,
  corpus_permissions,
  read_only,
  activeSpanLabel,
  createAnnotation,
  pageNumber,
}: SelectionLayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [localPageSelection, setLocalPageSelection] = useState<
    { pageNumber: number; bounds: BoundingBox } | undefined
  >();
  const [multiSelections, setMultiSelections] = useState<{
    [key: number]: BoundingBox[];
  }>({});

  /**
   * Handles the creation of a multi-page annotation.
   *
   * @param selections - The current multi-selections.
   */
  const handleCreateMultiPageAnnotation = useCallback(
    async (selections: { [key: number]: BoundingBox[] }) => {
      if (
        !activeSpanLabel ||
        !selections ||
        Object.keys(selections).length === 0
      ) {
        console.log(
          "handleCreateMultiPageAnnotation - no active label or multiSelections"
        );
        return;
      }

      // Create annotation from multi-selections
      const pages = Object.keys(selections).map(Number);

      // Convert bounds to proper SinglePageAnnotationJson format
      const annotations: Record<number, SinglePageAnnotationJson> = {};
      let combinedRawText = "";

      for (const pageNum of pages) {
        const pageAnnotation = pageInfo.getPageAnnotationJson(
          selections[pageNum]
        );
        if (pageAnnotation) {
          annotations[pageNum] = pageAnnotation;
          combinedRawText += " " + pageAnnotation.rawText;
        }
      }

      // Create annotation object
      const annotation = new ServerTokenAnnotation(
        pages[0], // First page as the anchor
        activeSpanLabel,
        combinedRawText.trim(),
        false,
        annotations,
        [],
        false,
        false,
        false
      );

      console.log("handleCreateMultiPageAnnotation - annotation", annotation);

      await createAnnotation(annotation);
      setMultiSelections({});
    },
    [activeSpanLabel, createAnnotation, pageInfo]
  );

  /**
   * Handles the mouse up event to finalize the selection.
   */
  const handleMouseUp = useCallback(
    (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      if (localPageSelection) {
        console.log("onMouseUp - localPageSelection", localPageSelection);
        const pageNum = pageNumber;

        setMultiSelections((prev) => {
          const updatedSelections = {
            ...prev,
            [pageNum]: [...(prev[pageNum] || []), localPageSelection.bounds],
          };
          setLocalPageSelection(undefined);

          if (!event.shiftKey) {
            console.log("onMouseUp - handleCreateMultiPageAnnotation");
            handleCreateMultiPageAnnotation(updatedSelections);
          }

          return updatedSelections;
        });
      } else {
        console.log("onMouseUp - localPageSelection", localPageSelection);
      }
    },
    [localPageSelection, pageNumber, handleCreateMultiPageAnnotation]
  );

  /**
   * Handles the mouse down event to start the selection.
   */
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      if (containerRef.current === null) {
        throw new Error("No Container");
      }
      if (
        !read_only &&
        corpus_permissions.includes(PermissionTypes.CAN_UPDATE)
      ) {
        if (!localPageSelection && event.buttons === 1) {
          const { left: containerAbsLeftOffset, top: containerAbsTopOffset } =
            containerRef.current.getBoundingClientRect();
          const left = event.pageX - containerAbsLeftOffset;
          const top = event.pageY - containerAbsTopOffset;
          setLocalPageSelection({
            pageNumber: pageNumber,
            bounds: {
              left,
              top,
              right: left,
              bottom: top,
            },
          });
        }
      } else {
        console.log("Not allowed to update");
        console.log(corpus_permissions);
        console.log(read_only);
      }
    },
    [
      containerRef,
      read_only,
      corpus_permissions,
      localPageSelection,
      pageNumber,
    ]
  );

  /**
   * Handles the mouse move event to update the selection.
   */
  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      if (containerRef.current === null) {
        throw new Error("No Container");
      }
      const { left: containerAbsLeftOffset, top: containerAbsTopOffset } =
        containerRef.current.getBoundingClientRect();
      if (localPageSelection && localPageSelection.pageNumber === pageNumber) {
        setLocalPageSelection({
          pageNumber: pageNumber,
          bounds: {
            ...localPageSelection.bounds,
            right: event.pageX - containerAbsLeftOffset,
            bottom: event.pageY - containerAbsTopOffset,
          },
        });
      }
    },
    [containerRef, localPageSelection, pageNumber]
  );

  /**
   * Converts bounding box selections to JSX elements.
   */
  const convertBoundsToSelections = useCallback(
    (selection: BoundingBox, activeLabel: AnnotationLabelType): JSX.Element => {
      const annotation = pageInfo.getAnnotationForBounds(
        normalizeBounds(selection),
        activeLabel
      );

      const tokens = annotation && annotation.tokens ? annotation.tokens : null;

      // TODO - ensure we WANT random UUID
      return (
        <>
          <SelectionBoundary
            id={crypto.randomUUID()}
            showBoundingBox
            hidden={false}
            color={activeSpanLabel?.color ? activeSpanLabel.color : ""}
            bounds={selection}
            selected={false}
          />
          <SelectionTokenGroup pageInfo={pageInfo} tokens={tokens} />
        </>
      );
    },
    [pageInfo, activeSpanLabel]
  );

  const pageQueuedSelections = multiSelections[pageNumber]
    ? multiSelections[pageNumber]
    : [];

  return (
    <div
      id="selection-layer"
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={localPageSelection ? handleMouseMove : undefined}
      onMouseUp={handleMouseUp}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 1,
      }}
    >
      {localPageSelection?.pageNumber === pageNumber && activeSpanLabel
        ? convertBoundsToSelections(localPageSelection.bounds, activeSpanLabel)
        : null}
      {pageQueuedSelections.length > 0 && activeSpanLabel
        ? pageQueuedSelections.map((selection, index) =>
            convertBoundsToSelections(
              selection,
              activeSpanLabel as AnnotationLabelType
            )
          )
        : null}
    </div>
  );
};

export default React.memo(SelectionLayer);
