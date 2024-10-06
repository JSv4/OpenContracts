/**
 * TxtAnnotator Component
 *
 * This component provides a text annotation interface for labeling and managing
 * span annotations within a given text.
 *
 * Key Features:
 * 1. Text display with highlighting for annotations
 * 2. Interactive label creation through text selection
 * 3. Hoverable and clickable labels for existing annotations
 * 4. Radial button cloud for annotation actions (edit, delete, approve, reject)
 * 5. Modal for editing annotation labels
 * 6. Support for multiple overlapping annotations
 * 7. Responsive label positioning around annotated spans
 * 8. Zoom functionality for text size adjustment
 *
 * Operation:
 * - Renders the input text as a series of spans, each potentially containing annotations
 * - Allows users to select text to create new annotations (if not in read-only mode)
 * - Displays floating labels for annotations when hovering over annotated spans
 * - Provides a radial button cloud for each label with annotation actions
 * - Supports focusing and selecting annotations for detailed view or actions
 * - Handles overlapping annotations with multi-color highlighting
 * - Dynamically calculates and positions labels around annotated spans
 * - Supports approval and rejection of annotations (if enabled)
 *
 * State Management:
 * - Uses multiple useState hooks for managing component state
 * - Utilizes useEffect for side effects like span calculation and label positioning
 * - Implements useDebouncedCallback for optimizing hover effects
 *
 * Styling:
 * - Applies dynamic styles for highlighting and label positioning
 * - Uses styled-components for consistent styling of sub-components
 *
 * Performance Considerations:
 * - Memoized with React.memo to prevent unnecessary re-renders
 * - Uses debounced callbacks for hover effects to reduce computation
 *
 * Accessibility:
 * - Supports keyboard navigation and screen readers (to be verified)
 *
 * @param {TxtAnnotatorProps} props - The properties passed to the component
 * @returns {React.ReactElement} The rendered TxtAnnotator component
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Label, LabelContainer, PaperContainer } from "./StyledComponents";
import { useDebouncedCallback } from "use-debounce";
import RadialButtonCloud, { CloudButtonItem } from "./RadialButtonCloud";
import { Modal, Button, Dropdown } from "semantic-ui-react";
import { AnnotationLabelType } from "../../../../graphql/types";
import { ServerSpanAnnotation } from "../../context";
import { TextSearchSpanResult } from "../../../types";

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

  /** New prop to handle selected search result index */
  selectedSearchResultIndex?: number;
}

interface LabelRenderData {
  annotation: ServerSpanAnnotation;
  position: { x: number; y: number };
  labelIndex: number;
}

