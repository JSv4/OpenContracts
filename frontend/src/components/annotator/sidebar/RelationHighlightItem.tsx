import { List, Icon, Label, Button, Image } from "semantic-ui-react";
import styled from "styled-components";
import _ from "lodash";

// Restore standard imports
import source_icon from "../../../assets/icons/noun-bow-and-arrow-559923.png";
import target_icon from "../../../assets/icons/noun-target-746597.png";

import "./AnnotatorSidebar.css";
import { ServerTokenAnnotation } from "../types/annotations";
import { TruncatedText } from "../../widgets/data-display/TruncatedText";

interface HasColor {
  color: string;
}

export const RelationHighlightContainer = styled.div<HasColor>(
  ({ theme, color }) => `
    border: 2px solid ${color};
    border-bottom: 0px;
`
);

interface RelationHighlightItemProps {
  annotation: ServerTokenAnnotation;
  className?: string;
  type: "SOURCE" | "TARGET";
  read_only: boolean;
  onRemoveAnnotationFromRelation?: (annotationId: string) => void;
  onSelect: (annotationId: string) => void;
}

export const RelationHighlightItem = ({
  annotation,
  className,
  type,
  read_only,
  onRemoveAnnotationFromRelation,
  onSelect,
}: RelationHighlightItemProps) => {
  let prepared_className = "sidebar__relation__annotation";
  if (className) {
    prepared_className =
      prepared_className + ` sidebar__relation__annotation_${className}`;
  }

  return (
    <List.Item key={annotation.id} className={prepared_className}>
      {type === "SOURCE" ? (
        <Image avatar src={source_icon} />
      ) : (
        <Image avatar src={target_icon} />
      )}
      {!read_only && onRemoveAnnotationFromRelation ? (
        <Button
          circular
          inverted
          icon="remove"
          size="mini"
          floated="right"
          color="red"
          onClick={() => onRemoveAnnotationFromRelation(annotation.id)}
        />
      ) : (
        <></>
      )}
      <Label
        horizontal
        onClick={() => {
          onSelect(annotation.id);
        }}
        style={{
          color: annotation.annotationLabel.color
            ? annotation.annotationLabel.color
            : "grey",
        }}
      >
        {annotation.annotationLabel.icon ? (
          <Icon name={annotation.annotationLabel.icon} />
        ) : (
          <></>
        )}
        <strong>{annotation.annotationLabel.text}</strong>
        <Label.Detail>| Page {annotation.page}</Label.Detail>
      </Label>
      <List.Content>
        <List.Header></List.Header>
        {annotation?.rawText ? (
          <TruncatedText
            text={annotation.rawText}
            limit={100}
            style={{ marginTop: "0.5rem" }}
          />
        ) : null}
      </List.Content>
    </List.Item>
  );
};
