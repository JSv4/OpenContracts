import React, { useContext, useState } from "react";
import {
  Divider,
  Header,
  Button,
  Segment,
  Popup,
  Icon,
  Card,
} from "semantic-ui-react";

import styled from "styled-components";

import { DocTypeLabel, BlankDocTypeLabel } from "./DocTypeLabels";
import { DocTypePopup } from "./DocTypePopup";

import _ from "lodash";

import "./DocTypeLabelDisplayStyles.css";
import { AnnotationStore, DocTypeAnnotation } from "../context";
import { AnnotationLabelType } from "../../../graphql/types";
import { PermissionTypes } from "../../types";

export const DocTypeLabelDisplay = ({ read_only }: { read_only: boolean }) => {
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
    annotation_elements = doc_annotations.map((annotation) => (
      <DocTypeLabel
        key={annotation.id}
        onRemove={
          annotation.myPermissions.includes(PermissionTypes.CAN_REMOVE)
            ? () => onDelete(annotation)
            : null
        }
        label={annotation.label}
      />
    ));
  }

  // Want to reduce the existing label ids to flat array of just ids...
  let existing_labels = doc_annotations.map(
    (annotation) => annotation.label.id
  );

  // Filter out already applied labels from the label options
  let filtered_doc_label_choices = doc_label_choices.filter(
    (obj) => !_.includes(existing_labels, obj.id)
  );

  return (
    <>
      <DocTypeWidgetContainer
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {!read_only ? (
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
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
          }}
        >
          <Segment className="main_body" attached="top">
            <Divider horizontal style={{ margin: "0px" }}>
              <Header as="h5">
                ({annotation_elements.length}) Doc Type
                {annotation_elements.length > 1 ? "(s)" : ""}
              </Header>
            </Divider>
          </Segment>
          <Segment
            className={
              hovered
                ? "main_segment_container_hovered"
                : "main_segment_container"
            }
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
                <Card.Group
                  itemsPerRow={1}
                  className={expanded ? "expanded_labels" : "collapsed_labels"}
                >
                  {annotation_elements}
                </Card.Group>
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

const DocTypeWidgetContainer = styled.div`
  position: fixed;
  z-index: 1000;
  bottom: 2vh;
  right: 2vh;
  display: flex;
  flex-direction: row;
  justify-content: center;
`;

const CardGroupScrollContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  flex: 1;
  scroll-y: auto;
`;
