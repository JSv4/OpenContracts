import { useAtom, useAtomValue } from "jotai";
import { useCallback } from "react";
import { useMutation } from "@apollo/client";
import { toast } from "react-toastify";
import {
  REQUEST_ADD_ANNOTATION,
  REQUEST_DELETE_ANNOTATION,
  REQUEST_UPDATE_ANNOTATION,
  REQUEST_ADD_DOC_TYPE_ANNOTATION,
  REQUEST_CREATE_RELATIONSHIP,
  REQUEST_REMOVE_RELATIONSHIP,
  REQUEST_REMOVE_RELATIONSHIPS,
  REQUEST_UPDATE_RELATIONS,
  APPROVE_ANNOTATION,
  REJECT_ANNOTATION,
  NewAnnotationInputType,
  NewAnnotationOutputType,
  RemoveAnnotationInputType,
  RemoveAnnotationOutputType,
  UpdateAnnotationInputType,
  UpdateAnnotationOutputType,
  NewDocTypeAnnotationInputType,
  NewDocTypeAnnotationOutputType,
  NewRelationshipInputType,
  NewRelationshipOutputType,
  RemoveRelationshipInputType,
  RemoveRelationshipOutputType,
  RemoveRelationshipsInputType,
  RemoveRelationshipsOutputType,
  UpdateRelationInputType,
  UpdateRelationOutputType,
  ApproveAnnotationInput,
  ApproveAnnotationOutput,
  RejectAnnotationInput,
  RejectAnnotationOutput,
} from "../../../graphql/mutations";
import {
  PdfAnnotations,
  ServerTokenAnnotation,
  ServerSpanAnnotation,
  RelationGroup,
  DocTypeAnnotation,
} from "../types/annotations";
import {
  pdfAnnotationsAtom,
  structuralAnnotationsAtom,
  annotationObjsAtom,
  docTypeAnnotationsAtom,
  initialAnnotationsAtom,
} from "../context/AnnotationAtoms";
import { selectedDocumentAtom } from "../context/DocumentAtom";
import { LabelType } from "../types/enums";
import { getPermissions } from "../../../utils/transform";
import { SpanAnnotationJson } from "../../types";
import { AnnotationLabelType } from "../../../types/graphql-api";
import { useCorpusState } from "../context/CorpusAtom";

/**
 * Hook to manage PdfAnnotations state.
 */
export function usePdfAnnotations() {
  const [pdfAnnotations, setPdfAnnotations] = useAtom(pdfAnnotationsAtom);

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
    [setPdfAnnotations]
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
    [setPdfAnnotations]
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
    [setPdfAnnotations]
  );

  /**
   * Adds document type annotations to the current PdfAnnotations state.
   *
   * @param docTypeAnnotations An array of document type annotations to add.
   */
  const addDocTypeAnnotations = useCallback(
    (docTypeAnnotations: DocTypeAnnotation[]) => {
      setPdfAnnotations((prev) => {
        return new PdfAnnotations(
          prev.annotations,
          prev.relations,
          [...prev.docTypes, ...docTypeAnnotations],
          true
        );
      });
    },
    [setPdfAnnotations]
  );

  /**
   * Replaces document type annotations in the current PdfAnnotations state.
   *
   * @param replacementDocTypes An array of document type annotations to replace.
   */
  const replaceDocTypeAnnotations = useCallback(
    (replacementDocTypes: DocTypeAnnotation[]) => {
      setPdfAnnotations((prev) => {
        return new PdfAnnotations(
          prev.annotations,
          prev.relations,
          replacementDocTypes,
          true
        );
      });
    },
    [setPdfAnnotations]
  );

  return {
    pdfAnnotations,
    setPdfAnnotations,
    addMultipleAnnotations,
    replaceAnnotations,
    replaceRelations,
    addDocTypeAnnotations,
    replaceDocTypeAnnotations,
  };
}

/**
 * Hook to manage structural annotations.
 */
export function useStructuralAnnotations() {
  const [structuralAnnotations, setStructuralAnnotations] = useAtom(
    structuralAnnotationsAtom
  );
  return { structuralAnnotations, setStructuralAnnotations };
}

/**
 * Hook to manage all annotation objects.
 */
export function useAnnotationObjs() {
  const [annotationObjs, setAnnotationObjs] = useAtom(annotationObjsAtom);
  return { annotationObjs, setAnnotationObjs };
}

/**
 * Hook to manage document type annotations.
 */
