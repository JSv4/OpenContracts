import React, { useState, useRef, useCallback, useEffect } from "react";
import { Label, LabelContainer, PaperContainer } from "./StyledComponents";
import { useDebouncedCallback } from "use-debounce";
import RadialButtonCloud, { CloudButtonItem } from "./RadialButtonCloud";
import { Modal, Button, Dropdown } from "semantic-ui-react";
import { AnnotationLabelType } from "../../../../graphql/types";
import { ServerSpanAnnotation } from "../../context";

interface TxtAnnotatorProps {
  text: string;
  annotations: ServerSpanAnnotation[];
  getSpan: (span: {
    start: number;
    end: number;
    text: string;
  }) => ServerSpanAnnotation;
  focusedAnnotationId: string | null;
  onFocusAnnotation: (annotation: ServerSpanAnnotation | null) => void;
  visibleLabels: AnnotationLabelType[];
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
}

interface LabelRenderData {
  annotation: ServerSpanAnnotation;
  position: { x: number; y: number };
  labelIndex: number;
}

const TxtAnnotator: React.FC<TxtAnnotatorProps> = ({
  text,
  annotations,
  getSpan,
  focusedAnnotationId,
  onFocusAnnotation,
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
}) => {
  const [hoveredSpanIndex, setHoveredSpanIndex] = useState<number | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<
    string | null
  >(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [annotationToEdit, setAnnotationToEdit] =
    useState<ServerSpanAnnotation | null>(null);
  const [labelsToRender, setLabelsToRender] = useState<LabelRenderData[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedAnnotation, setFocusedAnnotation] =
    useState<ServerSpanAnnotation | null>(null);

  useEffect(() => {
    if (focusedAnnotationId) {
      const focusedAnnotationObjs = annotations.filter(
        (annot) => annot.id == focusedAnnotationId
      );
      if (focusedAnnotationObjs.length == -1) {
        setFocusedAnnotation(focusedAnnotationObjs[0]);
      }
    }
  }, [focusedAnnotationId]);

  const debouncedSetHoveredSpanIndex = useDebouncedCallback(
    (spanIndex: number | null) => {
      setHoveredSpanIndex(spanIndex);
    },
    100
  );

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

  const handleMouseEnter = useCallback(
    (spanIndex: number) => {
      debouncedSetHoveredSpanIndex(spanIndex);
    },
    [debouncedSetHoveredSpanIndex]
  );

  const handleMouseLeave = useCallback(() => {
    debouncedSetHoveredSpanIndex(null);
  }, [debouncedSetHoveredSpanIndex]);

  const handleLabelMouseEnter = useCallback(() => {
    debouncedSetHoveredSpanIndex.cancel();
  }, [debouncedSetHoveredSpanIndex]);

  const handleLabelMouseLeave = useCallback(() => {
    debouncedSetHoveredSpanIndex(null);
  }, [debouncedSetHoveredSpanIndex]);

  const handleLabelClick = useCallback(
    (annotation: ServerSpanAnnotation) => {
      if (focusedAnnotation && focusedAnnotation.id === annotation.id) {
        onFocusAnnotation(null);
        setSelectedAnnotationId(null);
      } else {
        onFocusAnnotation(annotation);
        setSelectedAnnotationId(annotation.id);
      }
    },
    [focusedAnnotation, onFocusAnnotation]
  );

  const isAnnotationSelected = useCallback(
    (annotation: ServerSpanAnnotation) => {
      if (selectedAnnotationId) {
        return annotation.id === selectedAnnotationId;
      } else if (selectedLabelTypeId) {
        return annotation.annotationLabel.id === selectedLabelTypeId;
      } else {
        return true;
      }
    },
    [selectedAnnotationId, selectedLabelTypeId]
  );

  useEffect(() => {
    const visibleLabelTexts = visibleLabels.map((label) => label.text);

    const sortedAnnotations = annotations
      .filter(
        (ann) =>
          ann.annotationLabel.text &&
          visibleLabelTexts.includes(ann.annotationLabel.text)
      )
      .sort((a, b) => a.json.start - b.json.start);

    const newSpans: {
      start: number;
      end: number;
      text: string;
      annotations: ServerSpanAnnotation[];
    }[] = [];

    let lastIndex = 0;

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
  }, [annotations, text, visibleLabels]);

  useEffect(() => {
    const calculateLabelPositions = () => {
      const newLabelsToRender: LabelRenderData[] = [];

      annotations.forEach((annotation, spanIndex) => {
        if (hoveredSpanIndex !== spanIndex) return;

        const selectedAnnotations = isAnnotationSelected(annotation)
          ? [annotation]
          : [];

        if (selectedAnnotations.length === 0) return;

        const containerElement = containerRef.current;
        const spanElement = containerElement?.querySelector(
          `span[data-span-index="${spanIndex}"]`
        ) as HTMLElement;

        if (containerElement && spanElement) {
          const containerRect = containerElement.getBoundingClientRect();
          const spanRect = spanElement.getBoundingClientRect();

          const spanOffsetX = spanRect.left - containerRect.left;
          const spanOffsetY = spanRect.top - containerRect.top;

          // Variables for label positioning
          const margin = 20; // Distance from the span
          const layerMarginIncrement = 20; // Amount by which the rectangle grows each layer
          const labelSpacing = 10; // Spacing between labels

          // Assuming labels have approximate dimensions
          const labelWidth = 80; // Approximate width of a label
          const labelHeight = 20; // Approximate height of a label

          selectedAnnotations.forEach((annotation, index) => {
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
      });

      setLabelsToRender(newLabelsToRender);
    };

    calculateLabelPositions();
  }, [hoveredSpanIndex, annotations, isAnnotationSelected]);

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
        ref={containerRef}
        onMouseUp={handleMouseUp}
        onClick={() => {
          if (focusedAnnotation) {
            onFocusAnnotation(null);
          }
          if (selectedAnnotationId) {
            setSelectedAnnotationId(null);
          }
        }}
        style={containerStyle}
        maxHeight={maxHeight}
        maxWidth={maxWidth}
      >
        {annotations.map((annot, index) => {
          const text = annot.rawText;
          const annotation = [annot];
          const start = annot.json.start;

          const spanStyle: React.CSSProperties = {
            display: "inline",
            position: "relative",
            cursor: "text",
            userSelect: "text",
            whiteSpace: "pre-wrap",
            borderRadius: "5px",
          };

          const selectedAnnotations = isAnnotationSelected(annot)
            ? [annot]
            : [];

          if (selectedAnnotations.length === 1) {
            spanStyle.backgroundColor = selectedAnnotations[0].annotationLabel
              .color
              ? hexToRgba(selectedAnnotations[0].annotationLabel.color, 0.3)
              : "transparent";
          } else if (selectedAnnotations.length === 2) {
            spanStyle.backgroundImage = `linear-gradient(to bottom, ${hexToRgba(
              selectedAnnotations[0].annotationLabel.color
                ? selectedAnnotations[0].annotationLabel.color
                : "#fdfd96",
              0.3
            )} 50%, ${hexToRgba(
              selectedAnnotations[1].annotationLabel.color
                ? selectedAnnotations[1].annotationLabel.color
                : "#fdfd96",
              0.3
            )} 50%)`;
          } else if (selectedAnnotations.length > 2) {
            const gradientColors = selectedAnnotations
              .map((ann) =>
                hexToRgba(ann.annotationLabel.color || "transparent", 0.3)
              )
              .join(", ");
            spanStyle.backgroundImage = `linear-gradient(to right, ${gradientColors})`;
          }

          return (
            <span
              key={`span-${index}`}
              style={spanStyle}
              data-char-index={start}
              data-span-index={index}
              onMouseEnter={() => handleMouseEnter(index)}
              onMouseLeave={handleMouseLeave}
            >
              {text}
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
