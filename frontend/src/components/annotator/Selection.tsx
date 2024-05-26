import React, {
  MouseEvent,
  useContext,
  useState,
  useEffect,
  SyntheticEvent,
  useRef,
} from "react";
import styled, { ThemeProps } from "styled-components";
import _ from "lodash";
import uniqueId from "lodash/uniqueId";

import {
  Modal,
  Dropdown,
  DropdownItemProps,
  DropdownProps,
  Image,
  Button,
  Icon,
} from "semantic-ui-react";

import {
  TokenId,
  PDFPageInfo,
  AnnotationStore,
  ServerAnnotation,
} from "./context";
import {} from "./";
import {
  HorizontallyJustifiedEndDiv,
  HorizontallyJustifiedStartDiv,
  VerticallyJustifiedEndDiv,
} from "./sidebar/common";
import {
  annotationSelectedViaRelationship,
  getRelationImageHref,
} from "./utils";
import { BoundingBox, PermissionTypes } from "../types";
import {
  LabelDisplayBehavior,
  ServerAnnotationType,
} from "../../graphql/types";

function hexToRgb(hex: string) {
  // For shortsighted reasons, the color stored is missing #. Check first to see if number is missing hex, if so
  // add it and THEN run the
  try {
    let color_str = hex.substring(0, 1) !== "#" ? "#" + hex : hex;

    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color_str);
    if (!result) {
      throw new Error("Unable to parse color.");
    }
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    };
  } catch {
    return {
      r: 255,
      g: 255,
      b: 0,
    };
  }
}

function getBorderWidthFromBounds(bounds: BoundingBox): number {
  //
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  if (width < 100 || height < 100) {
    return 1;
  } else {
    return 3;
  }
}

interface SelectionBoundaryProps {
  id?: string;
  hidden: boolean;
  showBoundingBox?: boolean;
  scrollIntoView?: boolean;
  selectionRef?:
    | React.MutableRefObject<Record<string, HTMLElement | null>>
    | undefined;
  color: string;
  bounds: BoundingBox;
  selected: boolean;
  children?: React.ReactNode;
  annotationId?: string;
  onHover?: (hovered: boolean) => void;
  onClick?: () => void;
  setJumpedToAnnotationOnLoad?: (annot_id: string) => null | void;
}

