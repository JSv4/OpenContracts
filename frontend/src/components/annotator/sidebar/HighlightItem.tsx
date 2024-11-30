import React from "react";
import { Label, Button, Popup, Icon } from "semantic-ui-react";
import styled from "styled-components";
import { Trash2, ArrowRight, ArrowLeft } from "lucide-react";
import { HorizontallyJustifiedDiv } from "./common";
import { useAnnotationRefs } from "../hooks/useAnnotationRefs";
import { useAnnotationSelection } from "../hooks/useAnnotationSelection";
import { ServerTokenAnnotation } from "../types/annotations";
import { PermissionTypes } from "../../types";

interface HighlightContainerProps {
  color?: string;
  selected?: boolean;
}

const HighlightContainer = styled.div<HighlightContainerProps>`
  border-left: 4px solid ${(props) => props.color || "gray"};
  background-color: ${(props) =>
    props.selected ? "rgba(46, 204, 113, 0.1)" : "white"};
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  padding: 1rem;
  margin-bottom: 1rem;
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    transform: translateY(-2px);
  }
`;

const AnnotationLabel = styled(Label)`
  &&& {
    background-color: #${(props) => props.color || "grey"};
    color: white;
    margin: 0 0.5rem 0.5rem 0;
    padding: 0.5em 0.8em;
    font-weight: 600;
    border-radius: 20px;
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
  }
`;

const DeleteButton = styled(Button)`
  &&& {
    padding: 0.5em;
    margin-left: 0.5rem;
    background-color: transparent;
    color: #e74c3c;
    &:hover {
      background-color: #e74c3c;
      color: white;
    }
  }
`;

const BlockQuote = styled.blockquote`
  margin: 0.5rem 0;
  padding: 0.5rem;
  background-color: #f8f8f8;
  border-left: 3px solid #ddd;
  font-style: italic;
  color: #555;
`;

const RelationshipLabel = styled(Label)`
  &&& {
    margin-top: 0.5rem;
    font-size: 0.8em;
    padding: 0.4em 0.8em;
    display: inline-flex;
    align-items: center;
    gap: 0.3em;
  }
`;

const LocationText = styled.div`
  font-size: 0.8em;
  color: #888;
  margin-top: 0.5rem;
`;

interface HighlightItemProps {
  annotation: ServerTokenAnnotation;
  className?: string;
  read_only: boolean;
  relations: Array<{ sourceIds: string[]; targetIds: string[] }>;
  onDelete?: (annotationId: string) => void;
  onSelect: (annotationId: string) => void;
}

export const HighlightItem: React.FC<HighlightItemProps> = ({
  annotation,
  className,
  read_only,
  relations,
  onDelete,
  onSelect,
}) => {
  const { selectedAnnotations, handleAnnotationSelect } =
    useAnnotationSelection();
  const { annotationElementRefs } = useAnnotationRefs();
  const selected = selectedAnnotations.includes(annotation.id);

  const my_output_relationships = relations.filter((relation) =>
    relation.sourceIds.includes(annotation.id)
  );
  const my_input_relationships = relations.filter((relation) =>
    relation.targetIds.includes(annotation.id)
  );
  return (
    <HighlightContainer
      color={annotation?.annotationLabel?.color}
      selected={selected}
      className={`sidebar__annotation ${className || ""}`}
      onClick={() => {
        annotationElementRefs.current[annotation.id]?.scrollIntoView();
        handleAnnotationSelect(annotation.id);
      }}
    >
      <div>
        <AnnotationLabel color={annotation.annotationLabel.color}>
          {annotation.annotationLabel.icon && (
            <Icon name={annotation.annotationLabel.icon} />
          )}
          {annotation.annotationLabel.text}
        </AnnotationLabel>
        {!read_only &&
          annotation.myPermissions.includes(PermissionTypes.CAN_REMOVE) &&
          onDelete && (
            <DeleteButton
              icon={<Trash2 size={16} />}
              size="mini"
              circular
              onClick={(e: { stopPropagation: () => void }) => {
                e.stopPropagation();
                onDelete(annotation.id);
              }}
            />
          )}
      </div>
      {annotation?.rawText && (
        <Popup
          content={annotation.rawText}
          trigger={
            <BlockQuote>{`${annotation.rawText.slice(0, 90)}…`}</BlockQuote>
          }
        />
      )}
      <HorizontallyJustifiedDiv>
        {my_output_relationships.length > 0 && (
          <RelationshipLabel pointing="right" basic color="blue">
            <ArrowRight size={14} />
            Points To {my_output_relationships.length}
          </RelationshipLabel>
        )}
        {my_input_relationships.length > 0 && (
          <RelationshipLabel pointing="left" basic color="green">
            <ArrowLeft size={14} />
            {my_input_relationships.length} Referencing
          </RelationshipLabel>
        )}
      </HorizontallyJustifiedDiv>
      <LocationText>Page {annotation.page}</LocationText>
    </HighlightContainer>
  );
};
