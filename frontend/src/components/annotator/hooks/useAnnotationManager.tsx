import { useMutation } from "@apollo/client";
import { useState, useCallback } from "react";
import { toast } from "react-toastify";
import {
  REQUEST_ADD_ANNOTATION,
  REQUEST_DELETE_ANNOTATION,
  REQUEST_UPDATE_ANNOTATION,
  REQUEST_ADD_DOC_TYPE_ANNOTATION,
  NewDocTypeAnnotationInputType,
  NewDocTypeAnnotationOutputType,
  REQUEST_CREATE_RELATIONSHIP,
  REQUEST_REMOVE_RELATIONSHIPS,
  NewRelationshipInputType,
  NewRelationshipOutputType,
  RemoveRelationshipsInputType,
  RemoveRelationshipsOutputType,
  NewAnnotationInputType,
  NewAnnotationOutputType,
  RemoveAnnotationInputType,
  RemoveAnnotationOutputType,
  UpdateAnnotationInputType,
  UpdateAnnotationOutputType,
  APPROVE_ANNOTATION,
  REJECT_ANNOTATION,
  ApproveAnnotationOutput,
  ApproveAnnotationInput,
  RejectAnnotationOutput,
  RejectAnnotationInput,
} from "../../../graphql/mutations";
import {
  PdfAnnotations,
  ServerTokenAnnotation,
  ServerSpanAnnotation,
  RelationGroup,
  DocTypeAnnotation,
  BoundingBox,
} from "../types/annotations";
import { useDocumentContext } from "../context/DocumentContext";
import { useCorpusContext } from "../context/CorpusContext";
import { LabelType } from "../types/enums";
import { getPermissions } from "../../../utils/transform";

