import { useMutation } from "@apollo/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  APPROVE_ANNOTATION,
  ApproveAnnotationInput,
  ApproveAnnotationOutput,
  NewAnnotationInputType,
  NewAnnotationOutputType,
  NewDocTypeAnnotationInputType,
  NewDocTypeAnnotationOutputType,
  NewRelationshipInputType as NewRelationInputType,
  NewRelationshipOutputType as NewRelationOutputType,
  REJECT_ANNOTATION,
  RejectAnnotationInput,
  RejectAnnotationOutput,
  RemoveAnnotationInputType,
  RemoveAnnotationOutputType,
  RemoveRelationshipInputType,
  RemoveRelationshipOutputType,
  RemoveRelationshipsInputType,
  RemoveRelationshipsOutputType,
  REQUEST_ADD_ANNOTATION,
  REQUEST_ADD_DOC_TYPE_ANNOTATION,
  REQUEST_CREATE_RELATIONSHIP as REQUEST_CREATE_RELATION,
  REQUEST_DELETE_ANNOTATION,
  REQUEST_REMOVE_RELATIONSHIP,
  REQUEST_REMOVE_RELATIONSHIPS,
  REQUEST_UPDATE_ANNOTATION,
  REQUEST_UPDATE_RELATIONS,
  UpdateAnnotationInputType,
  UpdateAnnotationOutputType,
  UpdateRelationInputType,
  UpdateRelationOutputType,
} from "../../../../graphql/mutations";
import { DocumentViewer } from "../viewer";

import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

import {
  AnalysisType,
  AnnotationLabelType,
  AnnotationTypeEnum,
  ColumnType,
  CorpusType,
  DatacellType,
  DocumentType,
  ExtractType,
  LabelDisplayBehavior,
  LabelType,
} from "../../../../types/graphql-api";
import {
  ViewState,
  TokenId,
  PermissionTypes,
  SpanAnnotationJson,
} from "../../../types";
import { toast } from "react-toastify";
import { getPermissions } from "../../../../utils/transform";
import _ from "lodash";
import { PDFPageInfo } from "../../types/pdf";
import {
  DocTypeAnnotation,
  PdfAnnotations,
  RelationGroup,
  ServerSpanAnnotation,
  ServerTokenAnnotation,
} from "../../types/annotations";

export interface TextSearchResultsProps {
  start: TokenId;
  end: TokenId;
}

export interface PageTokenMapProps {
  string_index_token_map: Record<number, TokenId>;
  page_text: string;
}

export interface PageTokenMapBuilderProps {
  end_text_index: number;
  token_map: PageTokenMapProps;
}

interface AnnotatorRendererProps {
  open: boolean;
  doc: PDFDocumentProxy | undefined;
  rawText: string;
  pageTextMaps: Record<number, TokenId> | undefined;
  data_loading?: boolean;
  loading_message?: string;
  pages: PDFPageInfo[];
  opened_document: DocumentType;
  opened_corpus?: CorpusType;
  view_document_only: boolean; // If true, won't show topbar or any of the label selectors.
  analyses?: AnalysisType[];
  extracts?: ExtractType[];
  selected_analysis?: AnalysisType | null;
  selected_extract?: ExtractType | null;
  zoom_level: number;
  setZoomLevel: (zl: number) => void;
  onSelectAnalysis?: (analysis: AnalysisType | null) => undefined | null | void;
  onSelectExtract?: (extract: ExtractType | null) => undefined | null | void;
  read_only: boolean;
  load_progress: number;
  scrollToAnnotation?: ServerTokenAnnotation | ServerSpanAnnotation;
  selectedAnnotation?: (ServerTokenAnnotation | ServerSpanAnnotation)[];
  show_selected_annotation_only: boolean;
  show_annotation_bounding_boxes: boolean;
  show_structural_annotations: boolean;
  show_annotation_labels: LabelDisplayBehavior;
  span_labels: AnnotationLabelType[];
  human_span_labels: AnnotationLabelType[];
  relationship_labels: AnnotationLabelType[];
  document_labels: AnnotationLabelType[];
  annotation_objs: (ServerTokenAnnotation | ServerSpanAnnotation)[];
  doc_type_annotations: DocTypeAnnotation[];
  relationship_annotations: RelationGroup[];
  data_cells?: DatacellType[];
  columns?: ColumnType[];
  structural_annotations?: ServerTokenAnnotation[];
  editMode: "ANNOTATE" | "ANALYZE";
  allowInput: boolean;
  setEditMode: (m: "ANNOTATE" | "ANALYZE") => void | undefined | null;
  setAllowInput: (v: boolean) => void | undefined | null;
  setIsHumanAnnotationMode?: (val: boolean) => undefined | void | null;
  setIsEditingEnabled?: (val: boolean) => undefined | void | null;
  onError: (state: ViewState) => void | any;
}

