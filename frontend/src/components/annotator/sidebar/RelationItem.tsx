import { Label, Card, Divider, List } from "semantic-ui-react";

import _ from "lodash";
import { RelationGroup, ServerAnnotation } from "../context";

import "./AnnotatorSidebar.css";
import { RelationHighlightItem } from "./RelationHighlightItem";

export function RelationItem({
  relation,
  target_annotations,
  source_annotations,
  read_only,
  selected,
  onSelectAnnotation,
  onSelectRelation,
  onDeleteRelation,
  onRemoveAnnotationFromRelation,
}: {
  relation: RelationGroup;
  read_only: boolean;
  selected: boolean;
  target_annotations: ServerAnnotation[];
  source_annotations: ServerAnnotation[];
  onSelectRelation: () => void;
  onSelectAnnotation: (annotationId: string) => void;
  onDeleteRelation: (relationId: string) => void;
  onRemoveAnnotationFromRelation: (
    annotationId: string,
    relationId: string
  ) => void;
}) {
  let source_cards = source_annotations.map((source_annotation) => (
    <RelationHighlightItem
      key={`1_${source_annotation.id}`}
      type="SOURCE"
      annotation={source_annotation}
      onSelect={onSelectAnnotation}
      onRemoveAnnotationFromRelation={() =>
        onRemoveAnnotationFromRelation(source_annotation.id, relation.id)
      }
      read_only={read_only}
    />
  ));

  let target_cards = target_annotations.map((target_annotation) => (
    <RelationHighlightItem
      key={`2_${target_annotation.id}`}
      type="TARGET"
      annotation={target_annotation}
      onSelect={onSelectAnnotation}
      onRemoveAnnotationFromRelation={() =>
        onRemoveAnnotationFromRelation(target_annotation.id, relation.id)
      }
      read_only={read_only}
    />
  ));

  return (
    <Card
      style={{
        ...(selected ? { backgroundColor: "#e2ffdb" } : {}),
        userSelect: "none",
        MsUserSelect: "none",
        MozUserSelect: "none",
      }}
      fluid
      raised
      onClick={onSelectRelation}
    >
      <Label
        corner="right"
        icon="trash"
        color="red"
        onClick={() => onDeleteRelation(relation.id)}
      />
      <List
        style={{ marginTop: "0px", marginBottom: "0px" }}
        celled
        size="mini"
      >
        {source_cards}
      </List>
      <Divider horizontal>
        <strong>{relation.label.text}:</strong>
      </Divider>
      <List
        style={{ marginTop: "0px", marginBottom: "0px" }}
        celled
        size="mini"
      >
        {target_cards}
      </List>
    </Card>
  );
}
