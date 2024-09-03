import React, { useContext, useState } from "react";
import {
  Divider,
  Header,
  Button,
  Segment,
  Popup,
  Icon,
} from "semantic-ui-react";

import styled from "styled-components";

import { DocTypeLabel, BlankDocTypeLabel } from "./DocTypeLabels";
import { DocTypePopup } from "./DocTypePopup";

import _ from "lodash";

import "./DocTypeLabelDisplayStyles.css";
import { AnnotationStore, DocTypeAnnotation } from "../../context";
import { AnnotationLabelType } from "../../../../graphql/types";
import { PermissionTypes } from "../../../types";
import useWindowDimensions from "../../../hooks/WindowDimensionHook";
import { HideableHasWidth } from "../../common";

export const DocTypeLabelDisplay = ({ read_only }: { read_only: boolean }) => {
  const { width } = useWindowDimensions();

  const annotationStore = useContext(AnnotationStore);

  const doc_label_choices = annotationStore.docTypeLabels;
  const doc_annotations = annotationStore.pdfAnnotations.docTypes;

  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const setHover = (hover: boolean | ((prevState: boolean) => boolean)) => {
    if (!hover) {
      if (open) setOpen(false);
    }
    setHovered(hover);
  };

  const onAdd = (label: AnnotationLabelType) => {
    // console.log("onAddDocToLabel", label);

    annotationStore.createDocTypeAnnotation(
      new DocTypeAnnotation(label, [PermissionTypes.CAN_REMOVE])
    );
    setHover(false);
  };

  const onDelete = (doc_type_annotation: DocTypeAnnotation) => {
    // console.log("Delete annotation_id", doc_type_annotation.id);
    annotationStore.deleteDocTypeAnnotation(doc_type_annotation.id);
  };

  let annotation_elements: any[] = [];
  if (doc_annotations.length === 0) {
    annotation_elements = [<BlankDocTypeLabel key="Blank_LABEL" />];
  } else {
    for (var annotation of doc_annotations) {
      try {
        annotation_elements.push(
          <DocTypeLabel
            key={annotation.id}
            onRemove={
              !read_only &&
              annotation.myPermissions.includes(PermissionTypes.CAN_REMOVE)
                ? () => onDelete(annotation)
                : null
            }
            label={annotation.annotationLabel}
          />
        );
      } catch {}
    }
  }
  console.log(
    "DocTypeLabelDisplay - annotation_elements",
    doc_annotations,
    annotation_elements
  );

  // Want to reduce the existing label ids to flat array of just ids...
  let existing_labels: string[] = [];

  try {
    doc_annotations.map((annotation) => annotation.annotationLabel.id);
  } catch {}

  // Filter out already applied labels from the label options
  let filtered_doc_label_choices = doc_label_choices.filter(
    (obj) => !_.includes(existing_labels, obj.id)
  );

  return (
    <>
      <DocTypeWidgetContainer
        id="DocTypeWidget_Container"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        width={width}
      >
        {!read_only ? (
          <div className="DocTypeWidget_ButtonFlexContainer">
            <div
              id="DocTypeWidget_ButtonContainer"
              className={
                hovered ? "hovered_plus_button" : "not_hovered_plus_button"
              }
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  justifyContent: "center",
                }}
              >
                <div>
                  <Popup
                    open={open}
                    onClose={() => setOpen(false)}
                    onOpen={() => setOpen(true)}
                    on="click"
                    position="top right"
                    offset={[-30, -10]}
                    trigger={
                      <Button
                        style={{
                          width: "2.25vw",
                          height: "2.25vw",
                          minWidth: "40px",
                          minHeight: "40px",
                        }}
                        floated="right"
                        icon="plus"
                        circular
                        positive
                        color="green"
                      />
                    }
                  >
                    <DocTypePopup
                      labels={filtered_doc_label_choices}
                      onAdd={onAdd}
                    />
                  </Popup>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <></>
        )}
        <div
          id="DocTypeWidget_ContentFlexContainer"
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
          }}
        >
          <Segment
            secondary
            inverted
            className="DocTypeWidget_HeaderSegment"
            attached="top"
          >
            <Divider horizontal style={{ margin: "0px" }}>
              <Header as="h5">
                ({annotation_elements.length}) Doc Type
                {annotation_elements.length > 1 ? "(s)" : ""}
              </Header>
            </Divider>
          </Segment>
          <Segment
            inverted
            secondary
            className={`${
              expanded ? " expanded_labels" : " collapsed_labels"
            } ${
              hovered
                ? " DocTypeWidget_BodySegment_hovered"
                : " DocTypeWidget_BodySegment"
            }`}
            attached="bottom"
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                flex: 1,
              }}
            >
              <CardGroupScrollContainer>
                <div
                  style={{
                    width: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-start",
                  }}
                >
                  {annotation_elements}
                </div>
              </CardGroupScrollContainer>
            </div>
          </Segment>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
          }}
        >
          <div
            className={
              hovered && annotation_elements.length > 1
                ? "hovered_expand_button"
                : "not_hovered_expand_button"
            }
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "center",
              }}
            >
              <div>
                <Icon
                  link
                  name={expanded ? "compress" : "expand"}
                  color={expanded ? "orange" : "blue"}
                  onClick={() => setExpanded(!expanded)}
                />
              </div>
            </div>
          </div>
        </div>
      </DocTypeWidgetContainer>
    </>
  );
};

// Need to investigate why right value of 0 is required to get this to look like matching
// left posiiton on the span label container... not a huge priority atm
const DocTypeWidgetContainer = styled.div<HideableHasWidth>(
  ({ width }) => `
    position: fixed;
    z-index: 1000;
    bottom: ${Number(width) <= 400 ? "10px" : "2vh"};
    right: 0px;
    display: flex;
    flex-direction: row;
    justify-content: center;
  `
);

const CardGroupScrollContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  height: 100% !important;
`;