const TxtAnnotator: React.FC<TxtAnnotatorProps> = ({
  text,
  annotations,
  searchResults,
  getSpan,
  visibleLabels,
  availableLabels,
  selectedLabelTypeId,
  read_only,
  data_loading,
  loading_message,
  allowInput,
  zoom_level,
  createAnnotation,
  updateAnnotation,
  approveAnnotation,
  rejectAnnotation,
  deleteAnnotation,
  maxHeight,
  maxWidth,
  selectedAnnotations,
  setSelectedAnnotations,
  selectedSearchResultIndex,
}) => {
  const [hoveredSpanIndex, setHoveredSpanIndex] = useState<number | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [annotationToEdit, setAnnotationToEdit] =
    useState<ServerSpanAnnotation | null>(null);
  const [labelsToRender, setLabelsToRender] = useState<LabelRenderData[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchResultElementRefs = useRef<{
    [key: string]: HTMLSpanElement | null;
  }>({});

  const debouncedSetHoveredSpanIndex = useDebouncedCallback(
    (spanIndex: number | null) => {
      setHoveredSpanIndex(spanIndex);
    },
    100
  );

  /**
   * Handles text selection and creates a new annotation.
   */
  const handleMouseUp = useCallback(() => {
    if (read_only || !allowInput) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const getCharIndex = (node: Node, offset: number): number => {
      let el = node;
      while (el && el.nodeType !== Node.TEXT_NODE) {
        el = el.childNodes[offset] || el.nextSibling || el.parentNode;
      }
      if (!el) return 0;
      const range = document.createRange();
      range.setStart(containerRef.current!, 0);
      range.setEnd(el, offset);
      return range.toString().length;
    };

    const start = getCharIndex(selection.anchorNode!, selection.anchorOffset);
    const end = getCharIndex(selection.focusNode!, selection.focusOffset);

    let annotationStart = Math.min(start, end);
    let annotationEnd = Math.max(start, end);

    annotationEnd = Math.min(annotationEnd, text.length);

    if (annotationEnd === annotationStart) return;

    const newSpan = {
      start: annotationStart,
      end: annotationEnd,
      text: text.slice(annotationStart, annotationEnd),
    };

    const newAnnotation = getSpan(newSpan);
    createAnnotation(newAnnotation);

    selection.removeAllRanges();
  }, [allowInput, createAnnotation, getSpan, read_only, text]);

  /**
   * Handles mouse entering a span.
   * @param spanIndex - Index of the hovered span
   */
  const handleMouseEnter = useCallback(
    (spanIndex: number) => {
      debouncedSetHoveredSpanIndex(spanIndex);
    },
    [debouncedSetHoveredSpanIndex]
  );

  /**
   * Handles mouse leaving a span.
   */
  const handleMouseLeave = useCallback(() => {
    debouncedSetHoveredSpanIndex(null);
  }, [debouncedSetHoveredSpanIndex]);

  /**
   * Handles mouse entering a label, cancelling hover effects.
   */
  const handleLabelMouseEnter = useCallback(() => {
    debouncedSetHoveredSpanIndex.cancel();
  }, [debouncedSetHoveredSpanIndex]);

  /**
   * Handles mouse leaving a label.
   */
  const handleLabelMouseLeave = useCallback(() => {
    debouncedSetHoveredSpanIndex(null);
  }, [debouncedSetHoveredSpanIndex]);

  /**
   * Handles clicking on a label to select or deselect an annotation.
   * @param annotation - The annotation being clicked
   */
  const handleLabelClick = useCallback(
    (annotation: ServerSpanAnnotation) => {
      if (selectedAnnotations.includes(annotation.id)) {
        setSelectedAnnotations(
          selectedAnnotations.filter((id) => id !== annotation.id)
        );
      } else {
        setSelectedAnnotations([annotation.id]);
      }
    },
    [selectedAnnotations, setSelectedAnnotations]
  );

  /**
   * Determines if an annotation is selected.
   * @param annotation - The annotation to check
   * @returns boolean indicating selection status
   */
  const isAnnotationSelected = useCallback(
    (annotation: ServerSpanAnnotation) => {
      if (selectedAnnotations.length > 0) {
        return annotation.id === selectedAnnotations[0];
      }
      if (
        selectedSearchResultIndex !== undefined &&
        selectedSearchResultIndex !== null
      ) {
        return annotation.id === `search-result-${selectedSearchResultIndex}`;
      }
      return true; // When no annotation is selected, all are visible
    },
    [selectedAnnotations, selectedSearchResultIndex]
  );

  const [spans, setSpans] = useState<
    {
      start: number;
      end: number;
      text: string;
      annotations: ServerSpanAnnotation[];
    }[]
  >([]);

  useEffect(() => {
    const isLabelVisible = (labelText: string) => {
      if (visibleLabels === null) return true; // Show all labels if visibleLabels is null
      return visibleLabels.some((label) => label.text === labelText);
    };
    const searchResultAnnotations = searchResults.map((result, index) => {
      return new ServerSpanAnnotation(
        0, // page number (assuming single page for text)
        {
          id: "search-result",
          text: "Search Result",
          color: "#ffff00",
          used_by_analyses: {
            pageInfo: {
              hasNextPage: false,
              hasPreviousPage: false, // Added missing required property
            },
            edges: [],
          },
          // Include other required properties if necessary
        },
        text.slice(result.start_index, result.end_index),
        false, // structural
        {
          start: result.start_index,
          end: result.end_index,
        },
        [], // myPermissions
        false, // approved
        false, // rejected
        false, // canComment
        `search-result-${index}` // id
      );
    });

    const sortedAnnotations = [...annotations, ...searchResultAnnotations]
      .filter(
        (ann) =>
          ann.annotationLabel.text && isLabelVisible(ann.annotationLabel.text)
      )
      .sort((a, b) => a.json.start - b.json.start);

    console.log("Sorted annotations", sortedAnnotations);

    const newSpans: {
      start: number;
      end: number;
      text: string;
      annotations: ServerSpanAnnotation[];
    }[] = [];

    const addSpan = (
      start: number,
      end: number,
      annotations: ServerSpanAnnotation[]
    ) => {
      if (start >= end) return;
      newSpans.push({
        start,
        end,
        text: text.slice(start, end),
        annotations,
      });
    };

    const annotationBoundaries = new Set<number>();
    sortedAnnotations.forEach((ann) => {
      annotationBoundaries.add(ann.json.start);
      annotationBoundaries.add(ann.json.end);
    });
    annotationBoundaries.add(0);
    annotationBoundaries.add(text.length);

    const boundaries = Array.from(annotationBoundaries).sort((a, b) => a - b);

    for (let i = 0; i < boundaries.length - 1; i++) {
      const spanStart = boundaries[i];
      const spanEnd = boundaries[i + 1];
      const spanAnnotations = sortedAnnotations.filter(
        (ann) => ann.json.start <= spanStart && ann.json.end >= spanEnd
      );
      addSpan(spanStart, spanEnd, spanAnnotations);
    }
    console.log("New spans", newSpans);
    setSpans(newSpans);
  }, [annotations, text, visibleLabels, searchResults]);

  useEffect(() => {
    /**
     * Calculates label positions around the hovered span, considering only annotations
     * that are applicable to the hovered character.
     */
    const calculateLabelPositions = () => {
      const newLabelsToRender: LabelRenderData[] = [];

      if (hoveredSpanIndex === null) {
        setLabelsToRender([]);
        return;
      }

      const hoveredSpan = spans[hoveredSpanIndex];
      if (!hoveredSpan) return;

      const selectedAnnotationsForSpan = hoveredSpan.annotations.filter((ann) =>
        isAnnotationSelected(ann)
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

        const spanOffsetX = spanRect.left - containerRect.left;
        const spanOffsetY = spanRect.top - containerRect.top;

        const margin = 10;
        const layerMarginIncrement = 10;
        const labelWidth = 100; // Adjust as needed
        const labelHeight = 30; // Adjust as needed
        const labelSpacing = 10;

        selectedAnnotationsForSpan.forEach((annotation, index) => {
          let layer = 0;
          let labelsInPreviousLayers = 0;

          while (true) {
            const rectWidth =
              spanRect.width + 2 * (margin + layer * layerMarginIncrement);
            const rectHeight =
              spanRect.height + 2 * (margin + layer * layerMarginIncrement);

            const perimeter = 2 * (rectWidth + rectHeight);

            const maxLabelsInLayer = Math.floor(
              perimeter / (Math.max(labelWidth, labelHeight) + labelSpacing)
            );

            if (index < labelsInPreviousLayers + maxLabelsInLayer) {
              break;
            } else {
              labelsInPreviousLayers += maxLabelsInLayer;
              layer++;
            }
          }

          const positionInLayer = index - labelsInPreviousLayers;

          const rectWidth =
            spanRect.width + 2 * (margin + layer * layerMarginIncrement);
          const rectHeight =
            spanRect.height + 2 * (margin + layer * layerMarginIncrement);

          const perimeter = 2 * (rectWidth + rectHeight);

          const labelPositionAlongPerimeter =
            positionInLayer *
            (Math.max(labelWidth, labelHeight) + labelSpacing);

          let x = 0;
          let y = 0;

          let positionRemaining = labelPositionAlongPerimeter % perimeter;

          const leftEdgeX =
            spanOffsetX - margin - layer * layerMarginIncrement - labelWidth;
          const topEdgeY =
            spanOffsetY - margin - layer * layerMarginIncrement - labelHeight;
          const rightEdgeX =
            spanOffsetX +
            spanRect.width +
            margin +
            layer * layerMarginIncrement;
          const bottomEdgeY =
            spanOffsetY +
            spanRect.height +
            margin +
            layer * layerMarginIncrement;

          if (positionRemaining < rectWidth) {
            // Top edge
            x = leftEdgeX + labelWidth + positionRemaining;
            y = topEdgeY;
          } else if (positionRemaining < rectWidth + rectHeight) {
            // Right edge
            x = rightEdgeX;
            y = topEdgeY + (positionRemaining - rectWidth) + labelHeight;
          } else if (positionRemaining < 2 * rectWidth + rectHeight) {
            // Bottom edge
            x =
              rightEdgeX -
              (positionRemaining - (rectWidth + rectHeight)) -
              labelWidth;
            y = bottomEdgeY;
          } else {
            // Left edge
            x = leftEdgeX;
            y =
              bottomEdgeY -
              (positionRemaining - (2 * rectWidth + rectHeight)) -
              labelHeight;
          }

          // Adjust x and y to ensure labels are within bounds
          x = Math.max(0, Math.min(x, containerRect.width - labelWidth));
          y = Math.max(0, Math.min(y, containerRect.height - labelHeight));

          newLabelsToRender.push({
            annotation,
            position: { x, y },
            labelIndex: index,
          });
        });
      }

      setLabelsToRender(newLabelsToRender);
    };

    calculateLabelPositions();
  }, [hoveredSpanIndex, spans, isAnnotationSelected]);

  /**
   * Converts a hex color code to RGBA.
   * @param hex - The hex color string
   * @param alpha - The alpha value
   * @returns The RGBA color string
   */
  const hexToRgba = (hex: string, alpha: number): string => {
    let r = 0,
      g = 0,
      b = 0;
    if (hex.startsWith("#")) {
      hex = hex.slice(1);
    }
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }
    return `rgba(${r},${g},${b},${alpha})`;
  };

  const containerStyle: React.CSSProperties = {
    fontSize: `${16 * zoom_level}px`,
    lineHeight: `${1.6 * zoom_level}`,
    position: "relative",
    flex: 1,
  };

  return (
    <>
      <PaperContainer
        id="PaperContainer"
        ref={containerRef}
        onMouseUp={handleMouseUp}
        onClick={() => {
          setSelectedAnnotations([]);
        }}
        style={containerStyle}
        maxHeight={maxHeight}
        maxWidth={maxWidth}
      >
        {spans.map((span, index) => {
          console.log("Span", span, index);
          const { text: spanText, annotations: spanAnnotations, start } = span;

          const spanStyle: React.CSSProperties = {
            display: "inline",
            position: "relative",
            cursor: "text",
            userSelect: "text",
            whiteSpace: "pre-wrap",
            borderRadius: "5px",
          };

          const selectedAnnotationsForSpan = spanAnnotations.filter((ann) =>
            isAnnotationSelected(ann)
          );

          if (selectedAnnotationsForSpan.length === 1) {
            spanStyle.backgroundColor = selectedAnnotationsForSpan[0]
              .annotationLabel.color
              ? hexToRgba(
                  selectedAnnotationsForSpan[0].annotationLabel.color,
                  0.3
                )
              : "transparent";
          } else if (selectedAnnotationsForSpan.length === 2) {
            spanStyle.backgroundImage = `linear-gradient(to bottom, ${hexToRgba(
              selectedAnnotationsForSpan[0].annotationLabel.color
                ? selectedAnnotationsForSpan[0].annotationLabel.color
                : "#fdfd96",
              0.3
            )} 50%, ${hexToRgba(
              selectedAnnotationsForSpan[1].annotationLabel.color
                ? selectedAnnotationsForSpan[1].annotationLabel.color
                : "#fdfd96",
              0.3
            )} 50%)`;
          } else if (selectedAnnotationsForSpan.length > 2) {
            const gradientColors = selectedAnnotationsForSpan
              .map((ann) =>
                hexToRgba(ann.annotationLabel.color || "transparent", 0.3)
              )
              .join(", ");
            spanStyle.backgroundImage = `linear-gradient(to right, ${gradientColors})`;
          }

          const isSearchResult = spanAnnotations.some((ann) =>
            ann.id.startsWith("search-result-")
          );

          return (
            <span
              key={`span-${index}`}
              style={spanStyle}
              data-char-index={start}
              data-span-index={index}
              onMouseEnter={() => handleMouseEnter(index)}
              onMouseLeave={handleMouseLeave}
              ref={
                isSearchResult
                  ? (el) => {
                      searchResultElementRefs.current[
                        `search-result-${index}`
                      ] = el;
                    }
                  : undefined
              }
            >
              {spanText}
            </span>
          );
        })}
        {labelsToRender.map(({ annotation, position, labelIndex }) => {
          const actions: CloudButtonItem[] = [
            {
              name: "edit",
              color: "#a3a3a3",
              tooltip: "Edit Annotation",
              onClick: () => {
                setAnnotationToEdit(annotation);
                setEditModalOpen(true);
              },
            },
            {
              name: "trash",
              color: "#d3d3d3",
              tooltip: "Delete Annotation",
              onClick: () => {
                deleteAnnotation(annotation.id);
              },
            },
          ];

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
              key={annotation.id}
              style={{
                left: position.x,
                top: position.y,
                transitionDelay: `${labelIndex * 0.05}s`,
                opacity: isAnnotationSelected(annotation) ? 1 : 0.3,
              }}
              onMouseEnter={handleLabelMouseEnter}
              onMouseLeave={handleLabelMouseLeave}
            >
              <Label
                id={`label-${annotation.id}`}
                color={annotation.annotationLabel.color || "#cccccc"}
                $index={labelIndex}
                onClick={(e) => {
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
        })}
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