export function useDocTypeAnnotations() {
  const [docTypeAnnotations, setDocTypeAnnotations] = useAtom(
    docTypeAnnotationsAtom
  );
  return { docTypeAnnotations, setDocTypeAnnotations };
}

/**
 * Hook to manage initial annotations.
 */
export function useInitialAnnotations() {
  const [initialAnnotations, setInitialAnnotations] = useAtom(
    initialAnnotationsAtom
  );
  return { initialAnnotations, setInitialAnnotations };
}

/**
 * Hook to create a new annotation.
 */
export function useCreateAnnotation() {
  const { addMultipleAnnotations } = usePdfAnnotations();
  const selectedDocument = useAtomValue(selectedDocumentAtom);
  const { selectedCorpus } = useCorpusState();

  const [createAnnotation] = useMutation<
    NewAnnotationOutputType,
    NewAnnotationInputType
  >(REQUEST_ADD_ANNOTATION);

  const handleCreateAnnotation = async (
    annotation: ServerTokenAnnotation | ServerSpanAnnotation
  ) => {
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

        if (selectedDocument.fileType?.startsWith("text/")) {
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
  };

  return handleCreateAnnotation;
}

/**
 * Hook to update an existing annotation.
 */
export function useUpdateAnnotation() {
  const { replaceAnnotations } = usePdfAnnotations();
  const selectedDocument = useAtomValue(selectedDocumentAtom);

  const [updateAnnotationMutation] = useMutation<
    UpdateAnnotationOutputType,
    UpdateAnnotationInputType
  >(REQUEST_UPDATE_ANNOTATION);

  const handleUpdateAnnotation = useCallback(
    async (annotation: ServerTokenAnnotation | ServerSpanAnnotation) => {
      if (!selectedDocument) {
        toast.warning("No document selected");
        return;
      }

      try {
        const { data } = await updateAnnotationMutation({
          variables: {
            id: annotation.id,
            json: annotation.json,
            rawText: annotation.rawText,
            page: annotation.page,
            annotationLabel: annotation.annotationLabel.id,
          },
        });

        if (data?.updateAnnotation?.ok) {
          let updatedAnnotation: ServerTokenAnnotation | ServerSpanAnnotation;

          if (selectedDocument.fileType === "application/txt") {
            updatedAnnotation = new ServerSpanAnnotation(
              annotation.page,
              annotation.annotationLabel,
              annotation.rawText,
              false,
              annotation.json as SpanAnnotationJson,
              getPermissions(annotation.myPermissions || []),
              false,
              false,
              false,
              annotation.id
            );
          } else {
            updatedAnnotation = new ServerTokenAnnotation(
              annotation.page,
              annotation.annotationLabel,
              annotation.rawText,
              false,
              annotation.json,
              getPermissions(annotation.myPermissions || []),
              false,
              false,
              false,
              annotation.id
            );
          }

          replaceAnnotations([updatedAnnotation]);
          toast.success("Updated the annotation in the database.");
        }
      } catch (error) {
        toast.error(`Unable to update annotation: ${error}`);
        console.error(error);
      }
    },
    [selectedDocument, updateAnnotationMutation, replaceAnnotations]
  );

  return handleUpdateAnnotation;
}

/**
 * Hook to delete an annotation.
 */
export function useDeleteAnnotation() {
  const { pdfAnnotations, setPdfAnnotations } = usePdfAnnotations();
  const selectedDocument = useAtomValue(selectedDocumentAtom);
  const { selectedCorpus } = useCorpusState();

  const [deleteAnnotationMutation] = useMutation<
    RemoveAnnotationOutputType,
    RemoveAnnotationInputType
  >(REQUEST_DELETE_ANNOTATION);

  const [deleteRelationsMutation] = useMutation<
    RemoveRelationshipsOutputType,
    RemoveRelationshipsInputType
  >(REQUEST_REMOVE_RELATIONSHIPS);

  const [updateRelationsMutation] = useMutation<
    UpdateRelationOutputType,
    UpdateRelationInputType
  >(REQUEST_UPDATE_RELATIONS);

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
      setPdfAnnotations,
    ]
  );

  return handleDeleteAnnotation;
}

/**
 * Hook to approve an annotation.
 */
