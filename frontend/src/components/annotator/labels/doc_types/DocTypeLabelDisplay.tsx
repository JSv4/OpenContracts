import { useState } from "react";
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
import { AnnotationLabelType, LabelType } from "../../../../types/graphql-api";
import { PermissionTypes } from "../../../types";
import useWindowDimensions from "../../../hooks/WindowDimensionHook";
import { HideableHasWidth } from "../../common";
import { DocTypeAnnotation } from "../../types/annotations";
import {
  useAddDocTypeAnnotation,
  useDeleteDocTypeAnnotation,
  usePdfAnnotations,
} from "../../hooks/AnnotationHooks";
import { useCorpusState } from "../../context/CorpusAtom";
import { useReactiveVar } from "@apollo/client";
import { selectedAnalysis, selectedExtract } from "../../../../graphql/cache";

const StyledPopup = styled(Popup)`
  &.ui.popup {
    z-index: 100000 !important;
    padding: 0 !important;
    border: none !important;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12) !important;
    border-radius: 12px !important;
    overflow: hidden !important;
  }
`;

export const DocTypeLabelDisplay = () => {
  const { width } = useWindowDimensions();

  const selected_extract = useReactiveVar(selectedExtract);
  const selected_analysis = useReactiveVar(selectedAnalysis);
  const { permissions: corpus_permissions } = useCorpusState();
  const read_only =
    Boolean(selected_analysis) ||
    Boolean(selected_extract) ||
    !corpus_permissions.includes(PermissionTypes.CAN_UPDATE);

  const { pdfAnnotations } = usePdfAnnotations();
  const { docTypeLabels } = useCorpusState();
  const deleteDocTypeAnnotation = useDeleteDocTypeAnnotation();
  const createDocTypeAnnotation = useAddDocTypeAnnotation();

  const doc_label_choices = docTypeLabels;
  const doc_annotations = pdfAnnotations.docTypes;

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

    createDocTypeAnnotation(label);
    setHover(false);
  };

  const onDelete = (doc_type_annotation: DocTypeAnnotation) => {
    // console.log("Delete annotation_id", doc_type_annotation.id);
    deleteDocTypeAnnotation(doc_type_annotation.id);
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

  // Want to reduce the existing label ids to flat array of just ids...
  let existing_labels: string[] = [];

  try {
    doc_annotations.map((annotation) => annotation.annotationLabel.id);
  } catch {}

  // Filter out already applied labels from the label options
  let filtered_doc_label_choices = doc_label_choices.filter(
    (obj) => !_.includes(existing_labels, obj.id)
  );

  // Early return if conditions are met
  if (
    selected_extract &&
    pdfAnnotations.annotations.filter(
      (annot) => annot.annotationLabel.labelType === LabelType.DocTypeLabel
    ).length === 0
  ) {
    return <></>;
  }

  return (
    <DocTypeWidgetContainer
      id="DocTypeWidget_Container"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      width={width}
      className="DocTypeWidget_Container"
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
                <StyledPopup
                  open={open}
                  onClose={() => setOpen(false)}
                  onOpen={() => setOpen(true)}
                  on="click"
                  position="top right"
                  style={{ padding: "0px" }}
                  trigger={
                    <Button
                      style={{
                        width: "2.25vw",
                        height: "2.25vw",
                        minWidth: "40px",
                        minHeight: "40px",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "transparent",
                        border: "none",
                        boxShadow: "none",
                      }}
                      className="add-doc-type-button"
                      icon={
                        <Icon
                          name="plus"
                          style={{
                            margin: 0,
                            fontSize: "1.2em",
                            color: "white",
                          }}
                        />
                      }
                      circular
                    />
                  }
                >
                  <DocTypePopup
                    labels={filtered_doc_label_choices}
                    onAdd={onAdd}
                  />
                </StyledPopup>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div
        id="DocTypeWidget_ContentFlexContainer"
        className="DocTypeWidget_ContentFlexContainer"
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
          <Divider horizontal>
            <Header as="h5">
              ({annotation_elements.length}) Doc Type
              {annotation_elements.length > 1 ? "(s)" : ""}
            </Header>
          </Divider>
        </Segment>
        <Segment
          inverted
          secondary
          className={`${expanded ? " expanded_labels" : " collapsed_labels"} ${
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
        {annotation_elements.length > 1 && (
          <div
            className={
              hovered ? "hovered_expand_button" : "not_hovered_expand_button"
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
                  style={{
                    transition: "all 0.2s ease",
                    transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                    color: expanded ? "#00b09b" : "#495057",
                  }}
                  onClick={() => setExpanded(!expanded)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </DocTypeWidgetContainer>
  );
};

const DocTypeWidgetContainer = styled.div<HideableHasWidth>`
  position: fixed;
  z-index: 1002;
  top: 8vh;
  right: 16px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  transform: translateZ(0);
  -webkit-font-smoothing: antialiased;
  pointer-events: none;

  & > * {
    pointer-events: auto;
  }
`;

const CardGroupScrollContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  height: 100% !important;
  padding: 4px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background-color: rgba(155, 155, 155, 0.5);
    border-radius: 20px;
    border: transparent;
  }

  scrollbar-width: thin;
  scrollbar-color: rgba(155, 155, 155, 0.5) transparent;
`;
