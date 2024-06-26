import { useMutation } from "@apollo/client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  NewAnnotationInputType,
  NewAnnotationOutputType,
  NewDocTypeAnnotationInputType,
  NewDocTypeAnnotationOutputType,
  NewRelationshipInputType as NewRelationInputType,
  NewRelationshipOutputType as NewRelationOutputType,
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
} from "../../graphql/mutations";
import { PDFView } from "./pages";

import {
  DocTypeAnnotation,
  PdfAnnotations,
  PDFPageInfo,
  RelationGroup,
  ServerAnnotation,
} from "./context";
import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

import {
  AnnotationLabelType,
  CorpusType,
  DocumentType,
  LabelDisplayBehavior,
  ServerAnnotationType,
} from "../../graphql/types";
import { ViewState, TokenId, PermissionTypes } from "../types";
import { toast } from "react-toastify";
import { createTokenStringSearch } from "./utils";
import { getPermissions } from "../../utils/transform";
import _ from "lodash";
import {
  displayAnnotationOnAnnotatorLoad,
  onlyDisplayTheseAnnotations,
} from "../../graphql/cache";

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
  doc: PDFDocumentProxy;
  pages: PDFPageInfo[];
  opened_document: DocumentType;
  opened_corpus?: CorpusType;
  read_only: boolean;
  load_progress: number;
  scroll_to_annotation_on_open: ServerAnnotationType | null;
  display_annotations?: ServerAnnotationType[];
  show_selected_annotation_only: boolean;
  show_annotation_bounding_boxes: boolean;
  show_annotation_labels: LabelDisplayBehavior;
  span_labels: AnnotationLabelType[];
  human_span_labels: AnnotationLabelType[];
  relationship_labels: AnnotationLabelType[];
  document_labels: AnnotationLabelType[];
  annotation_objs: ServerAnnotation[];
  doc_type_annotations: DocTypeAnnotation[];
  relationship_annotations: RelationGroup[];
  onError: (state: ViewState) => void | any;
}