export function useApproveAnnotation() {
  const { pdfAnnotations, setPdfAnnotations } = usePdfAnnotations();

  const [approveAnnotationMutation] = useMutation<
    ApproveAnnotationOutput,
    ApproveAnnotationInput
  >(APPROVE_ANNOTATION);

  /**
   * Approves an annotation by updating its approved status in the local state.
   *
   * @param annotationId - The ID of the annotation to approve.
   * @param comment - Optional comment to include with the approval.
   */
  const handleApproveAnnotation = useCallback(
    async (annotationId: string, comment?: string) => {
      try {
        const { data } = await approveAnnotationMutation({
          variables: { annotationId, comment },
        });

        if (data?.approveAnnotation?.ok) {
          // Update the local PdfAnnotations state
          setPdfAnnotations((prevState) => {
            const updatedAnnotations = prevState.annotations.map(
              (annotation) => {
                if (annotation.id === annotationId) {
                  return annotation.update({
                    approved: true,
                    rejected: false,
                  });
                }
                return annotation;
              }
            );
            return new PdfAnnotations(
              updatedAnnotations,
              prevState.relations,
              prevState.docTypes,
              true
            );
          });
          toast.success("Annotation approved successfully.");
        }
      } catch (error) {
        toast.error("Failed to approve annotation");
        console.error("Error approving annotation:", error);
      }
    },
    [approveAnnotationMutation, setPdfAnnotations]
  );

  return handleApproveAnnotation;
}

/**
 * Hook to reject an annotation.
 */
/**
 * Hook to reject an annotation.
 */
export function useRejectAnnotation() {
  const { setPdfAnnotations } = usePdfAnnotations();

  const [rejectAnnotationMutation] = useMutation<
    RejectAnnotationOutput,
    RejectAnnotationInput
  >(REJECT_ANNOTATION);

  /**
   * Rejects an annotation by updating its rejected status in the local state.
   *
   * @param annotationId - The ID of the annotation to reject.
   * @param comment - Optional comment to include with the rejection.
   */
  const handleRejectAnnotation = useCallback(
    async (annotationId: string, comment?: string) => {
      try {
        const { data } = await rejectAnnotationMutation({
          variables: { annotationId, comment },
        });

        if (data?.rejectAnnotation?.ok) {
          // Update the local PdfAnnotations state
          setPdfAnnotations((prevState) => {
            const updatedAnnotations = prevState.annotations.map(
              (annotation) => {
                if (annotation.id === annotationId) {
                  return annotation.update({
                    rejected: true,
                    approved: false,
                  });
                }
                return annotation;
              }
            );
            return new PdfAnnotations(
              updatedAnnotations,
              prevState.relations,
              prevState.docTypes,
              true
            );
          });
          toast.success("Annotation rejected successfully.");
        }
      } catch (error) {
        toast.error("Failed to reject annotation");
        console.error("Error rejecting annotation:", error);
      }
    },
    [rejectAnnotationMutation, setPdfAnnotations]
  );

  return handleRejectAnnotation;
}

/**
 * Hook to add a document type annotation.
 */
export function useAddDocTypeAnnotation() {
  const { addDocTypeAnnotations } = usePdfAnnotations();
  const selectedDocument = useAtomValue(selectedDocumentAtom);
  const { selectedCorpus } = useCorpusState();

  const [addDocTypeAnnotationMutation] = useMutation<
    NewDocTypeAnnotationOutputType,
    NewDocTypeAnnotationInputType
  >(REQUEST_ADD_DOC_TYPE_ANNOTATION);

  const handleAddDocTypeAnnotation = useCallback(
    async (docTypeLabel: AnnotationLabelType) => {
      if (!selectedDocument || !selectedCorpus) {
        toast.warning("No corpus or document selected");
        return;
      }

      try {
        const { data } = await addDocTypeAnnotationMutation({
          variables: {
            documentId: selectedDocument.id,
            corpusId: selectedCorpus.id,
            annotationLabelId: docTypeLabel.id,
          },
        });

        if (data?.addDocTypeAnnotation?.annotation) {
          const newDocTypeAnnotationData = data.addDocTypeAnnotation.annotation;

          const newDocTypeAnnotation = new DocTypeAnnotation(
            newDocTypeAnnotationData.annotationLabel,
            getPermissions(newDocTypeAnnotationData.myPermissions || []),
            newDocTypeAnnotationData.id
          );

          addDocTypeAnnotations([newDocTypeAnnotation]);
          toast.success("Document type annotation added successfully.");
        }
      } catch (error) {
        toast.error("Failed to add document type annotation");
        console.error(error);
      }
    },
    [
      selectedDocument,
      selectedCorpus,
      addDocTypeAnnotationMutation,
      addDocTypeAnnotations,
    ]
  );

  return handleAddDocTypeAnnotation;
}

