import React, { useState, useRef, useCallback, useEffect } from "react";
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
import { useCorpusState } from "../../context/CorpusAtom";
import { useAnnotationSelection } from "../../hooks/useAnnotationSelection";
import { useAtom } from "jotai";
import { isCreatingAnnotationAtom } from "../../context/UISettingsAtom";

interface SelectionLayerProps {
  pageInfo: PDFPageInfo;
  read_only: boolean;
  activeSpanLabel: AnnotationLabelType | null;
  createAnnotation: (annotation: ServerTokenAnnotation) => void;
  pageNumber: number;
}

const SelectionLayer = ({
  pageInfo,
  read_only,
  activeSpanLabel,
  createAnnotation,
  pageNumber,
}: SelectionLayerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { canUpdateCorpus, myPermissions } = useCorpusState();
  const { setSelectedAnnotations } = useAnnotationSelection();
  const [, setIsCreatingAnnotation] = useAtom(isCreatingAnnotationAtom);
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
          setIsCreatingAnnotation(false); // Reset creating annotation state

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
    [
      localPageSelection,
      pageNumber,
      handleCreateMultiPageAnnotation,
      pageInfo,
      setIsCreatingAnnotation,
    ]
  );

  /**
   * Handles the mouse down event to start the selection.
   */
  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      if (containerRef.current === null) {
        throw new Error("No Container");
      }

      // Log the exact state of variables when mouse down occurs
      console.log("[MouseDown] canUpdateCorpus:", canUpdateCorpus);
      console.log("[MouseDown] read_only:", read_only);

      if (!read_only && canUpdateCorpus) {
        if (!localPageSelection && event.buttons === 1) {
          setSelectedAnnotations([]); // Clear any selected annotations
          setIsCreatingAnnotation(true); // Set creating annotation state
          const canvasElement = containerRef.current
            .previousSibling as HTMLCanvasElement;
          if (!canvasElement) return;

          const canvasBounds = canvasElement.getBoundingClientRect();
          const left = event.clientX - canvasBounds.left;
          const top = event.clientY - canvasBounds.top;

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
        console.log("[MouseDown] Not allowed to update");
        console.log("[MouseDown] read_only:", read_only);
        console.log("[MouseDown] canUpdateCorpus:", canUpdateCorpus);
      }
    },
    [
      containerRef,
      read_only,
      canUpdateCorpus,
      localPageSelection,
      pageNumber,
      pageInfo,
      setSelectedAnnotations,
      setIsCreatingAnnotation,
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
      const canvasElement = containerRef.current
        .previousSibling as HTMLCanvasElement;
      if (!canvasElement) return;

      const canvasBounds = canvasElement.getBoundingClientRect();
      const right = event.clientX - canvasBounds.left;
      const bottom = event.clientY - canvasBounds.top;

      if (localPageSelection && localPageSelection.pageNumber === pageNumber) {
        setLocalPageSelection({
          pageNumber: pageNumber,
          bounds: {
            ...localPageSelection.bounds,
            right,
            bottom,
          },
        });
      }
    },
    [containerRef, localPageSelection, pageNumber, pageInfo]
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
    [pageInfo, activeSpanLabel, pageInfo]
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
