import React, {
  MouseEvent,
  useContext,
  useState,
  useEffect,
  SyntheticEvent,
  useRef,
} from "react";
import styled, { css, keyframes } from "styled-components";
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
  SemanticICONS,
  ButtonProps,
} from "semantic-ui-react";

import {
  TokenId,
  PDFPageInfo,
  AnnotationStore,
  ServerAnnotation,
} from "../context";
import {
  HorizontallyJustifiedStartDiv,
  VerticallyJustifiedEndDiv,
} from "../sidebar/common";
import {
  annotationSelectedViaRelationship,
  getRelationImageHref,
} from "../utils";
import { PermissionTypes } from "../../types";
import { LabelDisplayBehavior } from "../../../graphql/types";
import { SelectionBoundary } from "./SelectionBoundary";
import {
  LabelTagContainer,
  SelectionInfo,
  SelectionInfoContainer,
} from "./Containers";
import { getBorderWidthFromBounds } from "../../../utils/transform";
import RadialButtonCloud from "../../widgets/buttons/RadialButtonCloud";

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

const CloudContainer = styled.div`
  position: absolute;
  top: -60px; /* Adjust as needed */
  left: -60px; /* Adjust as needed */
  width: 120px;
  height: 120px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  opacity: 0;
  animation: fadeIn 0.5s forwards;

  @keyframes fadeIn {
    to {
      opacity: 1;
    }
  }
`;

interface CloudButtonProps extends ButtonProps {
  delay: number;
  xOffset: number;
  yOffset: number;
}

interface CloudButtonItem {
  name: SemanticICONS; // Semantic UI icon names
  color: string;
  tooltip: string;
  onClick: () => void;
}

const CloudButton = styled(Button)<CloudButtonProps>`
  position: absolute;
  opacity: 0;
  animation: moveOut 0.5s forwards;
  animation-delay: ${(props) => props.delay}s;
  transform: translate(0, 0);

  @keyframes moveOut {
    to {
      opacity: 1;
      transform: translate(
        ${(props) => props.xOffset}px,
        ${(props) => props.yOffset}px
      );
    }
  }
`;

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
              annotation.structural,
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
                annotation.structural,
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
  approved?: boolean;
  rejected?: boolean;
  setJumpedToAnnotationOnLoad: (annot: string) => null | void;
}

