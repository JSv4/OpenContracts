/**
 * TxtAnnotator Component
 *
 * Improvements:
 * 1. Enhanced label positioning for nested annotations by assigning layers and adjusting radii.
 * 2. Improved collision detection and boundary avoidance in force simulation.
 * 3. Connector lines accurately connect labels to annotations with clarity.
 *
 * Additional Feature:
 * - When selectedAnnotations changes and has one or more entries, scroll smoothly to the
 *   earliest (by text offset) selected annotation and center it in view.
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Label, LabelContainer, PaperContainer } from "./StyledComponents";
import RadialButtonCloud, { CloudButtonItem } from "./RadialButtonCloud";
import { Modal, Button, Dropdown } from "semantic-ui-react";
import { AnnotationLabelType } from "../../../../types/graphql-api";
import { TextSearchSpanResult } from "../../../types";
import { PermissionTypes } from "../../../types";
import styled, { keyframes, css } from "styled-components";
import * as d3 from "d3";
import { hexToRgba } from "./utils";
import { ServerSpanAnnotation } from "../../types/annotations";

interface TxtAnnotatorProps {
  text: string;
  annotations: ServerSpanAnnotation[];
  searchResults: TextSearchSpanResult[];
  getSpan: (span: {
    start: number;
    end: number;
    text: string;
  }) => ServerSpanAnnotation;
  visibleLabels: AnnotationLabelType[] | null;
  availableLabels: AnnotationLabelType[];
  selectedLabelTypeId: string | null;
  read_only: boolean;
  data_loading?: boolean;
  loading_message?: string;
  allowInput: boolean;
  zoom_level: number;
  createAnnotation: (added_annotation_obj: ServerSpanAnnotation) => void;
  updateAnnotation: (updated_annotation: ServerSpanAnnotation) => void;
  approveAnnotation?: (annot_id: string, comment?: string) => void;
  rejectAnnotation?: (annot_id: string, comment?: string) => void;
  deleteAnnotation: (annotation_id: string) => void;
  maxHeight?: string;
  maxWidth?: string;
  selectedAnnotations: string[]; // Array of selected annotation IDs
  setSelectedAnnotations: (annotations: string[]) => void;
  showStructuralAnnotations: boolean;
  selectedSearchResultIndex?: number;
}

interface LabelRenderData {
  annotation: ServerSpanAnnotation;
  x: number;
  y: number;
  width: number;
  height: number;
  labelIndex: number;
}

const glowGreen = keyframes`
  0% {
    box-shadow: 0 0 5px rgba(0, 255, 0, 0.8);
  }
  50% {
    box-shadow: 0 0 15px rgba(0, 255, 0, 0.8);
  }
  100% {
    box-shadow: 0 0 5px rgba(0, 255, 0, 0.8);
  }
`;

const glowRed = keyframes`
  0% {
    box-shadow: 0 0 5px rgba(255, 0, 0, 0.8);
  }
  50% {
    box-shadow: 0 0 15px rgba(255, 0, 0.8);
  }
  100% {
    box-shadow: 0 0 5px rgba(255, 0, 0.8);
  }
`;

const ConnectorLine = styled.svg`
  position: absolute;
  pointer-events: none;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
`;

const AnnotatedSpan = styled.span<{
  approved?: boolean;
  rejected?: boolean;
  hasBorder?: boolean;
  borderColor?: string;
  zIndex?: number;
}>`
  position: relative;
  cursor: text;
  user-select: text;
  white-space: pre-wrap;

  ${(props) =>
    props.approved &&
    css`
      animation: ${glowGreen} 2s infinite;
      border: 1px solid green;
      border-radius: 2px;
    `}

  ${(props) =>
    props.rejected &&
    css`
      animation: ${glowRed} 2s infinite;
      border: 1px solid red;
      border-radius: 2px;
    `}

  ${(props) =>
    props.hasBorder &&
    css`
      border: 2px dashed ${props.borderColor || "#000"};
      border-radius: 4px;
    `}

  z-index: ${(props) => props.zIndex || 1};
`;

/**
 * Convert a local selection offset to the global offset based on
 * the spans array. This assumes each <span> in the "spans" array
 * has a data attribute "data-span-index" that references the same
 * index in the 'spans' state variable.
 *
 * @param node - The DOM node where the selection offset is anchored/focused.
 * @param localOffset - The node-local offset (anchorOffset/focusOffset).
 * @param spans - The array of text chunks used when rendering multiple <span>.
 * @returns The global offset in the overall text, or null if the node wasn't found.
 */