export const SelectionBoundary = ({
  id,
  hidden,
  showBoundingBox,
  scrollIntoView,
  selectionRef,
  color,
  bounds,
  children,
  onHover,
  onClick,
  setJumpedToAnnotationOnLoad,
  selected,
}: SelectionBoundaryProps) => {
  const width = bounds.right - bounds.left;
  const height = bounds.bottom - bounds.top;
  const rotateY = width < 0 ? -180 : 0;
  const rotateX = height < 0 ? -180 : 0;
  let rgbColor = hexToRgb(color);
  let opacity = 0.1;
  const border = getBorderWidthFromBounds(bounds);

  if (!showBoundingBox || hidden) {
    rgbColor = {
      r: 255,
      g: 255,
      b: 255,
    };
    opacity = 0.0;
  } else {
    if (selected) {
      opacity = 0.4;
    }
  }

  const createRefAndScrollIfPreSelected = (element: HTMLSpanElement | null) => {
    // console.log(`createRefAndScrollIfPreSelected - id ${id} check for element and ref`);

    if (element && selectionRef && id) {
      // console.log(`createRefAndScrollIfPreSelected - id ${id} has required values \n scrollIntoView ${scrollIntoView} \n handledScroll ${handledScroll}`);

      // Link this annotation boundary to the annotation id in our mutatable ref that holds our annotation refs.
      selectionRef.current[id] = element;

      //if requested, scroll to Selection on render
      if (scrollIntoView) {
        // Guidance on getting a proper offset here (thanks, SO):
        // https://stackoverflow.com/questions/49820013/javascript-scrollintoview-smooth-scroll-and-offset
        element.scrollIntoView({
          behavior: "auto" /*or smooth*/,
          block: "center",
        });

        // As noted elsewhere, there are several layers of states in this Annotator due to preservation
        // of the PAWLS application's context. Probably a better way to handle this on a more extensive
        // redesign, but what we're doing here is using a method to update state on parent
        // Annotator to log that this Selection with its annotation id was mostly recently "jumped" to.
        // This is used to help determine if an annotation a user wanted to open the <Annotator/> directly to
        // is still loading or was in fact displayed. This is then used to update query vars.
        if (setJumpedToAnnotationOnLoad) {
          setJumpedToAnnotationOnLoad(id);
        }
      }
    }
  };

  // Some guidance on refs here: https://stackoverflow.com/questions/61489857/why-i-cant-call-useref-inside-callback
  return (
    <span
      id={`SELECTION_${id}`}
      ref={createRefAndScrollIfPreSelected}
      onClick={(e) => {
        // Here we are preventing the default PdfAnnotationsContainer
        // behaviour of drawing a new bounding box if the shift key
        // is pressed in order to allow users to select multiple
        // annotations and associate them together with a relation.
        if (e.shiftKey && onClick) {
          e.stopPropagation();
          onClick();
        }
      }}
      onMouseDown={(e) => {
        if (e.shiftKey && onClick) {
          e.stopPropagation();
        }
      }}
      onMouseEnter={
        onHover && !hidden
          ? (e) => {
              // Don't show on hover if component is set to hidden
              onHover(true);
            }
          : () => {}
      }
      onMouseLeave={
        onHover && !hidden
          ? (e) => {
              // Don't show on hover if component is set to hidden
              onHover(false);
            }
          : () => {}
      }
      style={{
        position: "absolute",
        left: `${bounds.left}px`,
        top: `${bounds.top}px`,
        width: `${Math.abs(width)}px`,
        height: `${Math.abs(height)}px`,
        transform: `rotateY(${rotateY}deg) rotateX(${rotateX}deg)`,
        transformOrigin: "top left",
        border: `${showBoundingBox && !hidden ? border : 0}px solid ${color}`,
        background: `rgba(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b}, ${opacity})`,
      }}
    >
      {children || null}
    </span>
  );
};

interface TokenSpanProps {
  id?: string;
  hidden?: boolean;
  color?: string;
  isSelected?: boolean;
  highOpacity?: boolean;
  left: number;
  right: number;
  top: number;
  bottom: number;
  pointerEvents: string;
  theme?: any;
}

/**
 * Originally Got This Error:
 * Over 200 classes were generated for component styled.div with the id of "sc-dlVxhl".
 * Consider using the attrs method, together with a style object for frequently changed styles.
 *
 * Example:
 * const Component = styled.div.attrs(props => ({
 *   style: {
 *     background: props.background,
 *   },
 * }))`width: 100%;`
 *
 * Refactored to reflect this pattern.
 *
 * FYI, Tokens don't respond to pointerEvents because
 * they are ontop of the bounding boxes and the canvas,
 * which do respond to pointer events.
 *
 */

const TokenSpan = styled.span.attrs(
  ({
    id,
    theme,
    top,
    bottom,
    left,
    right,
    pointerEvents,
    hidden,
    color,
    isSelected,
    highOpacity,
  }: TokenSpanProps) => ({
    id,
    style: {
      background: isSelected
        ? color
          ? color.toUpperCase()
          : theme.color.B3
        : "none",
      opacity: hidden ? 0.0 : highOpacity ? 0.4 : 0.2,
      left: `${left}px`,
      top: `${top}px`,
      width: `${right - left}px`,
      height: `${bottom - top}px`,
      pointerEvents: pointerEvents,
    },
  })
)`
  position: absolute;
  border-radius: 3px;
`;