/**
 * Hook to create a new relationship (relation).
 */
export function useCreateRelationship() {
  const { replaceRelations } = usePdfAnnotations();
  const selectedDocument = useAtomValue(selectedDocumentAtom);
  const { selectedCorpus } = useCorpusState();

  const [createRelationshipMutation] = useMutation<
    NewRelationshipOutputType,
    NewRelationshipInputType
  >(REQUEST_CREATE_RELATIONSHIP);

  const handleCreateRelationship = useCallback(
    async (relation: RelationGroup) => {
      if (!selectedCorpus || !selectedDocument) {
        toast.warning("No corpus or document selected");
        return;
      }

      try {
        const { data } = await createRelationshipMutation({
          variables: {
            sourceIds: relation.sourceIds,
            targetIds: relation.targetIds,
            relationshipLabelId: relation.label.id,
            corpusId: selectedCorpus.id,
            documentId: selectedDocument.id,
          },
        });

        if (data?.addRelationship?.relationship) {
          const newRelationData = data.addRelationship.relationship;

          const newRelation = new RelationGroup(
            newRelationData.sourceAnnotations.edges.map((edge) => edge.node.id),
            newRelationData.targetAnnotations.edges.map((edge) => edge.node.id),
            newRelationData.relationshipLabel,
            newRelationData.id
          );

          replaceRelations([newRelation]);
          toast.success("Relation added successfully.");
        }
      } catch (error) {
        toast.error("Failed to add relation");
        console.error(error);
      }
    },
    [
      selectedCorpus,
      selectedDocument,
      createRelationshipMutation,
      replaceRelations,
    ]
  );

  return handleCreateRelationship;
}

/**
 * Hook to remove a relationship (relation).
 */