function getGlobalOffsetFromNode(
  node: Node | null,
  localOffset: number,
  spans: {
    start: number;
    end: number;
    text: string;
    annotations: any[];
  }[]
): number | null {
  if (!node) return null;

  // Traverse upward to find the annotated <span> that holds data-span-index
  let element: HTMLElement | null =
    node instanceof HTMLElement ? node : node.parentElement;
  while (element && !element.hasAttribute("data-span-index")) {
    element = element.parentElement;
  }
  if (!element) return null;

  const spanIndexAttr = element.getAttribute("data-span-index");
  if (!spanIndexAttr) return null;

  const spanIndex = parseInt(spanIndexAttr, 10);
  if (isNaN(spanIndex) || !spans[spanIndex]) return null;

  const spanInfo = spans[spanIndex];

  // The global offset for the start of this chunk
  const globalOffsetForSpan = spanInfo.start;

  // The final global offset = the chunk’s starting offset + local offset
  return globalOffsetForSpan + localOffset;
}

const TxtAnnotator: React.FC<TxtAnnotatorProps> = ({
  text,
  annotations,
  searchResults,
  getSpan,
  visibleLabels,
  availableLabels,
  read_only,
  allowInput,
  createAnnotation,
  updateAnnotation,
  approveAnnotation,
  rejectAnnotation,
  deleteAnnotation,
  maxHeight,
  maxWidth,
  selectedAnnotations,
  setSelectedAnnotations,
  showStructuralAnnotations,
  selectedSearchResultIndex,
}) => {
  const [hoveredSpanIndex, setHoveredSpanIndex] = useState<number | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [annotationToEdit, setAnnotationToEdit] =
    useState<ServerSpanAnnotation | null>(null);
  const [labelsToRender, setLabelsToRender] = useState<LabelRenderData[]>([]);
  const [spans, setSpans] = useState<
    {
      start: number;
      end: number;
      text: string;
      annotations: ServerSpanAnnotation[];
      isSearchResult?: boolean;
      isSelectedSearchResult?: boolean;
    }[]
  >([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const hideLabelsTimeout = useRef<NodeJS.Timeout | null>(null);

  /**
   * Handles mouse entering on a span to show associated labels.
   */
  const handleMouseEnter = useCallback((index: number) => {
    if (hideLabelsTimeout.current) {
      clearTimeout(hideLabelsTimeout.current);
      hideLabelsTimeout.current = null;
    }
    setHoveredSpanIndex(index);
  }, []);

  /**
   * Handles mouse leaving from a span, triggering a delayed hide of labels.
   */
  const handleMouseLeave = useCallback(() => {
    hideLabelsTimeout.current = setTimeout(() => {
      setHoveredSpanIndex(null);
    }, 1000); // Adjust delay as needed
  }, []);

  /**
   * Cancels label hiding when hovering over a label element.
   */
  const handleLabelMouseEnter = useCallback(() => {
    if (hideLabelsTimeout.current) {
      clearTimeout(hideLabelsTimeout.current);
      hideLabelsTimeout.current = null;
    }
  }, []);

  /**
   * Triggers label hiding when leaving the label area.
   */
  const handleLabelMouseLeave = useCallback(() => {
    hideLabelsTimeout.current = setTimeout(() => {
      setHoveredSpanIndex(null);
    }, 2000); // Adjust delay as needed
  }, []);

  /**
   * Handles clicking on a label, toggling selection or clearing selections.
   */
  const handleLabelClick = useCallback(
    (annotation: ServerSpanAnnotation) => {
      if (selectedAnnotations.includes(annotation.id)) {
        setSelectedAnnotations([]);
      } else {
        setSelectedAnnotations([annotation.id]);
      }
    },
    [selectedAnnotations, setSelectedAnnotations]
  );

  /**
   * Builds spans from the text and annotation boundaries, including search highlights.
   */
  useEffect(() => {
    const isLabelVisible = (labelText: string) => {
      if (visibleLabels === null) return true;
      return visibleLabels.some((label) => label.text === labelText);
    };

    const sortedAnnotations = annotations
      .filter(
        (ann) =>
          ann.annotationLabel.text && isLabelVisible(ann.annotationLabel.text)
      )
      .sort((a, b) => a.json.start - b.json.start);

    const newSpans: {
      start: number;
      end: number;
      text: string;
      annotations: ServerSpanAnnotation[];
      isSearchResult?: boolean;
      isSelectedSearchResult?: boolean;
    }[] = [];

    const addSpan = (
      start: number,
      end: number,
      annList: ServerSpanAnnotation[],
      isSearchResult = false,
      isSelectedSearchResult = false
    ) => {
      if (start >= end) return;
      newSpans.push({
        start,
        end,
        text: text.slice(start, end),
        annotations: annList,
        isSearchResult,
        isSelectedSearchResult,
      });
    };

    const annotationBoundaries = new Set<number>();
    sortedAnnotations.forEach((ann) => {
      annotationBoundaries.add(ann.json.start);
      annotationBoundaries.add(ann.json.end);
    });
    searchResults.forEach((result) => {
      annotationBoundaries.add(result.start_index);
      annotationBoundaries.add(result.end_index);
    });
    annotationBoundaries.add(0);
    annotationBoundaries.add(text.length);

    const boundaries = Array.from(annotationBoundaries).sort((a, b) => a - b);

    for (let i = 0; i < boundaries.length - 1; i++) {
      const spanStart = boundaries[i];
      const spanEnd = boundaries[i + 1];

      const spanAnnotations = sortedAnnotations.filter(
        (ann) => ann.json.start < spanEnd && ann.json.end > spanStart
      );

      const isSearchResult = searchResults.some(
        (result) =>
          result.start_index <= spanStart && result.end_index >= spanEnd
      );

      const isSelectedSearchResult =
        isSearchResult &&
        selectedSearchResultIndex !== undefined &&
        searchResults[selectedSearchResultIndex].start_index <= spanStart &&
        searchResults[selectedSearchResultIndex].end_index >= spanEnd;

      addSpan(
        spanStart,
        spanEnd,
        spanAnnotations,
        isSearchResult,
        isSelectedSearchResult
      );
    }
    setSpans(newSpans);
  }, [
    annotations,
    text,
    visibleLabels,
    searchResults,
    selectedSearchResultIndex,
  ]);

  /**
   * Dynamically calculates label positions for any hovered or selected annotations.
   */
  useEffect(() => {
    const calculateLabelPositions = () => {
      const newLabelsToRender: LabelRenderData[] = [];

      if (hoveredSpanIndex === null) {
        setLabelsToRender([]);
        return;
      }

      const hoveredSpan = spans[hoveredSpanIndex];
      if (!hoveredSpan) return;

      const annotationsToRender =
        selectedAnnotations.length > 0
          ? hoveredSpan.annotations.filter((ann) =>
              selectedAnnotations.includes(ann.id)
            )
          : hoveredSpan.annotations;

      const selectedAnnotationsForSpan = annotationsToRender.filter(
        (ann) => showStructuralAnnotations || !ann.structural
      );

      if (selectedAnnotationsForSpan.length === 0) {
        setLabelsToRender([]);
        return;
      }

      const containerElement = containerRef.current;
      const spanElement = containerElement?.querySelector(
        `span[data-span-index="${hoveredSpanIndex}"]`
      ) as HTMLElement;

      if (containerElement && spanElement) {
        const containerRect = containerElement.getBoundingClientRect();
        const spanRect = spanElement.getBoundingClientRect();

        const scrollLeft = containerElement.scrollLeft;
        const scrollTop = containerElement.scrollTop;

        // Get all text nodes within the span to find line breaks
        const range = document.createRange();
        range.selectNodeContents(spanElement);
        const rects = range.getClientRects();

        // Find the rect (line) closest to the vertical middle of the span
        const mouseY = spanRect.top + spanRect.height / 2;
        let nearestLineRect = rects[0];
        let minDistance = Infinity;

        for (let i = 0; i < rects.length; i++) {
          const rect = rects[i];
          const rectMiddleY = rect.top + rect.height / 2;
          const distance = Math.abs(mouseY - rectMiddleY);
          if (distance < minDistance) {
            minDistance = distance;
            nearestLineRect = rect;
          }
        }

        // Calculate base position using the nearest line's right edge
        const baseX =
          nearestLineRect.right - containerRect.left + scrollLeft + 8; // 8px gap
        const baseY = nearestLineRect.top - containerRect.top + scrollTop;

        // Stack labels vertically with a small gap
        const labelGap = 4;
        const labelHeight = 28; // Approximate height of label

        selectedAnnotationsForSpan.forEach((annotation, index) => {
          newLabelsToRender.push({
            annotation,
            x: baseX,
            y: baseY + (labelHeight + labelGap) * index,
            width: 100, // Approximate width
            height: labelHeight,
            labelIndex: index,
          });
        });

        setLabelsToRender(newLabelsToRender);
      }
    };

    calculateLabelPositions();
  }, [hoveredSpanIndex, spans, showStructuralAnnotations, selectedAnnotations]);

  /**
   * Scrolls smoothly to the earliest selected annotation (by .json.start) when selectedAnnotations changes.
   */
  useEffect(() => {
    if (selectedAnnotations.length === 0) return;

    // Find the earliest selected annotation in reading order.
    const selectedAnns = annotations.filter((ann) =>
      selectedAnnotations.includes(ann.id)
    );
    if (selectedAnns.length === 0) return;
    const earliestAnn = selectedAnns.reduce((acc, ann) =>
      ann.json.start < acc.json.start ? ann : acc
    );

    // Find the span index that includes the earliest annotation's start.
    const scrollToSpanIndex = spans.findIndex(
      (span) =>
        earliestAnn.json.start >= span.start &&
        earliestAnn.json.start < span.end
    );
    if (scrollToSpanIndex < 0) return;

    // Get the target element in DOM
    const containerElement = containerRef.current;
    if (!containerElement) return;

    const targetElement = containerElement.querySelector(
      `span[data-span-index="${scrollToSpanIndex}"]`
    ) as HTMLElement | null;

    if (!targetElement) return;

    /**
     * Smoothly scrolls the container so that the target is centered.
     */
    const containerRect = containerElement.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();

    const offsetTop =
      targetRect.top - containerRect.top + containerElement.scrollTop;
    const offsetLeft =
      targetRect.left - containerRect.left + containerElement.scrollLeft;

    containerElement.scrollTo({
      top: offsetTop - containerRect.height / 2 + targetRect.height / 2,
      left: offsetLeft - containerRect.width / 2 + targetRect.width / 2,
      behavior: "smooth",
    });
  }, [selectedAnnotations, annotations, spans]);

  /**
   * Creates annotation when user finishes a text selection (mouseup).
   * @param event - The mouse event.
   */
  const handleMouseUp = (event: React.MouseEvent<HTMLDivElement>) => {
    const selection = document.getSelection();
    if (!selection || selection.toString().length === 0) {
      return;
    }

    // Attempt to find the anchor/focus offsets in global terms
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;

    const anchorLocalOffset = selection.anchorOffset;
    const focusLocalOffset = selection.focusOffset;

    // Convert anchor/focus local offsets to global offsets
    const anchorGlobalOffset = getGlobalOffsetFromNode(
      anchorNode,
      anchorLocalOffset,
      spans
    );
    const focusGlobalOffset = getGlobalOffsetFromNode(
      focusNode,
      focusLocalOffset,
      spans
    );

    if (anchorGlobalOffset === null || focusGlobalOffset === null) {
      // We couldn’t map the local offset to a global offset
      return;
    }

    // Ensure we have proper ascending indices
    const adjustedStart = Math.min(anchorGlobalOffset, focusGlobalOffset);
    const adjustedEnd = Math.max(anchorGlobalOffset, focusGlobalOffset);

    // Get the actual selected text from these global indices
    const selectedText = text.slice(adjustedStart, adjustedEnd);

    // If there is valid text selected, form the annotation
    if (selectedText.length > 0) {
      const span = {
        start: adjustedStart,
        end: adjustedEnd,
        text: selectedText,
      };

      // Convert span to ServerSpanAnnotation
      const annotation = getSpan(span);

      // Create the annotation
      createAnnotation(annotation);
    }
  };

  return (
    <>
      <PaperContainer
        ref={containerRef}
        style={{
          maxHeight: maxHeight || "auto",
          maxWidth: maxWidth || "auto",
        }}
        onClick={() => {
          setSelectedAnnotations([]);
        }}
        onMouseUp={handleMouseUp}
      >
        {spans.map((span, index) => {
          const {
            text: spanText,
            annotations: spanAnnotations,
            isSearchResult,
            isSelectedSearchResult,
          } = span;

          const spanStyle: React.CSSProperties = {};

          const annotationsToRender =
            selectedAnnotations.length > 0
              ? spanAnnotations.filter((ann) =>
                  selectedAnnotations.includes(ann.id)
                )
              : spanAnnotations;

          const selectedAnnotationsForSpan = annotationsToRender.filter(
            (ann) => showStructuralAnnotations || !ann.structural
          );

          let approved = false;
          let rejected = false;

          if (selectedAnnotationsForSpan.length > 0) {
            approved = selectedAnnotationsForSpan.some((ann) => ann.approved);
            rejected = selectedAnnotationsForSpan.some((ann) => ann.rejected);
          }

          if (selectedAnnotationsForSpan.length === 1) {
            const annotationColor =
              selectedAnnotationsForSpan[0].annotationLabel.color;
            spanStyle.backgroundColor = annotationColor
              ? hexToRgba(annotationColor, 0.3)
              : "transparent";
          } else if (selectedAnnotationsForSpan.length > 1) {
            const gradientColors = selectedAnnotationsForSpan
              .map((ann) =>
                hexToRgba(ann.annotationLabel.color || "transparent", 0.3)
              )
              .join(", ");
            spanStyle.backgroundImage = `linear-gradient(to right, ${gradientColors})`;
          }

          const hasBorder =
            hoveredSpanIndex === index && selectedAnnotationsForSpan.length > 0;

          const borderColor =
            selectedAnnotationsForSpan[0]?.annotationLabel.color || "#000";

          if (isSearchResult) {
            spanStyle.backgroundColor = isSelectedSearchResult
              ? "#FFFF00"
              : "#FFFF99";
          }

          return (
            <AnnotatedSpan
              key={index}
              data-span-index={index}
              onMouseEnter={() => handleMouseEnter(index)}
              onMouseLeave={handleMouseLeave}
              approved={approved}
              rejected={rejected}
              hasBorder={hasBorder}
              borderColor={borderColor}
              style={spanStyle}
            >
              {spanText}
            </AnnotatedSpan>
          );
        })}
        {/* Render labels */}
        {labelsToRender.map(
          ({ annotation, x, y, width, height, labelIndex }) => {
            const actions: CloudButtonItem[] = [];

            if (
              !annotation.structural &&
              annotation.myPermissions.includes(PermissionTypes.CAN_UPDATE)
            ) {
              actions.push({
                name: "edit",
                color: "#a3a3a3",
                tooltip: "Edit Annotation",
                onClick: () => {
                  setAnnotationToEdit(annotation);
                  setEditModalOpen(true);
                },
              });
            }

            if (
              !annotation.structural &&
              annotation.myPermissions.includes(PermissionTypes.CAN_REMOVE)
            ) {
              actions.push({
                name: "trash",
                color: "#d3d3d3",
                tooltip: "Delete Annotation",
                onClick: () => {
                  deleteAnnotation(annotation.id);
                },
              });
            }

            if (approveAnnotation) {
              actions.push({
                name: "thumbs up",
                color: "#b3b3b3",
                tooltip: "Approve Annotation",
                onClick: () => {
                  approveAnnotation(annotation.id);
                },
              });
            }

            if (rejectAnnotation) {
              actions.push({
                name: "thumbs down",
                color: "#c3c3c3",
                tooltip: "Reject Annotation",
                onClick: () => {
                  rejectAnnotation(annotation.id);
                },
              });
            }

            return (
              <LabelContainer
                key={`${annotation.id}-${labelIndex}`}
                style={{
                  position: "absolute",
                  left: `${x}px`,
                  top: `${y}px`,
                  opacity: 1,
                  pointerEvents: "auto",
                  zIndex: 1000 + labelIndex,
                }}
                onMouseEnter={handleLabelMouseEnter}
                onMouseLeave={handleLabelMouseLeave}
                color={annotation.annotationLabel.color || "#cccccc"}
              >
                <Label
                  id={`label-${annotation.id}-${labelIndex}`}
                  color={annotation.annotationLabel.color || "#cccccc"}
                  $index={labelIndex}
                  onClick={(e: React.MouseEvent<HTMLElement>) => {
                    e.stopPropagation();
                    handleLabelClick(annotation);
                  }}
                >
                  {annotation.annotationLabel.text}
                </Label>
                <RadialButtonCloud
                  parentBackgroundColor={
                    annotation.annotationLabel.color || "#cccccc"
                  }
                  actions={actions}
                />
              </LabelContainer>
            );
          }
        )}
      </PaperContainer>
      <Modal
        open={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setAnnotationToEdit(null);
        }}
      >
        <Modal.Header>Edit Annotation Label</Modal.Header>
        <Modal.Content>
          {annotationToEdit && (
            <Dropdown
              selection
              options={availableLabels.map((label) => ({
                key: label.id,
                text: label.text,
                value: label.id,
              }))}
              value={annotationToEdit.annotationLabel.id}
              onChange={(e, { value }) => {
                const newLabel = availableLabels.find(
                  (label) => label.id === value
                );
                if (newLabel) {
                  const updatedAnnotation = annotationToEdit.update({
                    annotationLabel: newLabel,
                  });
                  updateAnnotation(updatedAnnotation);
                }
                setEditModalOpen(false);
                setAnnotationToEdit(null);
              }}
            />
          )}
        </Modal.Content>
        <Modal.Actions>
          <Button
            onClick={() => {
              setEditModalOpen(false);
              setAnnotationToEdit(null);
            }}
          >
            Cancel
          </Button>
        </Modal.Actions>
      </Modal>
    </>
  );
};

export default React.memo(TxtAnnotator);
