import { Icon, Label, Button, Popup } from "semantic-ui-react";

import styled from "styled-components";

import { HorizontallyJustifiedDiv } from "./common";
import _ from "lodash";
import { AnnotationStore, RelationGroup, ServerAnnotation } from "../context";

import "./AnnotatorSidebar.css";
import { useContext } from "react";
import { getPermissions } from "../../../utils/transform";
import { PermissionTypes } from "../../types";

interface HasColor {
  color: string;
}

export const HighlightContainer = styled.div<HasColor>(
  ({ theme, color }) => `
    border: 2px solid ${color};
    user-select: none;
    -ms-user-select: none;
    -moz-user-select: none;
    -webkit-user-select: none;
    padding: 1.00rem;
`
);

export const HighlightItem = ({
  annotation,
  className,
  read_only,
  relations,
  onDelete,
  onSelect,
}: {
  annotation: ServerAnnotation;
  className?: string;
  read_only: boolean;
  relations: RelationGroup[];
  onDelete?: (annotationId: string) => void;
  onSelect: (annotationId: string) => void;
}) => {
  const annotationStore = useContext(AnnotationStore);
  const selected = annotationStore.selectedAnnotations.includes(annotation.id);

  // if (selected)
  //   console.log("Selected!", annotation);

  let my_output_relationships = relations.filter((relation) =>
    relation.sourceIds.includes(annotation.id)
  );
  let my_input_relationships = relations.filter((relation) =>
    relation.targetIds.includes(annotation.id)
  );

  let prepared_className = "sidebar__annotation";
  if (className) {
    prepared_className =
      prepared_className + ` sidebar__annotation_${className}`;
  }

  // console.log("Highlight item", annotation);

  return (
    <HighlightContainer
      color={
        annotation?.annotationLabel?.color
          ? annotation.annotationLabel.color
          : "gray"
      }
      key={annotation.id}
      className={prepared_className}
      onClick={() => {
        console.log("Highlight", annotation.id);
        annotationStore.selectionElementRefs?.current[
          annotation.id
        ]?.scrollIntoView();
        onSelect(annotation.id);
      }}
      style={{
        background: selected ? "green" : "none",
      }}
    >
      <div>
        <div>
          <Label
            style={{
              display: "inline-block",
              margin: "0.25rem 0.25rem 0.25rem 0",
              color: annotation.annotationLabel.color || "grey",
            }}
          >
            {annotation.annotationLabel.icon && (
              <Icon name={annotation.annotationLabel.icon} />
            )}
            <strong>{annotation.annotationLabel.text}</strong>
          </Label>
          {!read_only &&
          annotation.myPermissions.includes(PermissionTypes.CAN_REMOVE) &&
          onDelete ? (
            <Button
              circular
              icon="trash"
              size="mini"
              floated="right"
              color="red"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(annotation.id);
              }}
            />
          ) : (
            <></>
          )}
          {annotation?.rawText ? (
            <Popup
              content={annotation.rawText}
              trigger={
                <blockquote style={{ marginTop: "0.5rem" }}>
                  {`${annotation.rawText.slice(0, 90).trim()}…`}
                </blockquote>
              }
            />
          ) : null}
        </div>
        <HorizontallyJustifiedDiv>
          {my_output_relationships.length > 0 ? (
            <Label pointing="right">
              Points To {my_output_relationships.length}
            </Label>
          ) : (
            <></>
          )}
          {my_input_relationships.length > 0 ? (
            <Label color="green" pointing="left">
              {my_input_relationships.length} Referencing
            </Label>
          ) : (
            <></>
          )}
          <div className="highlight__location">Page {annotation.page}</div>
        </HorizontallyJustifiedDiv>
      </div>
    </HighlightContainer>
  );
};
