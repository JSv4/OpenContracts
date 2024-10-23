import React, { useContext, useState, useEffect, useRef } from "react";
import _ from "lodash";

import { Image, Icon } from "semantic-ui-react";

import {
  PDFPageInfo,
  AnnotationStore,
  ServerTokenAnnotation,
} from "../../context";

import {
  HorizontallyJustifiedStartDiv,
  VerticallyJustifiedEndDiv,
} from "../../sidebar/common";

import {
  annotationSelectedViaRelationship,
  getRelationImageHref,
} from "../../utils";

import { PermissionTypes } from "../../../types";
import { LabelDisplayBehavior } from "../../../../types/graphql-api";
import { SelectionBoundary } from "./SelectionBoundary";
import {
  LabelTagContainer,
  SelectionInfo,
  SelectionInfoContainer,
} from "./Containers";
import { getBorderWidthFromBounds } from "../../../../utils/transform";
import RadialButtonCloud, {
  CloudButtonItem,
} from "../../../widgets/buttons/RadialButtonCloud";
import { SelectionTokenGroup } from "./SelectionTokenGroup";
import { EditLabelModal } from "../../../widgets/modals/EditLabelModal";
import { useReactiveVar } from "@apollo/client";
import { authToken } from "../../../../graphql/cache";

interface SelectionProps {
  selectionRef:
    | React.MutableRefObject<Record<string, HTMLElement | null>>
    | undefined;
  showBoundingBox: boolean;
  hidden: boolean;
  scrollIntoView: boolean;
  pageInfo: PDFPageInfo;
  annotation: ServerTokenAnnotation;
  labelBehavior: LabelDisplayBehavior;
  showInfo?: boolean;
  children?: React.ReactNode;
  approved?: boolean;
  rejected?: boolean;
  actions?: CloudButtonItem[];
  allowFeedback?: boolean;
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
  allowFeedback,
  showInfo = true,
  setJumpedToAnnotationOnLoad,
}) => {
  const auth_token = useReactiveVar(authToken);
  const [hovered, setHovered] = useState(false);
  const [isEditLabelModalVisible, setIsEditLabelModalVisible] = useState(false);
  const [cloudVisible, setCloudVisible] = useState(false);
  const cloudRef = useRef<HTMLDivElement | null>(null);

  const annotationStore = useContext(AnnotationStore);
  const label = annotation.annotationLabel;
  const color = label?.color || "#616a6b"; // grey as the default

  let actions: CloudButtonItem[] = [];

  if (auth_token) {
    if (allowFeedback) {
      if (!approved) {
        actions.push({
          name: "thumbs up",
          color: "green",
          tooltip: "Upvote Annotation",
          onClick: () => {
            annotationStore.approveAnnotation(annotation.id);
          },
        });
      }
      if (!rejected) {
        actions.push({
          name: "thumbs down",
          color: "red",
          tooltip: "Downvote Annotation",
          onClick: () => {
            annotationStore.rejectAnnotation(annotation.id);
          },
        });
      }
    }
  } else {
    actions.push({
      name: "question",
      color: "blue",
      tooltip: "Login to see available actions!",
      onClick: () => {
        window.alert("Login to leave feedback and see other actions!");
      },
    });
  }

  if (
    annotation.myPermissions.includes(PermissionTypes.CAN_REMOVE) &&
    !annotation.annotationLabel.readonly
  ) {
    actions.push({
      name: "trash alternate outline",
      color: "red",
      tooltip: "Delete Annotation",
      onClick: () => {
        console.log("Delete clicked");
      },
      protected_message: "Are you sure you want to delete this annotation?",
    });
  }

  if (
    annotation.myPermissions.includes(PermissionTypes.CAN_UPDATE) &&
    !annotation.annotationLabel.readonly
  ) {
    actions.push({
      name: "pencil",
      color: "blue",
      tooltip: "Edit Annotation",
      onClick: () => {
        console.log("Edit clicked");
      },
    });
  }

  const bounds = pageInfo.getScaledBounds(
    annotation.json[pageInfo.page.pageNumber - 1].bounds
  );
  const border = getBorderWidthFromBounds(bounds);

  const removeAnnotation = () => {
    annotationStore.deleteAnnotation(annotation.id);
  };

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
                    <RadialButtonCloud
                      parentBackgroundColor={color}
                      actions={actions}
                    />
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
          <SelectionTokenGroup
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
