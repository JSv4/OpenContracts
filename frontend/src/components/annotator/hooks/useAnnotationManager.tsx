import { useMutation } from "@apollo/client";
import { useState, useCallback, useEffect } from "react";
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
  REQUEST_REMOVE_RELATIONSHIP,
  REQUEST_UPDATE_RELATIONS,
  NewRelationshipInputType,
  NewRelationshipOutputType,
  RemoveRelationshipInputType,
  RemoveRelationshipOutputType,
  RemoveRelationshipsInputType,
  RemoveRelationshipsOutputType,
  UpdateRelationInputType,
  UpdateRelationOutputType,
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
} from "../types/annotations";
import { useDocumentContext } from "../context/DocumentContext";
import { useCorpusContext } from "../context/CorpusContext";
import { LabelType } from "../types/enums";
import { getPermissions } from "../../../utils/transform";
import { SpanAnnotationJson } from "../../types";
import { useUISettings } from "./useUISettings";

/**
 * Custom hook to manage annotations, relations, and document type annotations.
 */
export function useAnnotationManager() {
  const { selectedDocument } = useDocumentContext();
  const { selectedCorpus } = useCorpusContext();

  const [pdfAnnotations, setPdfAnnotations] = useState<PdfAnnotations>(
    new PdfAnnotations([], [], [])
  );

  const { setQueryLoadingStates, setQueryErrors } = useUISettings();

  /**
   * State for structural annotations.
   */
  const [structuralAnnotations, setStructuralAnnotations] = useState<
    ServerTokenAnnotation[]
  >([]);

  /**
   * State for all annotation objects. - THIS IS DUPLICATIVE OF PdfAnnotations
   */
  const [annotationObjs, setAnnotationObjs] = useState<
    (ServerTokenAnnotation | ServerSpanAnnotation)[]
  >([]);

  /**
   * State for document type annotations.
   */
  const [docTypeAnnotations, setDocTypeAnnotations] = useState<
    DocTypeAnnotation[]
  >([]);

  // GraphQL Mutations
  const [
    createAnnotation,
    { loading: createAnnotationLoading, error: createAnnotationError },
  ] = useMutation<NewAnnotationOutputType, NewAnnotationInputType>(
    REQUEST_ADD_ANNOTATION
  );

  const [
    deleteAnnotationMutation,
    { loading: deleteAnnotationLoading, error: deleteAnnotationError },
  ] = useMutation<RemoveAnnotationOutputType, RemoveAnnotationInputType>(
    REQUEST_DELETE_ANNOTATION
  );

  const [updateAnnotation] = useMutation<
    UpdateAnnotationOutputType,
    UpdateAnnotationInputType
  >(REQUEST_UPDATE_ANNOTATION);

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

  const [deleteRelationMutation] = useMutation<
    RemoveRelationshipOutputType,
    RemoveRelationshipInputType
  >(REQUEST_REMOVE_RELATIONSHIP);

  const [deleteRelationsMutation] = useMutation<
    RemoveRelationshipsOutputType,
    RemoveRelationshipsInputType
  >(REQUEST_REMOVE_RELATIONSHIPS);

  const [updateRelationsMutation] = useMutation<
    UpdateRelationOutputType,
    UpdateRelationInputType
  >(REQUEST_UPDATE_RELATIONS);

  // Effects to update loading states
  useEffect(() => {
    setQueryLoadingStates((prev) => ({
      ...prev,
      annotations:
        createAnnotationLoading ||
        deleteAnnotationLoading ||
        // ... other loading states
        false,
    }));
  }, [
    setQueryLoadingStates,
    createAnnotationLoading,
    deleteAnnotationLoading,
    // ... other loading states
  ]);

  // Effects to update error states
  useEffect(() => {
    if (createAnnotationError || deleteAnnotationError /* || other errors */) {
      const errorMessage = "An error occurred while processing annotations";
      toast.error(errorMessage);
      console.error(
        errorMessage,
        createAnnotationError || deleteAnnotationError /* || other errors */
      );
    }
    setQueryErrors((prev) => ({
      ...prev,
      annotations:
        createAnnotationError ||
        deleteAnnotationError ||
        // ... other error states
        undefined,
    }));
  }, [
    setQueryErrors,
    createAnnotationError,
    deleteAnnotationError,
    // ... other error states
  ]);

  /**
   * Adds multiple annotations to the current PdfAnnotations state.
   *
   * @param annotations An array of annotations to add.
   */
  const addMultipleAnnotations = useCallback(
    (annotations: (ServerTokenAnnotation | ServerSpanAnnotation)[]) => {
      setPdfAnnotations((prev) => {
        return new PdfAnnotations(
          [...prev.annotations, ...annotations],
          prev.relations,
          prev.docTypes,
          true
        );
      });
    },
    []
  );

  /**
   * Replaces annotations in the current PdfAnnotations state.
   *
   * @param replacementAnnotations An array of annotations to replace.
   */
  const replaceAnnotations = useCallback(
    (
      replacementAnnotations: (ServerTokenAnnotation | ServerSpanAnnotation)[]
    ) => {
      setPdfAnnotations((prev) => {
        const updatedIds = replacementAnnotations.map((a) => a.id);
        const unchangedAnnotations = prev.annotations.filter(
          (a) => !updatedIds.includes(a.id)
        );
        return new PdfAnnotations(
          [...unchangedAnnotations, ...replacementAnnotations],
          prev.relations,
          prev.docTypes,
          true
        );
      });
    },
    []
  );

  /**
   * Replaces relations in the current PdfAnnotations state.
   *
   * @param replacementRelations An array of relations to replace.
   * @param relationsToRemove    An array of relations to remove.
   */
  const replaceRelations = useCallback(
    (
      replacementRelations: RelationGroup[],
      relationsToRemove: RelationGroup[] = []
    ) => {
      setPdfAnnotations((prev) => {
        const updatedIds = replacementRelations.map((r) => r.id);
        const removedIds = relationsToRemove.map((r) => r.id);
        const relations = prev.relations.filter(
          (r) => !updatedIds.includes(r.id) && !removedIds.includes(r.id)
        );
        return new PdfAnnotations(
          prev.annotations,
          [...relations, ...replacementRelations],
          prev.docTypes,
          true
        );
      });
    },
    []
  );

  /**
   * Calculates the updates needed for relations when an annotation is removed.
   *
   * @param annotationId The ID of the annotation being removed.
   * @returns An object containing relations to delete and update.
   */
  const calcRelationsChangeByAnnotationDeletion = useCallback(
    (
      annotationId: string
    ): {
      relationsToDelete: RelationGroup[];
      relationsToUpdate: RelationGroup[];
    } => {
      const implicatedRelations = pdfAnnotations.relations.filter(
        (relation) =>
          relation.sourceIds.includes(annotationId) ||
          relation.targetIds.includes(annotationId)
      );

      const relationsToDelete = implicatedRelations.filter((relation) => {
        const newSourceIds = relation.sourceIds.filter(
          (id) => id !== annotationId
        );
        const newTargetIds = relation.targetIds.filter(
          (id) => id !== annotationId
        );
        return newSourceIds.length === 0 || newTargetIds.length === 0;
      });

      const relationsToUpdate = implicatedRelations
        .filter(
          (relation) =>
            !relationsToDelete.map((r) => r.id).includes(relation.id)
        )
        .map((relation) => {
          const newSourceIds = relation.sourceIds.filter(
            (id) => id !== annotationId
          );
          const newTargetIds = relation.targetIds.filter(
            (id) => id !== annotationId
          );
          return new RelationGroup(
            newSourceIds,
            newTargetIds,
            relation.label,
            relation.id
          );
        });

      return {
        relationsToDelete,
        relationsToUpdate,
      };
    },
    [pdfAnnotations.relations]
  );

  /**
   * Handles creating a new annotation.
   *
   * @param annotation The annotation to create.
   */
  const handleCreateAnnotation = useCallback(
    async (annotation: ServerTokenAnnotation | ServerSpanAnnotation) => {
      if (!selectedCorpus || !selectedDocument) {
        toast.warning("No corpus or document selected");
        return;
      }

      // Validation for empty annotations
      if (!annotation.rawText || annotation.rawText.trim().length === 0) {
        return;
      }

      try {
        const { data } = await createAnnotation({
          variables: {
            json: annotation.json,
            documentId: selectedDocument.id,
            corpusId: selectedCorpus.id,
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
          const createdAnnotationData = data.addAnnotation.annotation;
          let newAnnotation: ServerTokenAnnotation | ServerSpanAnnotation;

          if (selectedDocument.fileType === "application/txt") {
            newAnnotation = new ServerSpanAnnotation(
              createdAnnotationData.page,
              createdAnnotationData.annotationLabel,
              createdAnnotationData.rawText,
              false,
              createdAnnotationData.json as SpanAnnotationJson,
              getPermissions(createdAnnotationData.myPermissions || []),
              false,
              false,
              false,
              createdAnnotationData.id
            );
          } else {
            newAnnotation = new ServerTokenAnnotation(
              createdAnnotationData.page,
              createdAnnotationData.annotationLabel,
              createdAnnotationData.rawText,
              false,
              createdAnnotationData.json,
              getPermissions(createdAnnotationData.myPermissions || []),
              false,
              false,
              false,
              createdAnnotationData.id
            );
          }
          addMultipleAnnotations([newAnnotation]);
          toast.success("Added your annotation to the database.");
        }
      } catch (error) {
        toast.error(`Unable to add annotation: ${error}`);
        console.error(error);
      }
    },
    [selectedCorpus, selectedDocument, createAnnotation, addMultipleAnnotations]
  );

  /**
   * Handles deleting an annotation.
   *
   * @param annotationId The ID of the annotation to delete.
   */
  const handleDeleteAnnotation = useCallback(
    async (annotationId: string) => {
      if (!selectedCorpus || !selectedDocument) {
        toast.warning("No corpus or document selected");
        return;
      }

      const { relationsToDelete, relationsToUpdate } =
        calcRelationsChangeByAnnotationDeletion(annotationId);

      const deletionPromises: Promise<any>[] = [
        deleteAnnotationMutation({
          variables: { annotationId },
        }),
      ];

      if (relationsToDelete.length > 0) {
        deletionPromises.push(
          deleteRelationsMutation({
            variables: {
              relationshipIds: relationsToDelete.map((r) => r.id),
            },
          })
        );
      }

      if (relationsToUpdate.length > 0) {
        deletionPromises.push(
          updateRelationsMutation({
            variables: {
              relationships: relationsToUpdate.map((relation) => ({
                id: relation.id,
                sourceIds: relation.sourceIds,
                targetIds: relation.targetIds,
                relationshipLabelId: relation.label.id,
                corpusId: selectedCorpus.id,
                documentId: selectedDocument.id,
              })),
            },
          })
        );
      }

      try {
        await Promise.all(deletionPromises);

        setPdfAnnotations((prev) => {
          const updatedAnnotations = prev.annotations.filter(
            (a) => a.id !== annotationId
          );
          const updatedRelations = prev.relations.filter(
            (r) => !relationsToDelete.map((rel) => rel.id).includes(r.id)
          );
          return new PdfAnnotations(
            updatedAnnotations,
            updatedRelations,
            prev.docTypes,
            true
          );
        });

        toast.success("Annotation and related relations deleted successfully");
      } catch (error) {
        toast.error("Failed to delete annotation");
        console.error(error);
      }
    },
    [
      selectedCorpus,
      selectedDocument,
      deleteAnnotationMutation,
      deleteRelationsMutation,
      updateRelationsMutation,
      calcRelationsChangeByAnnotationDeletion,
    ]
  );

  /**
   * Handles updating an annotation.
   *
   * @param updatedAnnotation The updated annotation object.
   */
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

        replaceAnnotations([updatedAnnotation]);

        toast.success("Annotation updated successfully");
      } catch (error) {
        toast.error("Failed to update annotation");
        console.error(error);
      }
    },
    [updateAnnotation, replaceAnnotations]
  );

  /**
   * Handles approving an annotation.
   *
   * @param annotationId The ID of the annotation to approve.
   * @param comment        Optional comment for the approval.
   */
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

  /**
   * Handles rejecting an annotation.
   *
   * @param annotationId The ID of the annotation to reject.
   * @param comment      Optional comment for the rejection.
   */
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

  /**
   * Handles creating a document type annotation.
   *
   * @param docType The document type annotation to create.
   */
  const handleCreateDocTypeAnnotation = useCallback(
    async (docType: DocTypeAnnotation) => {
      if (!selectedCorpus || !selectedDocument) {
        toast.warning("No corpus or document selected");
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
            getPermissions(obj.myPermissions || []),
            obj.id
          );
          setPdfAnnotations((prev) => {
            return new PdfAnnotations(
              prev.annotations,
              prev.relations,
              [...prev.docTypes, newDocType],
              true
            );
          });
          toast.success("Document type label added successfully");
        }
      } catch (error) {
        toast.error("Failed to add document type label");
        console.error(error);
      }
    },
    [selectedCorpus, selectedDocument, createDocTypeAnnotation]
  );

  /**
   * Handles deleting a document type annotation.
   *
   * @param annotationId The ID of the document type annotation to delete.
   */
  const handleDeleteDocTypeAnnotation = useCallback(
    async (annotationId: string) => {
      if (!selectedCorpus || !selectedDocument) {
        toast.warning("No corpus or document selected");
        return;
      }

      try {
        await deleteAnnotationMutation({
          variables: {
            annotationId,
          },
        });

        setPdfAnnotations((prev) => {
          const updatedDocTypes = prev.docTypes.filter(
            (dt) => dt.id !== annotationId
          );
          return new PdfAnnotations(
            prev.annotations,
            prev.relations,
            updatedDocTypes,
            true
          );
        });

        toast.success("Document type label deleted successfully");
      } catch (error) {
        toast.error("Failed to delete document type label");
        console.error(error);
      }
    },
    [selectedCorpus, selectedDocument, deleteAnnotationMutation]
  );

  /**
   * Handles creating a new relation.
   *
   * @param relation The relation to create.
   */
  const handleCreateRelation = useCallback(
    async (relation: RelationGroup) => {
      if (!selectedCorpus || !selectedDocument) {
        toast.warning("No corpus or document selected");
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
            obj.sourceAnnotations.edges.map((edge: any) => edge.node.id),
            obj.targetAnnotations.edges.map((edge: any) => edge.node.id),
            obj.relationshipLabel,
            obj.id
          );
          setPdfAnnotations((prev) => {
            return new PdfAnnotations(
              prev.annotations,
              [...prev.relations, newRelation],
              prev.docTypes,
              true
            );
          });
          toast.success("Relationship created successfully");
        }
      } catch (error) {
        toast.error("Failed to create relationship");
        console.error(error);
      }
    },
    [selectedCorpus, selectedDocument, createRelation]
  );

  /**
   * Handles deleting a relation.
   *
   * @param relationshipId The ID of the relation to delete.
   */
  const handleDeleteRelation = useCallback(
    async (relationshipId: string) => {
      try {
        await deleteRelationMutation({
          variables: {
            relationshipId,
          },
        });

        setPdfAnnotations((prev) => {
          const updatedRelations = prev.relations.filter(
            (r) => r.id !== relationshipId
          );
          return new PdfAnnotations(
            prev.annotations,
            updatedRelations,
            prev.docTypes,
            true
          );
        });

        toast.success("Relation deleted successfully");
      } catch (error) {
        toast.error("Failed to delete relation");
        console.error(error);
      }
    },
    [deleteRelationMutation]
  );

  /**
   * Sets the structural annotations.
   *
   * @param annotations An array of structural annotations.
   */
  const handleSetStructuralAnnotations = useCallback(
    (annotations: ServerTokenAnnotation[]) => {
      setStructuralAnnotations(annotations);
    },
    []
  );

  /**
   * Sets the annotation objects.
   *
   * @param annotations An array of annotation objects.
   */
  const handleSetAnnotationObjs = useCallback(
    (annotations: (ServerTokenAnnotation | ServerSpanAnnotation)[]) => {
      setAnnotationObjs(annotations);

      // Update pdfAnnotations with new annotations
      setPdfAnnotations((prev) => {
        return new PdfAnnotations(
          annotations,
          prev.relations,
          prev.docTypes,
          true
        );
      });
    },
    []
  );

  /**
   * Sets the document type annotations.
   *
   * @param annotations An array of document type annotations.
   */
  const handleSetDocTypeAnnotations = useCallback(
    (annotations: DocTypeAnnotation[]) => {
      setDocTypeAnnotations(annotations);

      // Update pdfAnnotations with new document types
      setPdfAnnotations((prev) => {
        return new PdfAnnotations(
          prev.annotations,
          prev.relations,
          annotations,
          true
        );
      });
    },
    []
  );

  return {
    annotations: pdfAnnotations,
    createAnnotation: handleCreateAnnotation,
    deleteAnnotation: handleDeleteAnnotation,
    updateAnnotation: handleUpdateAnnotation,
    approveAnnotation: handleApproveAnnotation,
    rejectAnnotation: handleRejectAnnotation,
    createDocTypeAnnotation: handleCreateDocTypeAnnotation,
    deleteDocTypeAnnotation: handleDeleteDocTypeAnnotation,
    createRelation: handleCreateRelation,
    deleteRelation: handleDeleteRelation,
    pdfAnnotations,
    setPdfAnnotations,
    addMultipleAnnotations,
    replaceAnnotations,
    replaceRelations,
    structuralAnnotations,
    setStructuralAnnotations: handleSetStructuralAnnotations,
    annotationObjs,
    setAnnotationObjs: handleSetAnnotationObjs,
    docTypeAnnotations,
    setDocTypeAnnotations: handleSetDocTypeAnnotations,
  };
}
