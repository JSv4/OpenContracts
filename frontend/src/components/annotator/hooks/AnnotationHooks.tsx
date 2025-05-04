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
import {
  selectedDocumentAtom,
  useDocumentState,
} from "../context/DocumentAtom";
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
        // Ensure a new object is always created for the update
        const updatedAnnotations = [...prev.annotations, ...annotations];
        return new PdfAnnotations(
          updatedAnnotations, // Use the new array
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
        return new PdfAnnotations(
          replacementAnnotations,
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
   */
  const replaceRelations = useCallback(
    (replacementRelations: RelationGroup[]) => {
      setPdfAnnotations((prev) => {
        return new PdfAnnotations(
          prev.annotations,
          replacementRelations,
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

  console.log("[useCreateAnnotation] Hook initialized", {
    selectedDocumentId: selectedDocument?.id,
    selectedCorpusId: selectedCorpus?.id,
  });

  const [createAnnotation] = useMutation<
    NewAnnotationOutputType,
    NewAnnotationInputType
  >(REQUEST_ADD_ANNOTATION, {
    // Add explicit handlers for debugging in tests
    onCompleted: (data) => {
      console.log(
        "[useMutation HOOK] onCompleted triggered in test. Data:",
        data
      );
      // NOTE: Existing logic in handleCreateAnnotation already updates Jotai state.
      // We don't duplicate it here, this is just for logging in the test env.
    },
    onError: (error) => {
      console.error(
        "[useMutation HOOK] onError triggered in test. Error:",
        error
      );
      toast.error(`[Hook onError] Failed to add annotation: ${error.message}`);
    },
  });

  const handleCreateAnnotation = async (
    annotation: ServerTokenAnnotation | ServerSpanAnnotation
  ) => {
    console.log("[handleCreateAnnotation] Function called with annotation:", {
      id: annotation.id,
      type: annotation instanceof ServerSpanAnnotation ? "Span" : "Token",
      page: annotation.page,
      rawText: annotation.rawText,
      labelId: annotation.annotationLabel.id,
      labelName: annotation.annotationLabel.text,
    });

    // *** ADDED DEPENDENCY LOGS ***
    console.log(
      "[handleCreateAnnotation] Context check - selectedDocument:",
      selectedDocument
        ? {
            id: selectedDocument.id,
            title: selectedDocument.title,
            fileType: selectedDocument.fileType,
          }
        : "null/undefined"
    );
    console.log(
      "[handleCreateAnnotation] Context check - selectedCorpus:",
      selectedCorpus
        ? {
            id: selectedCorpus.id,
            title: selectedCorpus.title,
          }
        : "null/undefined"
    );

    if (!selectedCorpus || !selectedDocument) {
      console.warn(
        "[handleCreateAnnotation] Missing context: No corpus or document selected"
      );
      toast.warning("No corpus or document selected");
      return;
    }

    // Validation for empty annotations
    console.log(
      "[handleCreateAnnotation] Validating annotation text:",
      annotation.rawText
        ? `"${annotation.rawText.substring(0, 50)}${
            annotation.rawText.length > 50 ? "..." : ""
          }"`
        : "empty"
    );

    if (!annotation.rawText || annotation.rawText.trim().length === 0) {
      console.warn(
        "[handleCreateAnnotation] Validation failed: rawText is empty or whitespace. Skipping mutation."
      );
      return;
    }

    console.log(
      "[handleCreateAnnotation] Validation passed. Preparing mutation variables."
    );

    // Always add local annotation fallback in case mutation fails or is not called
    let annotationAddedLocally = false;

    try {
      const variablesToSend = {
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
      };

      console.log("[handleCreateAnnotation] Mutation variables prepared:", {
        documentId: variablesToSend.documentId,
        corpusId: variablesToSend.corpusId,
        annotationLabelId: variablesToSend.annotationLabelId,
        page: variablesToSend.page,
        annotationType: variablesToSend.annotationType,
        textLength: variablesToSend.rawText?.length || 0,
      });

      console.log(
        "[handleCreateAnnotation] JSON payload structure:",
        JSON.stringify(
          variablesToSend.json,
          (key, value) =>
            key === "content"
              ? `[content with length ${value?.length || 0}]`
              : value,
          2
        )
      );

      console.log("[handleCreateAnnotation] Calling GraphQL mutation...");
      const result = await createAnnotation({
        variables: variablesToSend,
      });

      console.log(
        "[handleCreateAnnotation] Mutation complete. Raw result:",
        result
      );

      const data = result?.data;
      console.log(
        "[handleCreateAnnotation] Extracted data from response:",
        data
      );

      if (data?.addAnnotation?.annotation) {
        const createdAnnotationData = data.addAnnotation.annotation;
        console.log(
          "[handleCreateAnnotation] Successfully created annotation:",
          {
            id: createdAnnotationData.id,
            page: createdAnnotationData.page,
            rawText:
              createdAnnotationData.rawText?.substring(0, 50) +
              (createdAnnotationData.rawText?.length > 50 ? "..." : ""),
            labelId: createdAnnotationData.annotationLabel.id,
          }
        );

        let newAnnotation: ServerTokenAnnotation | ServerSpanAnnotation;

        if (selectedDocument.fileType?.startsWith("text/")) {
          console.log(
            "[handleCreateAnnotation] Creating ServerSpanAnnotation instance"
          );
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
          console.log(
            "[handleCreateAnnotation] Creating ServerTokenAnnotation instance"
          );
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

        console.log(
          "[handleCreateAnnotation] Updating state with new annotation"
        );
        addMultipleAnnotations([newAnnotation]);
        toast.success("Added your annotation to the database.");
        annotationAddedLocally = true;
        console.log("[handleCreateAnnotation] State successfully updated");
      } else {
        console.warn(
          "[handleCreateAnnotation] Mutation succeeded but returned no annotation data"
        );
      }
    } catch (error: unknown) {
      console.error(
        "[handleCreateAnnotation] Mutation failed with error:",
        error
      );
      if (error instanceof Error) {
        console.error("[handleCreateAnnotation] Error details:", {
          name: error.name,
          message: error.message,
          stack: error.stack,
        });
      } else {
        console.error(
          "[handleCreateAnnotation] Unknown error format:",
          String(error)
        );
      }
      toast.error(`Unable to add annotation: ${error}`);
    }

    // Fallback: if mutation didn't add annotation, add locally
    if (!annotationAddedLocally) {
      console.log(
        "[handleCreateAnnotation] Using fallback: adding annotation locally only"
      );
      addMultipleAnnotations([annotation]);
      annotationAddedLocally = true;
      console.log("[handleCreateAnnotation] Local fallback complete");
    }

    console.log("[handleCreateAnnotation] Function execution complete");
  };

  // Return the memoized handler function
  // Ensure dependencies that the handler CLOSES OVER are included in the array.
  return useCallback(handleCreateAnnotation, [
    selectedDocument,
    selectedCorpus,
    createAnnotation,
    addMultipleAnnotations,
  ]);
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
  const { activeDocument } = useDocumentState();

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
      if (!selectedCorpus || !activeDocument) {
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
                  documentId: activeDocument.id,
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
      activeDocument,
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