export const AnnotatorRenderer = ({
  open,
  doc,
  pages,
  opened_document: openedDocument,
  opened_corpus: openedCorpus,
  read_only,
  scroll_to_annotation_on_open,
  show_selected_annotation_only,
  show_annotation_bounding_boxes,
  show_annotation_labels,
  span_labels: span_label_lookup,
  human_span_labels: human_span_label_lookup,
  relationship_labels: relationship_label_lookup,
  document_labels: document_label_lookup,
  annotation_objs,
  doc_type_annotations,
  relationship_annotations,
  onError,
}: AnnotatorRendererProps) => {
  console.log("AnnotatorRenderer");

  const [pdfAnnotations, setPdfAnnotations] = useState<PdfAnnotations>(
    new PdfAnnotations([], [], [])
  );

  const [pageTextMaps, setPageTextMaps] = useState<Record<number, TokenId>>();
  const [doc_text, setDocText] = useState<string>("");
  const [loaded_page_for_annotation, setLoadedPageForAnnotation] =
    useState<ServerAnnotationType | null>(null);
  const [jumped_to_annotation_on_load, setJumpedToAnnotationOnLoad] = useState<
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
  const annotationElementRefs = useRef({});

  // Refs for search results
  const textSearchElementRefs = useRef({});

  const handleKeyUpPress = useCallback((event) => {
    const { keyCode } = event;
    if (keyCode === 16) {
      //console.log("Shift released");
      setShiftDown(false);
    }
  }, []);

  const handleKeyDownPress = useCallback((event) => {
    const { keyCode } = event;
    if (keyCode === 16) {
      //console.log("Shift depressed")
      setShiftDown(true);
    }
  }, []);

  // When unmounting... ensure we turn off limiting to provided set of annotations
  useEffect(() => {
    return () => {
      onlyDisplayTheseAnnotations(undefined);
    };
  }, []);

  useEffect(() => {
    setPdfAnnotations(
      new PdfAnnotations(
        annotation_objs,
        relationship_annotations,
        doc_type_annotations
      )
    );
  }, [annotation_objs, relationship_annotations, doc_type_annotations]);

  useEffect(() => {
    window.addEventListener("keyup", handleKeyUpPress);
    window.addEventListener("keydown", handleKeyDownPress);
    return () => {
      window.removeEventListener("keyup", handleKeyUpPress);
      window.removeEventListener("keydown", handleKeyDownPress);
    };
  }, [handleKeyUpPress, handleKeyDownPress]);

  // Update query vars as appropriate.
  // Batching in useEffect to cut down on unecessary re-renders
  useEffect(() => {
    // If user wanted to nav right to an annotation, problem we have is we don't load
    // an entire doc's worth of annotations, but we can pass annotation id to the backend
    // which will determine the page that annotation is one and return annotations for that page

    // I'm sure there is a better way to achieve what's happening here, but I think it will require
    // (at least for me) a more thorough rethinking of how the Annotator is loading data
    // and perhaps a move away from the Annotator context the original PAWLs application used which,
    // while cool, is largely duplicative of my Apollo state store and is causing some caching oddities that
    // I need to work around.
    //
    //    Anyway, this is checking to see if:
    //
    //    1) The annotator was told to open to a given annotation (should happen on mount)?
    //    2) The page for that annotation was loaded (should happen on mount)
    //    3) The annotation with requested id was loaded and jumped to itself (see the Selection component)
    //
    //    IF 1, 2 AND 3 are true, then the state variables that would jump to a specific page
    //    are all reset.
    //
    // Like I said, there is probably a better way to do this with a more substantial redesign of
    // the <Annotator/> component, but I do want to release this app sometime this century.
    if (scroll_to_annotation_on_open) {
      if (
        jumped_to_annotation_on_load &&
        loaded_page_for_annotation &&
        loaded_page_for_annotation.id === jumped_to_annotation_on_load &&
        loaded_page_for_annotation.id === scroll_to_annotation_on_open.id
      ) {
        displayAnnotationOnAnnotatorLoad(null);
        setLoadedPageForAnnotation(null);
        setJumpedToAnnotationOnLoad(null);
      }
    }
  }, [
    jumped_to_annotation_on_load,
    loaded_page_for_annotation,
    scroll_to_annotation_on_open,
  ]);

  // When the opened document is changed... reload...
  useEffect(() => {
    let { doc_text, string_index_token_map } = createTokenStringSearch(pages);

    setPageTextMaps({
      ...string_index_token_map,
      ...pageTextMaps,
    });
    setDocText(doc_text);
  }, [pages, doc]);

  useEffect(() => {
    // When modal is hidden, ensure we reset state and clear provided annotations to display
    if (!open) {
      onlyDisplayTheseAnnotations(undefined);
    }
  }, [open]);

  useEffect(() => {
    // We only want to load annotation page for selected annotation on load ONCE
    if (
      scroll_to_annotation_on_open !== null &&
      loaded_page_for_annotation === null &&
      jumped_to_annotation_on_load !== scroll_to_annotation_on_open.id
    ) {
      setLoadedPageForAnnotation(scroll_to_annotation_on_open);
    }
  }, [scroll_to_annotation_on_open]);

  function addMultipleAnnotations(a: ServerAnnotation[]): void {
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
    added_annotation_obj: ServerAnnotation
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
          },
        })
          .then((data) => {
            toast.success("Annotated!\nAdded your annotation to the database.");
            //console.log("New annoation,", data);
            let newRenderedAnnotations: ServerAnnotation[] = [];
            let annotationObj = data?.data?.addAnnotation?.annotation;
            if (annotationObj) {
              newRenderedAnnotations.push(
                new ServerAnnotation(
                  annotationObj.page,
                  annotationObj.annotationLabel,
                  annotationObj.rawText,
                  annotationObj.json,
                  getPermissions(
                    annotationObj?.myPermissions
                      ? annotationObj.myPermissions
                      : []
                  ),
                  annotationObj.id
                )
              );
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

  function removeAnnotation(id: string): ServerAnnotation[] {
    return pdfAnnotations.annotations.filter((ann) => ann.id !== id);
  }

  const requestUpdateAnnotation = (updated_annotation: ServerAnnotation) => {
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
    replacement_annotations: ServerAnnotation[],
    obj_list_to_replace_in: ServerAnnotation[]
  ): ServerAnnotation[] => {
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

  return (
    <PDFView
      doc_permissions={doc_permissions}
      corpus_permissions={corpus_permissions}
      read_only={read_only}
      createAnnotation={requestCreateAnnotation}
      createRelation={requestCreateRelation}
      createDocTypeAnnotation={requestCreateDocTypeAnnotation}
      deleteAnnotation={requestDeleteAnnotation}
      updateAnnotation={requestUpdateAnnotation}
      deleteRelation={requestDeleteRelation}
      removeAnnotationFromRelation={requestRemoveAnnotationFromRelationship}
      deleteDocTypeAnnotation={requestDeleteDocTypeAnnotation}
      containerRef={containerRef}
      containerRefCallback={containerRefCallback}
      pdfAnnotations={pdfAnnotations}
      textSearchElementRefs={textSearchElementRefs}
      preAssignedSelectionElementRefs={annotationElementRefs}
      show_selected_annotation_only={show_selected_annotation_only}
      show_annotation_bounding_boxes={show_annotation_bounding_boxes}
      show_annotation_labels={show_annotation_labels}
      scroll_to_annotation_on_open={
        jumped_to_annotation_on_load !== scroll_to_annotation_on_open?.id
          ? scroll_to_annotation_on_open
          : null
      }
      setJumpedToAnnotationOnLoad={setJumpedToAnnotationOnLoad}
      doc={doc}
      doc_text={doc_text}
      page_token_text_maps={pageTextMaps ? pageTextMaps : {}}
      pages={pages}
      spanLabels={span_label_lookup}
      humanSpanLabelChoices={human_span_label_lookup}
      relationLabels={relationship_label_lookup}
      docTypeLabels={document_label_lookup}
      setViewState={onError}
      shiftDown={shiftDown}
    />
  );
};