export function useAnnotationManager() {
  const { selectedDocument } = useDocumentContext();
  const { selectedCorpus } = useCorpusContext();

  const [pdfAnnotations, setPdfAnnotations] = useState<PdfAnnotations>(
    new PdfAnnotations([], [], [])
  );
  const [pageSelectionQueue, setPageSelectionQueue] = useState<
    Record<number, BoundingBox[]>
  >({});

  // GraphQL Mutations
  const [createAnnotation] = useMutation<
    NewAnnotationOutputType,
    NewAnnotationInputType
  >(REQUEST_ADD_ANNOTATION);
  const [deleteAnnotation] = useMutation<
    RemoveAnnotationOutputType,
    RemoveAnnotationInputType
  >(REQUEST_DELETE_ANNOTATION);
  const [updateAnnotation] = useMutation<
    UpdateAnnotationOutputType,
    UpdateAnnotationInputType
  >(REQUEST_UPDATE_ANNOTATION);

  // Add new mutations
  const [approveAnnotationMutation] = useMutation<
    ApproveAnnotationOutput,
    ApproveAnnotationInput
  >(APPROVE_ANNOTATION);
  const [rejectAnnotationMutation] = useMutation<
    RejectAnnotationOutput,
    RejectAnnotationInput
  >(REJECT_ANNOTATION);

  const [createDocTypeAnnotation] = useMutation<
    NewDocTypeAnnotationOutputType,
    NewDocTypeAnnotationInputType
  >(REQUEST_ADD_DOC_TYPE_ANNOTATION);

  const [createRelation] = useMutation<
    NewRelationshipOutputType,
    NewRelationshipInputType
  >(REQUEST_CREATE_RELATIONSHIP);

  const [deleteRelations] = useMutation<
    RemoveRelationshipsOutputType,
    RemoveRelationshipsInputType
  >(REQUEST_REMOVE_RELATIONSHIPS);

  const handleCreateAnnotation = useCallback(
    async (annotation: ServerTokenAnnotation | ServerSpanAnnotation) => {
      if (!selectedCorpus) {
        toast.warning("No corpus selected");
        return;
      }

      try {
        const { data } = await createAnnotation({
          variables: {
            json: annotation.json,
            corpusId: selectedCorpus.id,
            documentId: selectedDocument.id,
            annotationLabelId: annotation.annotationLabel.id,
            rawText: annotation.rawText,
            page: annotation.page,
            annotationType:
              annotation instanceof ServerSpanAnnotation
                ? LabelType.SpanLabel
                : LabelType.TokenLabel,
          },
        });

        if (data?.addAnnotation?.annotation) {
          toast.success("Annotation created successfully");
          setPdfAnnotations(
            (prev) =>
              new PdfAnnotations(
                [...prev.annotations, annotation],
                prev.relations,
                prev.docTypes,
                true
              )
          );
        }
      } catch (error) {
        toast.error("Failed to create annotation");
        console.error(error);
      }
    },
    [selectedCorpus, selectedDocument, createAnnotation]
  );

  const handleDeleteAnnotation = useCallback(
    async (annotationId: string) => {
      try {
        await deleteAnnotation({
          variables: { annotationId },
        });

        setPdfAnnotations(
          (prev) =>
            new PdfAnnotations(
              prev.annotations.filter((a) => a.id !== annotationId),
              prev.relations,
              prev.docTypes,
              true
            )
        );
        toast.success("Annotation deleted successfully");
      } catch (error) {
        toast.error("Failed to delete annotation");
        console.error(error);
      }
    },
    [deleteAnnotation]
  );

  const handleUpdateAnnotation = useCallback(
    async (updatedAnnotation: ServerTokenAnnotation | ServerSpanAnnotation) => {
      try {
        await updateAnnotation({
          variables: {
            id: updatedAnnotation.id,
            json: updatedAnnotation.json,
            rawText: updatedAnnotation.rawText,
            annotationLabel: updatedAnnotation.annotationLabel.id,
          },
        });

        setPdfAnnotations(
          (prev) =>
            new PdfAnnotations(
              prev.annotations.map((a) =>
                a.id === updatedAnnotation.id ? updatedAnnotation : a
              ),
              prev.relations,
              prev.docTypes,
              true
            )
        );
        toast.success("Annotation updated successfully");
      } catch (error) {
        toast.error("Failed to update annotation");
        console.error(error);
      }
    },
    [updateAnnotation]
  );

  const createMultiPageAnnotation = useCallback(() => {
    // Implementation of multi-page annotation creation
    // This would need to coordinate with the page selection queue
    // and create annotations across multiple pages
    // Original implementation details needed here
  }, [pageSelectionQueue, selectedCorpus, selectedDocument]);

  const handleManageRelations = useCallback(() => {
    // Implement relation management logic
    // This would handle creating and deleting relations between annotations
  }, []);

  // Add approve/reject handlers
  const handleApproveAnnotation = useCallback(
    async (annotationId: string, comment?: string) => {
      try {
        const { data } = await approveAnnotationMutation({
          variables: { annotationId, comment },
        });

        if (data?.approveAnnotation?.ok) {
          setPdfAnnotations((prev) => {
            const updatedAnnotations = prev.annotations.map((a) => {
              if (a.id === annotationId) {
                return a.update({
                  approved: true,
                  rejected: false,
                });
              }
              return a;
            });
            return new PdfAnnotations(
              updatedAnnotations,
              prev.relations,
              prev.docTypes,
              true
            );
          });
          toast.success("Annotation approved successfully");
        }
      } catch (error) {
        console.error("Error approving annotation:", error);
        toast.error("Failed to approve annotation");
      }
    },
    [approveAnnotationMutation]
  );

  const handleRejectAnnotation = useCallback(
    async (annotationId: string, comment?: string) => {
      try {
        const { data } = await rejectAnnotationMutation({
          variables: { annotationId, comment },
        });

        if (data?.rejectAnnotation?.ok) {
          setPdfAnnotations((prev) => {
            const updatedAnnotations = prev.annotations.map((a) => {
              if (a.id === annotationId) {
                return a.update({
                  approved: false,
                  rejected: true,
                });
              }
              return a;
            });
            return new PdfAnnotations(
              updatedAnnotations,
              prev.relations,
              prev.docTypes,
              true
            );
          });
          toast.success("Annotation rejected successfully");
        }
      } catch (error) {
        console.error("Error rejecting annotation:", error);
        toast.error("Failed to reject annotation");
      }
    },
    [rejectAnnotationMutation]
  );

  const handleCreateDocTypeAnnotation = useCallback(
    async (docType: DocTypeAnnotation) => {
      if (!selectedCorpus) {
        toast.warning("No corpus selected");
        return;
      }

      try {
        const { data } = await createDocTypeAnnotation({
          variables: {
            documentId: selectedDocument.id,
            corpusId: selectedCorpus.id,
            annotationLabelId: docType.annotationLabel.id,
          },
        });

        if (data?.addDocTypeAnnotation?.annotation) {
          const obj = data.addDocTypeAnnotation.annotation;
          const newDocType = new DocTypeAnnotation(
            obj.annotationLabel,
            getPermissions(obj.myPermissions),
            obj.id
          );
          setPdfAnnotations(
            (prev) =>
              new PdfAnnotations(
                prev.annotations,
                prev.relations,
                [...prev.docTypes, newDocType],
                true
              )
          );
          toast.success("Document type label added successfully");
        }
      } catch (error) {
        toast.error("Failed to add document type label");
        console.error(error);
      }
    },
    [selectedCorpus, selectedDocument, createDocTypeAnnotation]
  );

  const handleCreateRelation = useCallback(
    async (relation: RelationGroup) => {
      if (!selectedCorpus) {
        toast.warning("No corpus selected");
        return;
      }

      try {
        const { data } = await createRelation({
          variables: {
            sourceIds: relation.sourceIds,
            targetIds: relation.targetIds,
            relationshipLabelId: relation.label.id,
            corpusId: selectedCorpus.id,
            documentId: selectedDocument.id,
          },
        });

        if (data?.addRelationship?.relationship) {
          const obj = data.addRelationship.relationship;
          const newRelation = new RelationGroup(
            obj.sourceAnnotations.edges.map((edge) => edge.node.id),
            obj.targetAnnotations.edges.map((edge) => edge.node.id),
            obj.relationshipLabel,
            obj.id
          );
          setPdfAnnotations(
            (prev) =>
              new PdfAnnotations(
                prev.annotations,
                [...prev.relations, newRelation],
                prev.docTypes,
                true
              )
          );
          toast.success("Relationship created successfully");
        }
      } catch (error) {
        toast.error("Failed to create relationship");
        console.error(error);
      }
    },
    [selectedCorpus, selectedDocument, createRelation]
  );

  const handleDeleteRelations = useCallback(
    async (relationships: RelationGroup[]) => {
      try {
        await deleteRelations({
          variables: {
            relationshipIds: relationships.map((r) => r.id),
          },
        });

        setPdfAnnotations(
          (prev) =>
            new PdfAnnotations(
              prev.annotations,
              prev.relations.filter(
                (r) => !relationships.map((rel) => rel.id).includes(r.id)
              ),
              prev.docTypes,
              true
            )
        );
        toast.success("Relations removed successfully");
      } catch (error) {
        toast.error("Failed to remove relations");
        console.error(error);
      }
    },
    [deleteRelations]
  );

  return {
    annotations: pdfAnnotations,
    pageSelectionQueue,
    createDocTypeAnnotation: handleCreateDocTypeAnnotation,
    createRelation: handleCreateRelation,
    deleteRelations: handleDeleteRelations,
    approveAnnotation: handleApproveAnnotation,
    rejectAnnotation: handleRejectAnnotation,
    createAnnotation: handleCreateAnnotation,
    deleteAnnotation: handleDeleteAnnotation,
    updateAnnotation: handleUpdateAnnotation,
    createMultiPageAnnotation,
    setPageSelectionQueue,
    manageRelations: handleManageRelations,
  };
}
