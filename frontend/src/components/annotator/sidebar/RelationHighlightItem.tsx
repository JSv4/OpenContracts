import { List, Icon, Label, Button, Popup, Image } from "semantic-ui-react";
import styled from "styled-components";
import _ from "lodash";

import source_icon from "../../../assets/icons/noun-bow-and-arrow-559923.png";
import target_icon from "../../../assets/icons/noun-target-746597.png";

import { ServerTokenAnnotation } from "../context";

import "./AnnotatorSidebar.css";

interface HasColor {
  color: string;
}

export const RelationHighlightContainer = styled.div<HasColor>(
  ({ theme, color }) => `
    border: 2px solid ${color};
    border-bottom: 0px;
`
);

export const RelationHighlightItem = ({
  annotation,
  className,
  type,
  read_only,
  onRemoveAnnotationFromRelation,
  onSelect,
}: {
  annotation: ServerTokenAnnotation;
  className?: string;
  type: "SOURCE" | "TARGET";
  read_only: boolean;
  onRemoveAnnotationFromRelation?: (annotationId: string) => void;
  onSelect: (annotationId: string) => void;
}) => {
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
          <Popup
            content={annotation.rawText}
            trigger={
              <blockquote style={{ marginTop: "0.5rem" }}>
                {`${annotation.rawText.slice(0, 24).trim()}…`}
              </blockquote>
            }
          />
        ) : null}
      </List.Content>
    </List.Item>
  );
};