export function useRemoveRelationship() {
  const { pdfAnnotations, setPdfAnnotations } = usePdfAnnotations();

  const [removeRelationshipMutation] = useMutation<
    RemoveRelationshipOutputType,
    RemoveRelationshipInputType
  >(REQUEST_REMOVE_RELATIONSHIP);

  const handleRemoveRelationship = useCallback(
    async (relationshipId: string) => {
      try {
        await removeRelationshipMutation({
          variables: { relationshipId },
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

        toast.success("Relation removed successfully.");
      } catch (error) {
        toast.error("Failed to remove relation");
        console.error(error);
      }
    },
    [removeRelationshipMutation, setPdfAnnotations]
  );

  return handleRemoveRelationship;
}

/**
 * Hook to update existing relations.
 */
export function useUpdateRelations() {
  const { replaceRelations } = usePdfAnnotations();
  const selectedDocument = useAtomValue(selectedDocumentAtom);
  const { selectedCorpus } = useCorpusState();

  const [updateRelationsMutation] = useMutation<
    UpdateRelationOutputType,
    UpdateRelationInputType
  >(REQUEST_UPDATE_RELATIONS);

  const handleUpdateRelations = useCallback(
    async (relations: RelationGroup[]) => {
      if (!selectedCorpus || !selectedDocument) {
        toast.warning("No corpus or document selected");
        return;
      }

      try {
        await updateRelationsMutation({
          variables: {
            relationships: relations.map((relation) => ({
              id: relation.id,
              sourceIds: relation.sourceIds,
              targetIds: relation.targetIds,
              relationshipLabelId: relation.label.id,
              corpusId: selectedCorpus.id,
              documentId: selectedDocument.id,
            })),
          },
        });

        replaceRelations(relations);
        toast.success("Relations updated successfully.");
      } catch (error) {
        toast.error("Failed to update relations");
        console.error(error);
      }
    },
    [
      selectedCorpus,
      selectedDocument,
      updateRelationsMutation,
      replaceRelations,
    ]
  );

  return handleUpdateRelations;
}

/**
 * Hook to remove an annotation from a relationship while preserving the relationship
 * if it remains valid (has sufficient source/target annotations).
 */
export function useRemoveAnnotationFromRelationship() {
  const { pdfAnnotations, setPdfAnnotations } = usePdfAnnotations();
  const { selectedCorpus } = useCorpusState();
  const selectedDocument = useAtomValue(selectedDocumentAtom);

  const [deleteRelationMutation] = useMutation<
    RemoveRelationshipOutputType,
    RemoveRelationshipInputType
  >(REQUEST_REMOVE_RELATIONSHIP);

  const [updateRelationMutation] = useMutation<
    UpdateRelationOutputType,
    UpdateRelationInputType
  >(REQUEST_UPDATE_RELATIONS);

  const calcRelationUpdatesForAnnotationRemoval = useCallback(
    (annotationId: string, relationId: string) => {
      const relation = pdfAnnotations.relations.find(
        (r) => r.id === relationId
      );
      if (!relation) return { relation: null, action: null };

      const newSourceIds = relation.sourceIds.filter(
        (id) => id !== annotationId
      );
      const newTargetIds = relation.targetIds.filter(
        (id) => id !== annotationId
      );

      // If either sources or targets would be empty, delete the relation
      if (newSourceIds.length === 0 || newTargetIds.length === 0) {
        return { relation, action: "DELETE" as const };
      }

      // Otherwise update the relation with the remaining annotations
      const updatedRelation = new RelationGroup(
        newSourceIds,
        newTargetIds,
        relation.label,
        relation.id
      );
      return { relation: updatedRelation, action: "UPDATE" as const };
    },
    [pdfAnnotations.relations]
  );

  const handleRemoveAnnotationFromRelationship = useCallback(
    async (annotationId: string, relationId: string) => {
      if (!selectedCorpus || !selectedDocument) {
        toast.warning("No corpus or document selected");
        return;
      }

      const { relation, action } = calcRelationUpdatesForAnnotationRemoval(
        annotationId,
        relationId
      );

      if (!relation) {
        toast.error("Relation not found");
        return;
      }

      try {
        if (action === "DELETE") {
          await deleteRelationMutation({
            variables: { relationshipId: relation.id },
          });

          setPdfAnnotations((prev) => {
            const updatedRelations = prev.relations.filter(
              (r) => r.id !== relation.id
            );
            return new PdfAnnotations(
              prev.annotations,
              updatedRelations,
              prev.docTypes,
              true
            );
          });

          toast.success(
            "Removed annotation from relationship. Relationship was deleted as it became invalid."
          );
        } else {
          await updateRelationMutation({
            variables: {
              relationships: [
                {
                  id: relation.id,
                  sourceIds: relation.sourceIds,
                  targetIds: relation.targetIds,
                  relationshipLabelId: relation.label.id,
                  corpusId: selectedCorpus.id,
                  documentId: selectedDocument.id,
                },
              ],
            },
          });

          setPdfAnnotations((prev) => {
            const updatedRelations = prev.relations.map((r) =>
              r.id === relation.id ? relation : r
            );
            return new PdfAnnotations(
              prev.annotations,
              updatedRelations,
              prev.docTypes,
              true
            );
          });

          toast.success("Removed annotation from relationship successfully.");
        }
      } catch (error) {
        toast.error("Failed to remove annotation from relationship");
        console.error(error);
      }
    },
    [
      selectedCorpus,
      selectedDocument,
      calcRelationUpdatesForAnnotationRemoval,
      deleteRelationMutation,
      updateRelationMutation,
      setPdfAnnotations,
    ]
  );

  return handleRemoveAnnotationFromRelationship;
}

/**
 * Hook to delete a document type annotation.
 */
export function useDeleteDocTypeAnnotation() {
  const { setPdfAnnotations } = usePdfAnnotations();

  const [deleteAnnotationMutation] = useMutation<
    RemoveAnnotationOutputType,
    RemoveAnnotationInputType
  >(REQUEST_DELETE_ANNOTATION);

  const handleDeleteDocTypeAnnotation = useCallback(
    async (annotationId: string) => {
      try {
        await deleteAnnotationMutation({
          variables: { annotationId },
        });

        setPdfAnnotations((prev) => {
          const updatedDocTypes = prev.docTypes.filter(
            (docType) => docType.id !== annotationId
          );
          return new PdfAnnotations(
            prev.annotations,
            prev.relations,
            updatedDocTypes,
            true
          );
        });

        toast.success("Document type label removed successfully.");
      } catch (error) {
        toast.error("Failed to remove document type label");
        console.error(error);
      }
    },
    [deleteAnnotationMutation, setPdfAnnotations]
  );

  return handleDeleteDocTypeAnnotation;
}

// Now all required mutations are implemented using the original logic,
// and state updates are handled via Jotai atoms.
// References to `useCorpusContext` and `useDocumentContext` have been
// replaced with Jotai atoms from `@CorpusAtom.tsx` and `@DocumentAtom.tsx`.