export const Selection: React.FC<SelectionProps> = ({
  selectionRef,
  showBoundingBox,
  hidden,
  scrollIntoView,
  pageInfo,
  labelBehavior,
  annotation,
  children,
  approved,
  rejected,
  showInfo = true,
  setJumpedToAnnotationOnLoad,
}) => {
  const [hovered, setHovered] = useState(false);
  const [isEditLabelModalVisible, setIsEditLabelModalVisible] = useState(false);
  const [cloudVisible, setCloudVisible] = useState(false);
  const cloudRef = useRef<HTMLDivElement | null>(null);

  const annotationStore = useContext(AnnotationStore);
  const label = annotation.annotationLabel;
  const color = label?.color || "#616a6b"; // grey as the default

  const bounds = pageInfo.getScaledBounds(
    annotation.json[pageInfo.page.pageNumber - 1].bounds
  );
  const border = getBorderWidthFromBounds(bounds);

  const removeAnnotation = () => {
    annotationStore.deleteAnnotation(annotation.id);
  };

  const buttonList: CloudButtonItem[] = [
    {
      name: "pencil",
      color: "blue",
      tooltip: "Edit Annotation",
      onClick: () => {
        setIsEditLabelModalVisible(true);
      },
    },
    {
      name: "trash alternate outline",
      color: "red",
      tooltip: "Delete Annotation",
      onClick: removeAnnotation,
    },
    // Add more buttons as needed
  ];

  const onShiftClick = () => {
    const current = annotationStore.selectedAnnotations.slice(0);
    if (current.some((other) => other === annotation.id)) {
      const next = current.filter((other) => other !== annotation.id);
      annotationStore.setSelectedAnnotations(next);
    } else {
      current.push(annotation.id);
      annotationStore.setSelectedAnnotations(current);
    }
  };

  const handleClickOutside = (event: Event): void => {
    if (
      cloudRef.current &&
      !cloudRef.current.contains(event.target as Node) &&
      !(event.target as Element).closest(".pulsing-dot")
    ) {
      setCloudVisible(false);
    }
  };

  useEffect(() => {
    if (cloudVisible) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [cloudVisible]);

  const selected = annotationStore.selectedAnnotations.includes(annotation.id);

  let relationship_type = "";
  if (selected && annotationStore.selectedRelations.length > 0) {
    relationship_type = annotationSelectedViaRelationship(
      annotation,
      annotationStore.pdfAnnotations.annotations,
      annotationStore.selectedRelations[0]
    );
  }

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
        approved={approved}
        rejected={rejected}
        setJumpedToAnnotationOnLoad={setJumpedToAnnotationOnLoad}
        selected={selected}
      >
        {showInfo && !annotationStore.hideLabels && (
          <SelectionInfo
            id="SelectionInfo"
            bounds={bounds}
            className={`selection_${annotation.id}`}
            border={border}
            color={color}
            showBoundingBox={showBoundingBox}
            approved={approved}
            rejected={rejected}
          >
            <SelectionInfoContainer id="SelectionInfoContainer">
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
                  <div
                    style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <RadialButtonCloud parentBackgroundColor={color} />
                    {cloudVisible && (
                      <CloudContainer ref={cloudRef}>
                        {buttonList.map((btn, index) => (
                          <CloudButton
                            key={index}
                            color={btn.color as any}
                            icon
                            onClick={(e: MouseEvent<HTMLButtonElement>) => {
                              e.stopPropagation();
                              btn.onClick();
                              setCloudVisible(false);
                            }}
                            title={btn.tooltip}
                            delay={index * 0.1}
                            xOffset={
                              Math.cos(
                                (index / buttonList.length) * 2 * Math.PI
                              ) * 50
                            }
                            yOffset={
                              Math.sin(
                                (index / buttonList.length) * 2 * Math.PI
                              ) * 50
                            }
                          >
                            <Icon name={btn.name} />
                          </CloudButton>
                        ))}
                      </CloudContainer>
                    )}
                    <div
                      style={{
                        whiteSpace: "nowrap",
                        overflowX: "visible",
                        marginLeft: "8px",
                      }}
                    >
                      <span>{label.text}</span>
                    </div>
                    {annotation.myPermissions.includes(
                      PermissionTypes.CAN_UPDATE
                    ) &&
                      !annotation.annotationLabel.readonly && (
                        <Icon
                          style={{
                            marginLeft: ".25rem",
                            marginRight: ".125rem",
                            cursor: "pointer",
                          }}
                          name="pencil"
                          onClick={(e: React.SyntheticEvent) => {
                            e.stopPropagation();
                            setIsEditLabelModalVisible(true);
                          }}
                          onMouseDown={(e: React.SyntheticEvent) => {
                            e.stopPropagation();
                          }}
                        />
                      )}
                    {annotation.myPermissions.includes(
                      PermissionTypes.CAN_REMOVE
                    ) &&
                      !annotation.annotationLabel.readonly && (
                        <Icon
                          style={{
                            marginLeft: ".125rem",
                            marginRight: ".25rem",
                            cursor: "pointer",
                          }}
                          name="trash alternate outline"
                          onClick={(e: React.SyntheticEvent) => {
                            e.stopPropagation();
                            removeAnnotation();
                          }}
                          // We have to prevent the default behaviour for
                          // the pdf canvas here, in order to be able to capture
                          // the click event.
                          onMouseDown={(e: React.SyntheticEvent) => {
                            e.stopPropagation();
                          }}
                        />
                      )}
                  </div>
                </LabelTagContainer>
              </VerticallyJustifiedEndDiv>
            </SelectionInfoContainer>
          </SelectionInfo>
        )}
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
        annotation.json[pageInfo.page.pageNumber - 1].tokensJsons && (
          <SelectionTokens
            id={`SELECTION_TOKEN_${annotation.id}`}
            color={annotation.annotationLabel.color}
            highOpacity={!showBoundingBox}
            hidden={hidden}
            pageInfo={pageInfo}
            tokens={annotation.json[pageInfo.page.pageNumber - 1].tokensJsons}
          />
        )
      }
      {isEditLabelModalVisible && (
        <EditLabelModal
          annotation={annotation}
          visible={isEditLabelModalVisible}
          onHide={() => setIsEditLabelModalVisible(false)}
        />
      )}
    </>
  );
};