export const AnnotatorRenderer = ({
  doc,
  rawText,
  pageTextMaps,
  pages,
  data_loading,
  loading_message,
  opened_document: openedDocument,
  opened_corpus: openedCorpus,
  analyses,
  extracts,
  data_cells,
  columns,
  selected_analysis,
  selected_extract,
  editMode,
  allowInput,
  view_document_only,
  zoom_level,
  setZoomLevel,
  setAllowInput,
  setEditMode,
  onSelectAnalysis,
  onSelectExtract,
  read_only,
  scrollToAnnotation,
  selectedAnnotation,
  show_selected_annotation_only,
  show_annotation_bounding_boxes,
  show_structural_annotations,
  show_annotation_labels,
  span_labels: span_label_lookup,
  human_span_labels: human_span_label_lookup,
  relationship_labels: relationship_label_lookup,
  document_labels: document_label_lookup,
  annotation_objs,
  structural_annotations,
  doc_type_annotations,
  relationship_annotations,
  onError,
}: AnnotatorRendererProps) => {
  console.log("AnnotatorRenderer - annotation objs", annotation_objs);
  console.log("AnnotatorRenderer - analyses", analyses);

  const [pdfAnnotations, setPdfAnnotations] = useState<PdfAnnotations>(
    new PdfAnnotations([], [], [])
  );

  // New state to track if we've scrolled to the annotation
  const [hasScrolledToAnnotation, setHasScrolledToAnnotation] = useState<
    string | null
  >(null);

  const [shiftDown, setShiftDown] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  let doc_permissions: PermissionTypes[] = [];
  let raw_permissions = openedDocument.myPermissions;
  if (openedDocument && raw_permissions !== undefined) {
    doc_permissions = getPermissions(raw_permissions);
  }

  let corpus_permissions: PermissionTypes[] = [];
  let raw_corp_permissions = openedCorpus
    ? openedCorpus.myPermissions
    : ["READ"];
  if (openedCorpus && raw_corp_permissions !== undefined) {
    corpus_permissions = getPermissions(raw_corp_permissions);
  }

  // Refs for canvas containers
  const containerRefCallback = useCallback((node: HTMLDivElement | null) => {
    console.log("Started Annotation Renderer");
    if (node !== null) {
      containerRef.current = node;
    }
  }, []);

  // Refs for annotations
  const annotationElementRefs = useRef<Record<string, HTMLElement | null>>({});

  // Refs for search results
  const textSearchElementRefs = useRef<Record<string, HTMLElement | null>>({});

  const handleKeyUpPress = useCallback((event: { keyCode: any }) => {
    const { keyCode } = event;
    if (keyCode === 16) {
      //console.log("Shift released");
      setShiftDown(false);
    }
  }, []);

  const handleKeyDownPress = useCallback((event: { keyCode: any }) => {
    const { keyCode } = event;
    if (keyCode === 16) {
      //console.log("Shift depressed")
      setShiftDown(true);
    }
  }, []);

  const memoizedPdfAnnotations = useMemo(() => {
    return new PdfAnnotations(
      [...annotation_objs, ...(structural_annotations || [])],
      relationship_annotations,
      doc_type_annotations
    );
  }, [
    annotation_objs,
    structural_annotations,
    relationship_annotations,
    doc_type_annotations,
  ]);

  useEffect(() => {
    setPdfAnnotations(memoizedPdfAnnotations);
  }, [memoizedPdfAnnotations]);

  useEffect(() => {
    window.addEventListener("keyup", handleKeyUpPress);
    window.addEventListener("keydown", handleKeyDownPress);
    return () => {
      window.removeEventListener("keyup", handleKeyUpPress);
      window.removeEventListener("keydown", handleKeyDownPress);
    };
  }, [handleKeyUpPress, handleKeyDownPress]);

  // Handle scrolling to annotation
  useEffect(() => {
    if (
      scrollToAnnotation &&
      !hasScrolledToAnnotation &&
      annotationElementRefs.current[scrollToAnnotation.id]
    ) {
      annotationElementRefs?.current[scrollToAnnotation.id]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      setHasScrolledToAnnotation(scrollToAnnotation.id);
    }
  }, [
    scrollToAnnotation,
    hasScrolledToAnnotation,
    annotationElementRefs.current,
  ]);

  // Reset scroll state when scrollToAnnotation changes
  useEffect(() => {
    setHasScrolledToAnnotation(null);
  }, [scrollToAnnotation]);

  function addMultipleAnnotations(a: ServerTokenAnnotation[]): void {
    setPdfAnnotations(
      new PdfAnnotations(
        pdfAnnotations.annotations.concat(a),
        pdfAnnotations.relations,
        pdfAnnotations.docTypes,
        true
      )
    );
  }

  const [createAnnotation, {}] = useMutation<
    NewAnnotationOutputType,
    NewAnnotationInputType
  >(REQUEST_ADD_ANNOTATION);

  const requestCreateAnnotation = (
    added_annotation_obj: ServerTokenAnnotation | ServerSpanAnnotation
  ): void => {
    if (openedCorpus) {
      // Stray clicks on the canvas can trigger the annotation submission with empty token arrays and
      // empty text strings (or strings with a single empty space). This check should remove this behavior
      // by making sure we have more than am empty string or single space.
      if (
        added_annotation_obj.rawText.length > 0 &&
        added_annotation_obj.rawText !== " "
      ) {
        //console.log("requestCreateAnnotation received WITH CONTENT", added_annotation_obj);
        createAnnotation({
          variables: {
            json: added_annotation_obj.json,
            corpusId: openedCorpus.id,
            documentId: openedDocument.id,
            annotationLabelId: added_annotation_obj.annotationLabel.id,
            rawText: added_annotation_obj.rawText,
            page: added_annotation_obj.page,
            annotationType:
              added_annotation_obj instanceof ServerSpanAnnotation
                ? LabelType.SpanLabel
                : LabelType.TokenLabel,
          },
        })
          .then((data) => {
            toast.success("Annotated!\nAdded your annotation to the database.");
            //console.log("New annoation,", data);
            let newRenderedAnnotations: (
              | ServerTokenAnnotation
              | ServerSpanAnnotation
            )[] = [];
            let annotationObj = data?.data?.addAnnotation?.annotation;
            if (annotationObj) {
              if (openedDocument.fileType === "application/txt") {
                newRenderedAnnotations.push(
                  new ServerSpanAnnotation(
                    annotationObj.page,
                    annotationObj.annotationLabel,
                    annotationObj.rawText,
                    false,
                    annotationObj.json as SpanAnnotationJson,
                    getPermissions(
                      annotationObj?.myPermissions
                        ? annotationObj.myPermissions
                        : []
                    ),
                    false,
                    false,
                    false,
                    annotationObj.id
                  )
                );
              } else {
                newRenderedAnnotations.push(
                  new ServerTokenAnnotation(
                    annotationObj.page,
                    annotationObj.annotationLabel,
                    annotationObj.rawText,
                    false,
                    annotationObj.json,
                    getPermissions(
                      annotationObj?.myPermissions
                        ? annotationObj.myPermissions
                        : []
                    ),
                    false,
                    false,
                    false,
                    annotationObj.id
                  )
                );
              }
            }
            addMultipleAnnotations(newRenderedAnnotations);
          })
          .catch((err) => {
            toast.error(
              `Sorry, something went wrong!\nUnable to add that annotation via OpenContracts GraphQL endpoint: ${err}`
            );
            return null;
          });
      }
    } else {
      toast.warning("No corpus selected!");
    }
  };

  interface calcRelationUpdatesForAnnotationRemovalReturnType {
    relation: RelationGroup | null;
    action: "UPDATE" | "DELETE" | "NO_CHANGE";
  }

  function calcRelationUpdatesForAnnotationRemoval(
    annotation_id: string,
    relation_id: string
  ): calcRelationUpdatesForAnnotationRemovalReturnType {
    // console.log("Process relationship changes triggered by removing annotation", annotation_id, "from relation", relation_id);

    let target_relationship: RelationGroup | undefined = undefined;

    try {
      target_relationship = pdfAnnotations.relations.filter(
        (relation) => relation.id === relation_id
      )[0];

      // console.log("Target relationship", target_relationship);

      // If we remove all annotations from source or target side of relation, we want to remove the relation
      // Not supporting any other kind of edits besides deletion, and once you have one-sided relation, there's nothing you
      // can do with it other than delete and re-create it.
      let delete_relation =
        target_relationship.sourceIds.filter((id) => id !== annotation_id)
          .length === 0 ||
        target_relationship.targetIds.filter((id) => id !== annotation_id)
          .length === 0;
      // console.log("Delete relationship?", delete_relation);

      if (delete_relation) {
        // console.log("Relation is now one-sided... delete", target_relationship);
        return {
          relation: target_relationship,
          action: "DELETE",
        };
      }

      // Try to calculate updated source and targets if we didn't determine relation needs to be deleted...
      const newSourceIds = target_relationship.sourceIds.filter(
        (id) => id !== annotation_id
      );
      const newTargetIds = target_relationship.targetIds.filter(
        (id) => id !== annotation_id
      );

      // So long as source and target Id lists are geater than length 0, we return update, otherwise proceed to return our WTF, who knows case.
      if (newSourceIds.length > 0 && newTargetIds.length > 0) {
        return {
          relation: new RelationGroup(
            newSourceIds,
            newTargetIds,
            target_relationship.label,
            target_relationship.id
          ),
          action: "UPDATE",
        };
      }
    } catch {}

    // console.log("Not sure what's going on with removing annotation id", annotation_id, " from relationship ", relation_id)
    return {
      relation: null,
      action: "NO_CHANGE",
    };
  }

  interface calcRelationsChangeByAnnotationDeletionReturnType {
    relations_to_delete: RelationGroup[];
    relations_to_update: RelationGroup[];
  }

  function calcRelationsChangeByAnnotationDeletion(
    annotation_id: string
  ): calcRelationsChangeByAnnotationDeletionReturnType {
    //console.log("Process relationship changes for annotation", annotation_id);

    let implicated_relations = pdfAnnotations.relations.filter(
      (relation) =>
        relation.sourceIds.includes(annotation_id) ||
        relation.targetIds.includes(annotation_id)
    );

    //console.log("Implicated relationships", implicated_relations);
    let relations_to_delete = implicated_relations.filter((r) => {
      const newSourceIds = r.sourceIds.filter((id) => id !== annotation_id);
      const newTargetIds = r.targetIds.filter((id) => id !== annotation_id);
      return newSourceIds.length === 0 || newTargetIds.length === 0;
    });
    //console.log("relations_to_delete", relations_to_delete);

    let relations_to_update = implicated_relations
      .filter((r1) => !relations_to_delete.map((r2) => r2.id).includes(r1.id))
      .map((r3) => {
        const newSourceIds = r3.sourceIds.filter((id) => id !== annotation_id);
        const newTargetIds = r3.targetIds.filter((id) => id !== annotation_id);
        return new RelationGroup(newSourceIds, newTargetIds, r3.label, r3.id);
      });
    //console.log("relations_to_update", relations_to_update);

    return {
      relations_to_delete,
      relations_to_update,
    };
  }

  function removeAnnotation(id: string): ServerTokenAnnotation[] {
    return pdfAnnotations.annotations.filter((ann) => ann.id !== id);
  }

  const requestUpdateAnnotation = (
    updated_annotation: ServerTokenAnnotation
  ) => {
    updateAnnotation({
      variables: {
        id: updated_annotation.id,
        json: updated_annotation.json,
        rawText: updated_annotation.rawText,
        annotationLabel: updated_annotation.annotationLabel.id,
      },
    })
      .then((data) => {
        toast.success("Updated!\nUpdated your annotation successfully.");
        setPdfAnnotations(
          new PdfAnnotations(
            replaceAnnotations(
              [updated_annotation],
              pdfAnnotations.annotations
            ),
            pdfAnnotations.relations,
            pdfAnnotations.docTypes,
            true
          )
        );
      })
      .catch((error) => {
        toast.error(
          "Sorry, something went wrong!\nUnable to update annotation."
        );
      });
  };

  const [deleteAnnotation, {}] = useMutation<
    RemoveAnnotationOutputType,
    RemoveAnnotationInputType
  >(REQUEST_DELETE_ANNOTATION);

  const requestRemoveAnnotationFromRelationship = (
    annotationId: string,
    relationId: string
  ) => {
    const { relation, action } = calcRelationUpdatesForAnnotationRemoval(
      annotationId,
      relationId
    );

    if (openedCorpus) {
      if (relation && action === "DELETE") {
        deleteRelations({
          variables: {
            relationshipIds: [relation.id],
          },
        })
          .then((data) => {
            toast.success(
              "Removed!\nRemoved your annotation from relationship. As a result, relationship was one-sided... deleted relationship too."
            );
            setPdfAnnotations(
              new PdfAnnotations(
                pdfAnnotations.annotations,
                replaceRelations([], removeRelations([relation])),
                pdfAnnotations.docTypes,
                true
              )
            );
          })
          .catch((error) => {
            toast.error(
              "Sorry, something went wrong!\nUnable to remove annotation from relation."
            );
          });
      } else if (relation && action === "UPDATE") {
        updateRelations({
          variables: {
            relationships: [
              {
                id: relation.id,
                sourceIds: relation.sourceIds,
                targetIds: relation.targetIds,
                relationshipLabelId: relation.label.id,
                corpusId: openedCorpus.id,
                documentId: openedDocument.id,
              },
            ],
          },
        })
          .then((data) => {
            toast.success(
              "Removed!\nRemoved your annotation from relationship. Change stored to database."
            );
            setPdfAnnotations(
              new PdfAnnotations(
                pdfAnnotations.annotations,
                replaceRelations([relation], []),
                pdfAnnotations.docTypes,
                true
              )
            );
          })
          .catch((error) => {
            toast.error(
              "Sorry, something went wrong!\nUnable to remove annotation from relation."
            );
          });
      }
    }
  };

  const requestDeleteAnnotation = (annotationId: string): void => {
    if (openedCorpus) {
      const { relations_to_delete, relations_to_update } =
        calcRelationsChangeByAnnotationDeletion(annotationId);

      // console.log("Relations to delete", relations_to_delete);
      // console.log("Relations to update", relations_to_update);

      // Since relations refer to annotations, we need to check that our deletion of an
      // annotation won't require the deletion or update of a relation. If it does,
      // all of these changes must be fired off in a single promise, otherwise the
      // component rerenders between firing the calls off and the remove / update
      // functions grab wrong state.

      let api_calls: Promise<any>[] = [
        deleteAnnotation({
          variables: {
            annotationId,
          },
        }),
      ];
      if (relations_to_delete.length > 0) {
        api_calls.push(
          deleteRelations({
            variables: {
              relationshipIds: relations_to_delete.map((r) => r.id),
            },
          })
        );
      }
      if (relations_to_update.length > 0) {
        api_calls.push(
          updateRelations({
            variables: {
              relationships: relations_to_update.map((relation) => {
                return {
                  id: relation.id,
                  sourceIds: relation.sourceIds,
                  targetIds: relation.targetIds,
                  relationshipLabelId: relation.label.id,
                  corpusId: openedCorpus.id,
                  documentId: openedDocument.id,
                };
              }),
            },
          })
        );
      }

      Promise.all(api_calls)
        .then((data) => {
          toast.success("Removed!\nRemoved your annotation from the database.");
          setPdfAnnotations(
            new PdfAnnotations(
              removeAnnotation(annotationId),
              replaceRelations(
                relations_to_update,
                removeRelations(relations_to_delete)
              ),
              pdfAnnotations.docTypes,
              true
            )
          );
        })
        .catch((err) => {
          toast.error(
            "Sorry, something went wrong!\nUnable to remove that annotation from the database."
          );
        });
    } else {
      toast.warning("No corpus selected.");
    }
  };

  function removeDocType(annotationId: string): DocTypeAnnotation[] {
    return pdfAnnotations.docTypes.filter(
      (docType) => docType.id !== annotationId
    );
  }

  const requestDeleteDocTypeAnnotation = (annotationId: string): void => {
    deleteAnnotation({
      variables: {
        annotationId,
      },
    })
      .then((data) => {
        toast.success(
          "Removed!\nRemoved your document type label from the database."
        );
        setPdfAnnotations(
          new PdfAnnotations(
            pdfAnnotations.annotations,
            pdfAnnotations.relations,
            removeDocType(annotationId),
            true
          )
        );
      })
      .catch((err) => {
        toast.error(
          "Sorry, something went wrong!\nUnable to remove that document type label from the database."
        );
      });
  };

  function addNewRelation(r: RelationGroup): void {
    setPdfAnnotations(
      new PdfAnnotations(
        pdfAnnotations.annotations,
        pdfAnnotations.relations.concat([r]),
        pdfAnnotations.docTypes,
        true
      )
    );
  }

  const [createRelation, {}] = useMutation<
    NewRelationOutputType,
    NewRelationInputType
  >(REQUEST_CREATE_RELATION);

  const requestCreateRelation = (relation: RelationGroup): void => {
    if (openedCorpus) {
      createRelation({
        variables: {
          sourceIds: relation.sourceIds,
          targetIds: relation.targetIds,
          relationshipLabelId: relation.label.id,
          corpusId: openedCorpus.id,
          documentId: openedDocument.id,
        },
      })
        .then((data) => {
          toast.success("Related!\nAdded your relationship to the database.");
          // console.log(data);
          if (data?.data?.addRelationship?.relationship) {
            let obj = data.data.addRelationship.relationship;
            addNewRelation(
              new RelationGroup(
                obj.sourceAnnotations.edges.map((edge) => edge.node.id),
                obj.targetAnnotations.edges.map((edge) => edge.node.id),
                obj.relationshipLabel,
                obj.id
              )
            );
          }
        })
        .catch((err) => {
          toast.error(
            "Sorry, something went wrong!\nUnable to add that relationship via OpenContracts GraphQL endpoint."
          );
        });
    } else {
      toast.warning("No corpus selected");
    }
  };

  const [approveAnnotationMutation] = useMutation<
    ApproveAnnotationOutput,
    ApproveAnnotationInput
  >(APPROVE_ANNOTATION);
  const approveAnnotation = (annotationId: string, comment?: string) => {
    approveAnnotationMutation({
      variables: { annotationId, comment },
      update: (cache, { data }) => {
        if (data?.approveAnnotation?.ok) {
          const userFeedback = data.approveAnnotation.userFeedback;

          // Update Apollo cache
          cache.modify({
            id: cache.identify({
              __typename: "AnnotationType",
              id: annotationId,
            }),
            fields: {
              userFeedback(existingFeedback = []) {
                return [...existingFeedback.edges, { node: userFeedback }];
              },
            },
          });

          // Update local PdfAnnotations state
          setPdfAnnotations((prevState) => {
            const updatedAnnotations = prevState.annotations.map((a) => {
              if (a.id === annotationId) {
                const updatedServerAnnotation = a.update({
                  approved: true,
                  rejected: false,
                });
                return updatedServerAnnotation;
              }
              return a;
            });
            return new PdfAnnotations(
              updatedAnnotations,
              prevState.relations,
              prevState.docTypes,
              true
            );
          });
        }
      },
    }).catch((error) => {
      console.error("Error approving annotation:", error);
      toast.error("Failed to approve annotation");
    });
  };

  const [rejectAnnotationMutation] = useMutation<
    RejectAnnotationOutput,
    RejectAnnotationInput
  >(REJECT_ANNOTATION);
  const rejectAnnotation = (annotationId: string, comment?: string) => {
    rejectAnnotationMutation({
      variables: { annotationId, comment },
      update: (cache, { data }) => {
        if (data?.rejectAnnotation?.ok) {
          const userFeedback = data.rejectAnnotation.userFeedback;

          // Update Apollo cache
          cache.modify({
            id: cache.identify({
              __typename: "AnnotationType",
              id: annotationId,
            }),
            fields: {
              userFeedback(existingFeedback = []) {
                return [...existingFeedback.edges, { node: userFeedback }];
              },
            },
          });

          // Update local PdfAnnotations state
          setPdfAnnotations((prevState) => {
            const updatedAnnotations = prevState.annotations.map((a) => {
              if (a.id === annotationId) {
                const updatedServerAnnotation = a.update({
                  approved: false,
                  rejected: true,
                });
                return updatedServerAnnotation;
              }
              return a;
            });
            return new PdfAnnotations(
              updatedAnnotations,
              prevState.relations,
              prevState.docTypes,
              true
            );
          });
        }
      },
    }).catch((error) => {
      console.error("Error rejecting annotation:", error);
      toast.error("Failed to reject annotation");
    });
  };

  function removeRelation(relationshipId: string): RelationGroup[] {
    return pdfAnnotations.relations.filter((rel) => rel.id !== relationshipId);
  }

  function removeRelations(relationships: RelationGroup[]): RelationGroup[] {
    const removed_ids = relationships.map((r) => r.id);
    return pdfAnnotations.relations.filter(
      (rel) => !removed_ids.includes(rel.id)
    );
  }

  const [deleteRelations, {}] = useMutation<
    RemoveRelationshipsOutputType,
    RemoveRelationshipsInputType
  >(REQUEST_REMOVE_RELATIONSHIPS);

  const [deleteRelation, {}] = useMutation<
    RemoveRelationshipOutputType,
    RemoveRelationshipInputType
  >(REQUEST_REMOVE_RELATIONSHIP);

  const requestDeleteRelation = (relationshipId: string): void => {
    deleteRelation({
      variables: {
        relationshipId,
      },
    })
      .then((data) => {
        toast.success("Removed!\nRemoved your relation from the database.");
        setPdfAnnotations(
          new PdfAnnotations(
            pdfAnnotations.annotations,
            removeRelation(relationshipId),
            pdfAnnotations.docTypes,
            true
          )
        );
      })
      .catch((err) => {
        toast.error(
          "Sorry, something went wrong!\nUnable to remove that relation from the database."
        );
      });
  };

  // LEAVE THIS!!! IT IS USED, WHATEVER CODE CHECKER TELLS YOU
  // Why is this not used in this module...? Because it's called from a listener.
  const requestDeleteRelations = (relationships: RelationGroup[]): void => {
    // console.log("requestDeleteRelations", relationships);
    deleteRelations({
      variables: {
        relationshipIds: relationships.map((r) => r.id),
      },
    })
      .then((data) => {
        toast.success(
          "Removed!\nRemoved specified relations from the database."
        );
        removeRelations(relationships);
      })
      .catch((err) => {
        toast.error(
          "Sorry, something went wrong!\nUnable to remove that relation from the database. "
        );
      });
  };

  const [updateRelations, {}] = useMutation<
    UpdateRelationOutputType,
    UpdateRelationInputType
  >(REQUEST_UPDATE_RELATIONS);

  const replaceRelations = (
    replacement_relations: RelationGroup[],
    obj_list_to_replace_in: RelationGroup[]
  ): RelationGroup[] => {
    const updated_ids = replacement_relations.map((r) => r.id);
    const unchanged_relations = obj_list_to_replace_in.filter(
      (r) => !updated_ids.includes(r.id)
    );
    return [...unchanged_relations, ...replacement_relations];
  };

  const replaceAnnotations = (
    replacement_annotations: ServerTokenAnnotation[],
    obj_list_to_replace_in: ServerTokenAnnotation[]
  ): ServerTokenAnnotation[] => {
    const updated_ids = replacement_annotations.map((a) => a.id);
    const unchanged_annotations = obj_list_to_replace_in.filter(
      (a) => !updated_ids.includes(a.id)
    );
    return [...unchanged_annotations, ...replacement_annotations];
  };

  const [updateAnnotation, {}] = useMutation<
    UpdateAnnotationOutputType,
    UpdateAnnotationInputType
  >(REQUEST_UPDATE_ANNOTATION);

  function addDocType(t: DocTypeAnnotation) {
    // console.log("withNewDocType", t);
    setPdfAnnotations(
      new PdfAnnotations(
        pdfAnnotations.annotations,
        pdfAnnotations.relations,
        pdfAnnotations.docTypes.concat([t]),
        true
      )
    );
  }

  const [createDocTypeAnnotation, {}] = useMutation<
    NewDocTypeAnnotationOutputType,
    NewDocTypeAnnotationInputType
  >(REQUEST_ADD_DOC_TYPE_ANNOTATION);

  const requestCreateDocTypeAnnotation = (
    doc_type: DocTypeAnnotation
  ): void => {
    if (openedCorpus) {
      createDocTypeAnnotation({
        variables: {
          documentId: openedDocument.id,
          corpusId: openedCorpus.id,
          annotationLabelId: doc_type.annotationLabel.id,
        },
      })
        .then((data) => {
          toast.success("Labelled!\nAdded your doc label to the database.");
          if (data.data?.addDocTypeAnnotation?.annotation) {
            let obj = data.data.addDocTypeAnnotation.annotation;
            addDocType(
              new DocTypeAnnotation(
                obj.annotationLabel,
                getPermissions(obj.myPermissions),
                obj.id
              )
            );
          }
        })
        .catch((err) => {
          toast.error(
            "Sorry, something went wrong!\nUnable to add that document label via OpenContracts GraphQL endpoint."
          );
        });
    } else {
      toast.warning("No corpus selected");
    }
  };

  console.log("AnnotatorRenderer...");
  return (
    <DocumentViewer
      zoom_level={zoom_level}
      setZoomLevel={setZoomLevel}
      view_document_only={view_document_only}
      doc_permissions={doc_permissions}
      corpus_permissions={corpus_permissions}
      read_only={read_only}
      data_loading={data_loading}
      loading_message={loading_message}
      createAnnotation={requestCreateAnnotation}
      createRelation={requestCreateRelation}
      createDocTypeAnnotation={requestCreateDocTypeAnnotation}
      deleteAnnotation={requestDeleteAnnotation}
      updateAnnotation={requestUpdateAnnotation}
      approveAnnotation={approveAnnotation}
      rejectAnnotation={rejectAnnotation}
      deleteRelation={requestDeleteRelation}
      removeAnnotationFromRelation={requestRemoveAnnotationFromRelationship}
      deleteDocTypeAnnotation={requestDeleteDocTypeAnnotation}
      containerRef={containerRef}
      containerRefCallback={containerRefCallback}
      pdfAnnotations={pdfAnnotations}
      show_structural_annotations={show_structural_annotations}
      show_selected_annotation_only={show_selected_annotation_only}
      show_annotation_bounding_boxes={show_annotation_bounding_boxes}
      show_annotation_labels={show_annotation_labels}
      scroll_to_annotation_on_open={scrollToAnnotation}
      setJumpedToAnnotationOnLoad={setHasScrolledToAnnotation}
      doc={doc}
      doc_text={rawText}
      page_token_text_maps={pageTextMaps ? pageTextMaps : {}}
      pages={pages}
      spanLabels={span_label_lookup}
      humanSpanLabelChoices={human_span_label_lookup}
      relationLabels={relationship_label_lookup}
      docTypeLabels={document_label_lookup}
      setViewState={onError}
      shiftDown={shiftDown}
      selected_corpus={openedCorpus}
      selected_document={openedDocument}
      analyses={analyses ? analyses : []}
      extracts={extracts ? extracts : []}
      datacells={data_cells ? data_cells : []}
      columns={columns ? columns : []}
      editMode={editMode}
      setEditMode={setEditMode}
      allowInput={allowInput}
      setAllowInput={setAllowInput}
      selected_analysis={selected_analysis}
      selected_extract={selected_extract}
      onSelectAnalysis={
        onSelectAnalysis ? onSelectAnalysis : (a: AnalysisType | null) => null
      }
      onSelectExtract={
        onSelectExtract ? onSelectExtract : (e: ExtractType | null) => null
      }
    />
  );
};
