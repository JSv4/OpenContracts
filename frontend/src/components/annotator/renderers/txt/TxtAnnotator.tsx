/**
 * TxtAnnotator Component
 *
 * Improvements:
 * 1. Enhanced label positioning for nested annotations by assigning layers and adjusting radii.
 * 2. Improved collision detection and boundary avoidance in force simulation.
 * 3. Connector lines accurately connect labels to annotations with clarity.
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import { Label, LabelContainer, PaperContainer } from "./StyledComponents";
import RadialButtonCloud, { CloudButtonItem } from "./RadialButtonCloud";
import { Modal, Button, Dropdown } from "semantic-ui-react";
import { AnnotationLabelType } from "../../../../types/graphql-api";
import { ServerSpanAnnotation } from "../../context";
import { TextSearchSpanResult } from "../../../types";
import { PermissionTypes } from "../../../types";
import styled, { keyframes, css } from "styled-components";
import * as d3 from "d3";
import { hexToRgba } from "./utils";

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

  const containerRef = useRef<HTMLDivElement>(null);
  const hideLabelsTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = useCallback((index: number) => {
    if (hideLabelsTimeout.current) {
      clearTimeout(hideLabelsTimeout.current);
      hideLabelsTimeout.current = null;
    }
    setHoveredSpanIndex(index);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hideLabelsTimeout.current = setTimeout(() => {
      setHoveredSpanIndex(null);
    }, 1000); // Adjust delay as needed
  }, []);

  const handleLabelMouseEnter = useCallback(() => {
    if (hideLabelsTimeout.current) {
      clearTimeout(hideLabelsTimeout.current);
      hideLabelsTimeout.current = null;
    }
  }, []);

  const handleLabelMouseLeave = useCallback(() => {
    hideLabelsTimeout.current = setTimeout(() => {
      setHoveredSpanIndex(null);
    }, 2000); // Adjust delay as needed
  }, []);

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
      annotations: ServerSpanAnnotation[],
      isSearchResult = false,
      isSelectedSearchResult = false
    ) => {
      if (start >= end) return;
      newSpans.push({
        start,
        end,
        text: text.slice(start, end),
        annotations,
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

        const spanX = spanRect.left - containerRect.left + scrollLeft;
        const spanY = spanRect.top - containerRect.top + scrollTop;

        const baseX = spanX + spanRect.width / 2;
        const baseY = spanY + spanRect.height / 2;

        // Sort annotations by length
        const sortedAnnotations = selectedAnnotationsForSpan.sort(
          (a, b) => a.json.end - a.json.start - (b.json.end - b.json.start)
        );

        // Assign layers based on nesting levels
        const layers = sortedAnnotations.map((ann) => {
          return sortedAnnotations.filter(
            (otherAnn) =>
              otherAnn.json.start <= ann.json.start &&
              otherAnn.json.end >= ann.json.end
          ).length;
        });

        const maxLayer = Math.max(...layers);

        const labelWidth = 100; // Approximate label width
        const labelHeight = 30; // Approximate label height

        // Initialize label positions with layered radii
        const initialPositions: LabelRenderData[] = sortedAnnotations.map(
          (annotation, index) => {
            const angle =
              (index / selectedAnnotationsForSpan.length) * Math.PI * 2;

            const layerIndex = layers[index];
            const radius = 80 + layerIndex * 40;

            const x = baseX + radius * Math.cos(angle) - labelWidth / 2;
            const y = baseY + radius * Math.sin(angle) - labelHeight / 2;

            return {
              annotation,
              x,
              y,
              width: labelWidth,
              height: labelHeight,
              labelIndex: index,
            };
          }
        );

        // Run force simulation to adjust label positions
        const simulation = d3
          .forceSimulation<LabelRenderData>(initialPositions)
          .force(
            "collide",
            d3.forceCollide<LabelRenderData>((d) => d.width / 2 + 10)
          )
          .force(
            "x",
            d3
              .forceX<LabelRenderData>(baseX)
              .strength(0.1)
              .x((d) => d.x + d.width / 2)
          )
          .force(
            "y",
            d3
              .forceY<LabelRenderData>(baseY)
              .strength(0.1)
              .y((d) => d.y + d.height / 2)
          )
          .force("avoidance", (alpha) => {
            initialPositions.forEach((d, i) => {
              const annRect = spanElement.getBoundingClientRect();
              const dx = d.x + d.width / 2 - (spanX + annRect.width / 2);
              const dy = d.y + d.height / 2 - (spanY + annRect.height / 2);
              const dist = Math.sqrt(dx * dx + dy * dy);
              const minDist = annRect.width / 2 + d.width / 2 + 20;
              if (dist < minDist) {
                const force = (minDist - dist) * alpha;
                d.x += (dx / dist) * force;
                d.y += (dy / dist) * force;
              }
            });
          })
          .alphaDecay(0.1)
          .stop();

        simulation.tick(100);

        // Ensure labels stay within the container bounds
        initialPositions.forEach((d) => {
          d.x = Math.max(
            0,
            Math.min(d.x, containerElement.scrollWidth - d.width)
          );
          d.y = Math.max(
            0,
            Math.min(d.y, containerElement.scrollHeight - d.height)
          );
        });

        setLabelsToRender(initialPositions);
      }
    };

    calculateLabelPositions();
  }, [hoveredSpanIndex, spans, showStructuralAnnotations, selectedAnnotations]);

  interface Corner {
    x: number;
    y: number;
    distance?: number;
  }

  const getClosestCorner = (
    labelX: number,
    labelY: number,
    spanRect: DOMRect,
    containerRect: DOMRect,
    scrollLeft: number,
    scrollTop: number
  ): Corner => {
    const corners: Corner[] = [
      {
        x: spanRect.left - containerRect.left + scrollLeft,
        y: spanRect.top - containerRect.top + scrollTop,
      },
      {
        x: spanRect.right - containerRect.left + scrollLeft,
        y: spanRect.top - containerRect.top + scrollTop,
      },
      {
        x: spanRect.left - containerRect.left + scrollLeft,
        y: spanRect.bottom - containerRect.top + scrollTop,
      },
      {
        x: spanRect.right - containerRect.left + scrollLeft,
        y: spanRect.bottom - containerRect.top + scrollTop,
      },
    ];

    return corners.reduce(
      (closest, corner) => {
        const distance = Math.sqrt(
          Math.pow(labelX - corner.x, 2) + Math.pow(labelY - corner.y, 2)
        );
        return distance < (closest.distance ?? Infinity)
          ? { ...corner, distance }
          : closest;
      },
      { x: 0, y: 0, distance: Infinity } as Corner
    );
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
        {/* Render connector lines */}
        {labelsToRender.length > 0 && (
          <ConnectorLine>
            <svg width="100%" height="100%">
              <defs>
                {labelsToRender.map(({ annotation }) => (
                  <marker
                    key={`arrowhead-${annotation.id}`}
                    id={`arrowhead-${annotation.id}`}
                    viewBox="0 0 10 10"
                    refX="5"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path
                      d="M 0 0 L 10 5 L 0 10 z"
                      fill={annotation.annotationLabel.color || "#000"}
                    />
                  </marker>
                ))}
              </defs>
              {labelsToRender.map(
                ({ annotation, x, y, width, height, labelIndex }) => {
                  const containerElement = containerRef.current;
                  const spanElement = containerElement?.querySelector(
                    `span[data-span-index="${hoveredSpanIndex}"]`
                  ) as HTMLElement;

                  if (!spanElement) return null;
                  const containerRect =
                    containerElement?.getBoundingClientRect() ?? new DOMRect();
                  const spanRect = spanElement.getBoundingClientRect();

                  const scrollLeft = containerElement?.scrollLeft ?? 0;
                  const scrollTop = containerElement?.scrollTop ?? 0;

                  const { x: endX, y: endY } = getClosestCorner(
                    x + width / 2,
                    y + height / 2,
                    spanRect,
                    containerRect,
                    scrollLeft,
                    scrollTop
                  );

                  const labelCenterX = x + width / 2;
                  const labelCenterY = y + height / 2;

                  const pathData = `M${labelCenterX},${labelCenterY} 
                    C${(labelCenterX + endX) / 2},${labelCenterY} 
                    ${(labelCenterX + endX) / 2},${endY} 
                    ${endX},${endY}`;

                  return (
                    <path
                      key={`connector-${annotation.id}-${labelIndex}`}
                      d={pathData}
                      stroke={annotation.annotationLabel.color || "#000"}
                      strokeWidth="2"
                      fill="none"
                      markerEnd={`url(#arrowhead-${annotation.id})`}
                    />
                  );
                }
              )}
            </svg>
          </ConnectorLine>
        )}
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