interface SelectionTokenProps {
  id?: string;
  color?: string;
  className?: string;
  hidden?: boolean;
  pageInfo: PDFPageInfo;
  highOpacity?: boolean;
  tokens: TokenId[] | null;
  scrollTo?: boolean;
}
export const SelectionTokens = ({
  id,
  color,
  className,
  hidden,
  pageInfo,
  highOpacity,
  tokens,
  scrollTo,
}: SelectionTokenProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollTo) {
      if (containerRef.current !== undefined && containerRef.current !== null) {
        console.log("Scroll to", scrollTo);
        containerRef.current.scrollIntoView();
      }
    }
  }, [scrollTo]);

  return (
    <div ref={containerRef} id={`SelectionTokenWrapper_${uniqueId()}`}>
      {tokens ? (
        tokens.map((t, i) => {
          const b = pageInfo.getScaledTokenBounds(
            pageInfo.tokens[t.tokenIndex]
          );
          return (
            <TokenSpan
              id={`${uniqueId()}`}
              hidden={hidden}
              key={i}
              className={className}
              isSelected={true}
              highOpacity={highOpacity}
              color={color ? color : undefined}
              left={b.left}
              right={b.right}
              top={b.top}
              bottom={b.bottom}
              pointerEvents="none"
            />
          );
        })
      ) : (
        <></>
      )}
    </div>
  );
};

interface EditLabelModalProps {
  annotation: ServerAnnotation;
  visible: boolean;
  onHide: () => void;
}

const EditLabelModal = ({
  annotation,
  visible,
  onHide,
}: EditLabelModalProps) => {
  const annotationStore = useContext(AnnotationStore);

  const [selectedLabel, setSelectedLabel] = useState(
    annotation.annotationLabel
  );

  // There are onMouseDown listeners on the <canvas> that handle the
  // creation of new annotations. We use this function to prevent that
  // from being triggered when the user engages with other UI elements.
  const onMouseDown = (e: MouseEvent) => {
    e.stopPropagation();
  };

  useEffect(() => {
    const onKeyPress = (e: KeyboardEvent) => {
      // Numeric keys 1-9
      e.preventDefault();
      e.stopPropagation();
      if (e.keyCode >= 49 && e.keyCode <= 57) {
        const index = Number.parseInt(e.key) - 1;
        if (index < annotationStore.spanLabels.length) {
          annotationStore.updateAnnotation(
            new ServerAnnotation(
              annotation.page,
              annotationStore.spanLabels[index],
              annotation.rawText,
              annotation.json,
              annotation.myPermissions,
              annotation.id
            )
          );
          onHide();
        }
      }
    };
    window.addEventListener("keydown", onKeyPress);
    return () => {
      window.removeEventListener("keydown", onKeyPress);
    };
  }, [annotationStore, annotation]);

  const dropdownOptions: DropdownItemProps[] = annotationStore.spanLabels.map(
    (label, index) => ({
      key: label.id,
      text: label.text,
      value: label.id,
    })
  );

  const handleDropdownChange = (
    event: SyntheticEvent<HTMLElement, Event>,
    data: DropdownProps
  ) => {
    event.stopPropagation();
    event.preventDefault();
    const label = annotationStore.spanLabels.find((l) => l.id === data.value);
    if (!label) {
      return;
    }
    setSelectedLabel(label);
  };

  return (
    <Modal header="Edit Label" open={visible} onMouseDown={onMouseDown}>
      <Modal.Content>
        <Dropdown
          placeholder="Select label"
          search
          selection
          options={dropdownOptions}
          onChange={handleDropdownChange}
          onMouseDown={onMouseDown}
          value={selectedLabel.id}
        />
      </Modal.Content>
      <Modal.Actions>
        <Button
          color="green"
          onClick={(event: SyntheticEvent) => {
            // Call mutation to update annotation on server and reflect change locally if it succeeds.
            event.preventDefault();
            event.stopPropagation();

            annotationStore.updateAnnotation(
              new ServerAnnotation(
                annotation.page,
                selectedLabel,
                annotation.rawText,
                annotation.json,
                annotation.myPermissions,
                annotation.id
              )
            );

            onHide();
          }}
          onMouseDown={onMouseDown}
        >
          Save Change
        </Button>
        <Button color="black" onClick={onHide} onMouseDown={onMouseDown}>
          Cancel
        </Button>
      </Modal.Actions>
    </Modal>
  );
};

