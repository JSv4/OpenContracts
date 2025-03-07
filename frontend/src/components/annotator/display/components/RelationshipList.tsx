import { Card } from "semantic-ui-react";

import { RelationItem } from "../../sidebar/RelationItem";

import "../../sidebar/AnnotatorSidebar.css";
import { PlaceholderCard } from "../../../placeholders/PlaceholderCard";
import { RelationGroup } from "../../types/annotations";
import { useAnnotationRefs } from "../../hooks/useAnnotationRefs";
import { useAnnotationSelection } from "../../context/UISettingsAtom";
import {
  usePdfAnnotations,
  useRemoveAnnotationFromRelationship,
  useRemoveRelationship,
} from "../../hooks/AnnotationHooks";
import _ from "lodash";

export const RelationshipList = ({ read_only }: { read_only: boolean }) => {
  const handleRemoveRelationship = useRemoveRelationship();
  const removeAnnotationFromRelation = useRemoveAnnotationFromRelationship();
  const {
    selectedAnnotations,
    selectedRelations,
    setSelectedAnnotations,
    setSelectedRelations,
  } = useAnnotationSelection();

  const { annotationElementRefs } = useAnnotationRefs();
  const { pdfAnnotations } = usePdfAnnotations();
  const annotations = pdfAnnotations.annotations;
  const relations = pdfAnnotations.relations;

  // If we have search results pane open... set index to last index
  const onRemoveAnnotationFromRelation = (
    annotationId: string,
    relationId: string
  ) => {
    removeAnnotationFromRelation(annotationId, relationId);
  };

  const onDeleteRelation = (relationId: string) => {
    handleRemoveRelationship(relationId);
  };

  const toggleSelectedAnnotation = (toggledId: string) => {
    if (selectedAnnotations.includes(toggledId)) {
      setSelectedAnnotations(
        selectedAnnotations.filter((annotationId) => annotationId !== toggledId)
      );
    }
    // If the toggle is flipping us over to SELECTED
    else {
      let annotation = pdfAnnotations.annotations.filter(
        (annotation_obj) => annotation_obj.id === toggledId
      )[0];
      // Check the proposed id is actually in the annotation store
      if (annotation) {
        // If it is, and we have a reference to it in our annotation reference obj
        if (annotationElementRefs?.current[annotation.id]) {
          // Scroll annotation into view.
          annotationElementRefs?.current[annotation.id]?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }
      setSelectedAnnotations([toggledId]);
    }
  };

  const toggleSelectedRelation = (
    toggled_relation: RelationGroup,
    implicated_annotations: string[]
  ) => {
    if (_.find(selectedRelations, { id: toggled_relation.id })) {
      setSelectedRelations(
        selectedRelations.filter(
          (relation) => relation.id !== toggled_relation.id
        )
      );
      setSelectedAnnotations([]);
    } else {
      setSelectedRelations([toggled_relation]);
      setSelectedAnnotations(implicated_annotations);
    }
  };

  return (
    <Card.Group key="relationship_card_group">
      {relations && relations.length > 0 ? (
        relations.map((relation, index) => (
          <RelationItem
            key={`relation_item_${relation.id}`}
            relation={relation}
            read_only={read_only}
            selected={selectedRelations.includes(relation)}
            source_annotations={annotations.filter((a) =>
              relation.sourceIds.includes(a.id)
            )}
            target_annotations={annotations.filter((a) =>
              relation.targetIds.includes(a.id)
            )}
            onSelectAnnotation={toggleSelectedAnnotation}
            onSelectRelation={() =>
              toggleSelectedRelation(relation, [
                ...relation.sourceIds,
                ...relation.targetIds,
              ])
            }
            onRemoveAnnotationFromRelation={onRemoveAnnotationFromRelation}
            onDeleteRelation={onDeleteRelation}
          />
        ))
      ) : (
        <PlaceholderCard
          style={{ flex: 1 }}
          title="No Relations Found"
          description="Either no matching relations were created or you didn't create them yet."
        />
      )}
    </Card.Group>
  );
};