interface SelectionProps {
  selectionRef:
    | React.MutableRefObject<Record<string, HTMLElement | null>>
    | undefined;
  showBoundingBox: boolean;
  hidden: boolean;
  scrollIntoView: boolean;
  pageInfo: PDFPageInfo;
  annotation: ServerAnnotation;
  labelBehavior: LabelDisplayBehavior;
  showInfo?: boolean;
  children?: React.ReactNode;
  setJumpedToAnnotationOnLoad: (annot: string) => null | void;
}

export const LabelTagContainer = ({
  hovered,
  hidden,
  color,
  display_behavior,
  children,
}: {
  hovered: boolean;
  hidden: boolean;
  color?: string;
  display_behavior?: LabelDisplayBehavior;
  children: React.ReactNode;
}) => {
  let display = !hidden;
  if (display) {
    if (display_behavior === LabelDisplayBehavior.HIDE) {
      display = false;
    } else if (display_behavior === LabelDisplayBehavior.ON_HOVER) {
      display = hovered;
    }
  }

  return (
    <HorizontallyJustifiedEndDiv color={color} hidden={!display}>
      {children}
    </HorizontallyJustifiedEndDiv>
  );
};

export const Selection = ({
  selectionRef,
  showBoundingBox,
  hidden,
  scrollIntoView,
  pageInfo,
  labelBehavior,
  annotation,
  children,
  showInfo = true,
  setJumpedToAnnotationOnLoad,
}: SelectionProps) => {
  const label = annotation.annotationLabel;

  const [hovered, setHovered] = useState(false);
  const [isEditLabelModalVisible, setIsEditLabelModalVisible] = useState(false);

  const annotationStore = useContext(AnnotationStore);

  let color;
  if (!label || !label.color) {
    color = "#616a6b"; // grey as the default.
  } else {
    color = label.color;
  }

  //console.log("Try to get page scaled selection bounds", annotation.json[pageInfo.page.pageNumber - 1].bounds);
  //console.log("pageInfo obj", pageInfo);
  const bounds = pageInfo.getScaledBounds(
    annotation.json[pageInfo.page.pageNumber - 1].bounds
  );
  const border = getBorderWidthFromBounds(bounds);

  const removeAnnotation = () => {
    annotationStore.deleteAnnotation(annotation.id);
  };

  const onShiftClick = () => {
    const current = annotationStore.selectedAnnotations.slice(0);

    // Current contains this annotation, so we remove it.
    if (current.some((other) => other === annotation.id)) {
      const next = current.filter((other) => other !== annotation.id);
      annotationStore.setSelectedAnnotations(next);
      // Otherwise we add it.
    } else {
      current.push(annotation.id);
      annotationStore.setSelectedAnnotations(current);
    }
  };

  const selected = Boolean(
    annotationStore.selectedAnnotations.includes(annotation.id)
  );

  // console.log("Annotation selected", selected, annotation);
  // annotationStore.selectedAnnotations.includes(annotation);
  let relationship_type = "";
  if (selected && annotationStore.selectedRelations.length > 0) {
    relationship_type = annotationSelectedViaRelationship(
      annotation,
      annotationStore.pdfAnnotations.annotations,
      annotationStore.selectedRelations[0]
    );
  }
  // console.log("Relationship type", relationship_type);

  return (
    <>
      <SelectionBoundary
        id={annotation.id}
        hidden={hidden}
        showBoundingBox={showBoundingBox}
        selectionRef={selectionRef}
        scrollIntoView={scrollIntoView}
        color={color}
        bounds={bounds}
        onHover={setHovered}
        onClick={onShiftClick}
        setJumpedToAnnotationOnLoad={setJumpedToAnnotationOnLoad}
        selected={selected}
      >
        {showInfo && !annotationStore.hideLabels ? (
          <SelectionInfo
            bounds={bounds}
            className={`selection_${annotation.id}`}
            border={border}
            color={color}
            showBoundingBox={showBoundingBox}
          >
            <SelectionInfoContainer>
              <HorizontallyJustifiedStartDiv>
                <VerticallyJustifiedEndDiv>
                  <div style={{ position: "absolute", top: "1rem" }}>
                    <Image
                      size="mini"
                      src={getRelationImageHref(relationship_type)}
                    />
                  </div>
                </VerticallyJustifiedEndDiv>
                <VerticallyJustifiedEndDiv>
                  <div>
                    <span
                      className={
                        ["SOURCE", "TARGET"].includes(relationship_type)
                          ? "blinking-text"
                          : ""
                      }
                    >
                      {relationship_type}
                    </span>
                  </div>
                </VerticallyJustifiedEndDiv>
              </HorizontallyJustifiedStartDiv>
              <VerticallyJustifiedEndDiv>
                <LabelTagContainer
                  hidden={hidden}
                  hovered={hovered}
                  color={color}
                  display_behavior={labelBehavior}
                >
                  <div style={{ whiteSpace: "nowrap", overflowX: "visible" }}>
                    <span>{label.text}</span>
                  </div>
                  {annotation.myPermissions.includes(
                    PermissionTypes.CAN_UPDATE
                  ) && !annotation.annotationLabel.readonly ? (
                    <Icon
                      style={{
                        marginLeft: ".25rem",
                        marginRight: ".125rem",
                        cursor: "pointer",
                      }}
                      name="pencil"
                      onClick={(e: SyntheticEvent) => {
                        e.stopPropagation();
                        setIsEditLabelModalVisible(true);
                      }}
                      onMouseDown={(e: SyntheticEvent) => {
                        e.stopPropagation();
                      }}
                    />
                  ) : (
                    <></>
                  )}
                  {annotation.myPermissions.includes(
                    PermissionTypes.CAN_REMOVE
                  ) ? (
                    <Icon
                      style={{
                        marginLeft: ".125rem",
                        marginRight: ".25rem",
                        cursor: "pointer",
                      }}
                      name="trash alternate outline"
                      onClick={(e: SyntheticEvent) => {
                        e.stopPropagation();
                        removeAnnotation();
                      }}
                      // We have to prevent the default behaviour for
                      // the pdf canvas here, in order to be able to capture
                      // the click event.
                      onMouseDown={(e: SyntheticEvent) => {
                        e.stopPropagation();
                      }}
                    />
                  ) : (
                    <></>
                  )}
                </LabelTagContainer>
              </VerticallyJustifiedEndDiv>
            </SelectionInfoContainer>
          </SelectionInfo>
        ) : null}
        <div
          style={{
            width: "100%",
            height: "0px",
            position: "relative",
            top: "0",
            left: "0",
          }}
        >
          {children}
        </div>
      </SelectionBoundary>
      {
        // NOTE: It's important that the parent element of the tokens
        // is the PDF canvas, because we need their absolute position
        // to be relative to that and not another absolute/relatively
        // positioned element. This is why SelectionTokens are not inside
        // SelectionBoundary.
        annotation.json[pageInfo.page.pageNumber - 1].tokensJsons ? (
          <SelectionTokens
            id={`SELECTION_TOKEN_${annotation.id}`}
            color={annotation.annotationLabel.color}
            highOpacity={!showBoundingBox}
            hidden={hidden}
            pageInfo={pageInfo}
            tokens={annotation.json[pageInfo.page.pageNumber - 1].tokensJsons}
          />
        ) : null
      }
      {isEditLabelModalVisible ? (
        <EditLabelModal
          annotation={annotation}
          visible={isEditLabelModalVisible}
          onHide={() => setIsEditLabelModalVisible(false)}
        />
      ) : null}
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
