import { useMutation } from "@apollo/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { showStructuralAnnotations } from "../../../../graphql/cache";
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

import * as listeners from "../../listeners";

import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

import {
  AnalysisType,
  AnnotationLabelType,
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
  TextSearchSpanResult,
  SinglePageAnnotationJson,
  TextSearchTokenResult,
} from "../../../types";
import { toast } from "react-toastify";
import { getPermissions } from "../../../../utils/transform";
import _ from "lodash";
import { PDFPageInfo } from "../../types/pdf";
import {
  BoundingBox,
  DocTypeAnnotation,
  PdfAnnotations,
  RelationGroup,
  ServerSpanAnnotation,
  ServerTokenAnnotation,
} from "../../types/annotations";
import { AnnotationStore } from "../../context/AnnotationStore";
import {
  DocumentContext,
  createDocumentContextValue,
} from "../../context/DocumentContext";
import {
  CorpusContext,
  createCorpusContextValue,
} from "../../context/CorpusContext";
import {
  createUIContextValue,
  UIContext,
  useUIContext,
} from "../../context/UIContext";

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

  const { shiftDown, setShiftDown, zoomLevel } = useUIContext();
  const [selectionElementRefs, setSelectionElementRefs] = useState<
    Record<string, React.MutableRefObject<HTMLElement | null>>
  >({});
  // New state to track if we've scrolled to the annotation
  const [searchResultElementRefs, setSearchResultElementRefs] = useState<
    Record<string, React.MutableRefObject<HTMLElement | null>>
  >({});
  const [pageElementRefs, setPageElementRefs] = useState<
    Record<number, React.MutableRefObject<HTMLElement | null>>
  >({});
  const [hideSidebar, setHideSidebar] = useState<boolean>(false);
  const [selectedAnnotations, setSelectedAnnotations] = useState<string[]>([]);
  const [pdfAnnotations, setPdfAnnotations] = useState<PdfAnnotations>(
    new PdfAnnotations([], [], [])
  );
  const [selectedRelations, setSelectedRelations] = useState<RelationGroup[]>(
    []
  );
  const [pageSelection, setSelection] = useState<{
    pageNumber: number;
    bounds: BoundingBox;
  }>();
  const [selectedTextSearchMatchIndex, setSelectedTextSearchMatchIndex] =
    useState<number>(0);
  const [pageSelectionQueue, setMultiSelections] = useState<
    Record<number, BoundingBox[]>
  >({});
  const [pdfPageInfoObjs, setPdfPageInfoObjs] = useState<
    Record<number, PDFPageInfo>
  >([]);
  const [relationModalVisible, setRelationModalVisible] =
    useState<boolean>(false);
  const [useFreeFormAnnotations, toggleUseFreeFormAnnotations] =
    useState<boolean>(false);
  const [activeRelationLabel, setActiveRelationLabel] =
    useState<AnnotationLabelType>(relationship_label_lookup[0]);
  const [spanLabelsToView, setSpanLabelsToView] = useState<
    AnnotationLabelType[] | null
  >(null);
  const [hideLabels, setHideLabels] = useState<boolean>(false);
  const [searchText, setSearchText] = useState<string>();
  const [textSearchMatches, setTextSearchMatches] =
    useState<(TextSearchTokenResult | TextSearchSpanResult)[]>();
  const [scrollContainerRef, setScrollContainerRef] =
    useState<React.RefObject<HTMLDivElement>>();
  const [activeSpanLabel, setActiveSpanLabel] = useState<
    AnnotationLabelType | undefined
  >(
    human_span_label_lookup.length > 0 ? human_span_label_lookup[0] : undefined
  );

  // New state to track if we've scrolled to the annotation
  const [hasScrolledToAnnotation, setHasScrolledToAnnotation] = useState<
    string | null
  >(null);

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
      setShiftDown(false);
    }
  }, []);

  const handleKeyDownPress = useCallback((event: { keyCode: any }) => {
    const { keyCode } = event;
    if (keyCode === 16) {
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

  // Listen for change in shift key and clear selections or triggered annotation creation as needed
  useEffect(() => {
    // If user released the shift key...
    if (!shiftDown) {
      // If there is a page selection in progress or a queue... then fire off DB request to store annotation
      if (
        pageSelection !== undefined ||
        Object.keys(pageSelectionQueue).length !== 0
      ) {
        createMultiPageAnnotation();
      }
    }
  }, [shiftDown]);

  useEffect(() => {
    window.addEventListener("keyup", handleKeyUpPress);
    window.addEventListener("keydown", handleKeyDownPress);
    return () => {
      window.removeEventListener("keyup", handleKeyUpPress);
      window.removeEventListener("keydown", handleKeyDownPress);
    };
  }, [handleKeyUpPress, handleKeyDownPress]);

  // Set scroll container ref on load
  useEffect(() => {
    if (containerRef) {
      setScrollContainerRef(containerRef);
    }
    return () => setScrollContainerRef(undefined);
  }, [containerRef]);

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

  // Search for text when search text changes.
  useEffect(() => {
    let search_hits = [];

    // If there is searchText, search document for matches
    if (searchText) {
      // Use RegEx search without word boundaries and case insensitive
      let exactMatch = new RegExp(searchText, "gi");
      const matches = [...rawText.matchAll(exactMatch)];

      if (openedDocument.fileType === "application/txt") {
        for (let i = 0; i < matches.length; i++) {
          // Make sure match has index and we have a map of doc char
          // index to page and token indices
          if (matches && matches[i].index !== undefined) {
            console.log(matches);
            let start_index = matches[i].index as number;
            let end_index = start_index + searchText.length;
            search_hits.push({
              id: i,
              text: rawText.substring(start_index, end_index),
              start_index: start_index,
              end_index: end_index,
            } as TextSearchSpanResult);
          }
        }
      } else if (openedDocument.fileType === "application/pdf") {
        // Cycle over matches to convert to tokens and page indices
        for (let i = 0; i < matches.length; i++) {
          // Make sure match has index and we have a map of doc char
          // index to page and token indices
          if (matches && matches[i].index && pageTextMaps) {
            let start_index = matches[i].index;
            if (start_index) {
              let end_index = start_index + searchText.length;
              if (end_index) {
                let target_tokens = [];
                let lead_in_tokens = [];
                let lead_out_tokens = [];
                let end_page = 0;
                let start_page = 0;

                // How many chars before and after results do we want to show
                // as context
                let context_length = 128;

                if (start_index > 0) {
                  // How many tokens BEFORE the search result must we traverse to cover the context_length's
                  // worth of characters?
                  let end_text_index =
                    start_index >= context_length
                      ? start_index - context_length
                      : start_index;
                  let previous_token: TokenId | undefined = undefined;

                  // Get the tokens BEFORE the results for up to 128 chars
                  for (let a = start_index; a >= end_text_index; a--) {
                    if (previous_token === undefined) {
                      // console.log("Last_token was undefined and a is", a);
                      // console.log("Token is", page_token_text_maps[a]);
                      if (pageTextMaps[a]) {
                        previous_token = pageTextMaps[a];
                        start_page = previous_token.pageIndex;
                      }
                    } else if (
                      pageTextMaps[a] &&
                      (pageTextMaps[a].pageIndex !== previous_token.pageIndex ||
                        pageTextMaps[a].tokenIndex !==
                          previous_token.tokenIndex)
                    ) {
                      let chap = pageTextMaps[a];
                      previous_token = chap;
                      lead_in_tokens.push(
                        pages[chap.pageIndex].tokens[chap.tokenIndex]
                      );
                      start_page = chap.pageIndex;
                    }
                  }
                }
                let lead_in_text = lead_in_tokens
                  .reverse()
                  .reduce((prev, curr) => prev + " " + curr.text, "");

                // Get actual result tokens based on the start and end token inde
                for (let j = start_index; j < end_index; j++) {
                  target_tokens.push(pageTextMaps[j]);
                }
                var grouped_tokens = _.groupBy(target_tokens, "pageIndex");

                // Now get the text after the search match... and check context length doesn't overshoot the entire document...
                // if it does, just go to end of document.
                let end_text_index =
                  rawText.length - end_index >= context_length
                    ? end_index + context_length
                    : end_index;
                let previous_token: TokenId | undefined = undefined;

                // Get the tokens BEFORE the results for up to 128 chars
                for (let b = end_index; b < end_text_index; b++) {
                  if (previous_token === undefined) {
                    if (pageTextMaps[b]) {
                      previous_token = pageTextMaps[b];
                    }
                  } else if (
                    pageTextMaps[b] &&
                    (pageTextMaps[b].pageIndex !== previous_token.pageIndex ||
                      pageTextMaps[b].tokenIndex !== previous_token.tokenIndex)
                  ) {
                    let chap = pageTextMaps[b];
                    previous_token = chap;
                    lead_out_tokens.push(
                      pages[chap.pageIndex].tokens[chap.tokenIndex]
                    );
                    end_page = chap.pageIndex;
                  }
                }
                let lead_out_text = lead_out_tokens.reduce(
                  (prev, curr) => prev + " " + curr.text,
                  ""
                );

                // Determine bounds for the results
                let bounds: Record<number, BoundingBox> = {};
                for (const [key, value] of Object.entries(grouped_tokens)) {
                  if (pages[parseInt(key)] !== undefined) {
                    var page_bounds =
                      pages[parseInt(key)].getBoundsForTokens(value);
                    if (page_bounds) {
                      bounds[parseInt(key)] = page_bounds;
                    }
                  }
                }

                // Now add the results detailas to the resulting matches.
                let fullContext = (
                  <span>
                    <i>{lead_in_text}</i> <b>{searchText}</b>
                    <i>{lead_out_text}</i>
                  </span>
                );
                search_hits.push({
                  id: i,
                  tokens: grouped_tokens,
                  bounds,
                  fullContext,
                  end_page,
                  start_page,
                });
              }
            }
          }
        }
      }
    }
    setTextSearchMatches(search_hits);
    setSelectedTextSearchMatchIndex(0);
  }, [searchText]);

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

  const addSpanLabelsToViewSelection = (ls: AnnotationLabelType[]) => {
    if (spanLabelsToView) {
      setSpanLabelsToView([...spanLabelsToView, ...ls]);
    } else {
      setSpanLabelsToView(ls);
    }
  };

  const clearSpanLabelsToView = () => {
    setSpanLabelsToView([]);
  };

  const removeSpanLabelsToViewSelection = (
    labelsToRemove: AnnotationLabelType[]
  ) => {
    setSpanLabelsToView((prevData) => {
      if (prevData) {
        return [...prevData].filter((viewingLabel) =>
          labelsToRemove.map((l) => l.id).includes(viewingLabel.id)
        );
      }
      return null;
    });
  };

  // Add selection references
  const insertSelectionElementRef = (
    id: string,
    ref: React.MutableRefObject<HTMLElement | null>
  ) => {
    setSelectionElementRefs((prevData) => ({
      ...prevData,
      [id]: ref,
    }));
  };

  // Add search result references
  const insertSearchResultElementRefs = (
    id: number,
    ref: React.MutableRefObject<HTMLElement | null>
  ) => {
    setSearchResultElementRefs((prevData) => ({
      ...prevData,
      [id]: ref,
    }));
  };

  // Add page reference
  const insertPageRef = (
    id: number,
    ref: React.MutableRefObject<HTMLElement | null>
  ) => {
    setPageElementRefs((prevData) => ({
      ...prevData,
      [id]: ref,
    }));
  };

  const removePageRef = (id: number) => {
    if (pageElementRefs.hasOwnProperty(id)) {
      const { [id]: omitted, ...rest } = pageElementRefs;
      setPageElementRefs(rest);
    }
  };

  // Go to next search match (not being used anymore due to new GUI)
  const advanceTextSearchMatch = () => {
    if (textSearchMatches) {
      if (selectedTextSearchMatchIndex < textSearchMatches.length - 1) {
        setSelectedTextSearchMatchIndex(selectedTextSearchMatchIndex + 1);
        return;
      }
    }
    setSelectedTextSearchMatchIndex(0);
  };

  // Go to last search match (not being used anymore due to new GUI)
  const reverseTextSearchMatch = () => {
    if (textSearchMatches) {
      if (selectedTextSearchMatchIndex > 0) {
        setSelectedTextSearchMatchIndex(selectedTextSearchMatchIndex - 1);
        return;
      }
    }
    setSelectedTextSearchMatchIndex(0);
  };

  const safeSetSelectedTextSearchMatchIndex = (index: number) => {
    if (textSearchMatches && textSearchMatches[index]) {
      setSelectedTextSearchMatchIndex(index);
    }
  };

  // TODO - need to figure out why this should be retained
  const onUpdatePdfAnnotations = (new_store: PdfAnnotations) => {
    console.log("onUpdatePdfAnnotations triggered...");
  };

  const createMultiPageAnnotation = () => {
    // This will action look in our selection queue and build a json obj that
    // can be submitted to the database for storage and retrieval.

    // Only proceed if there's an active span label... otherwise, do nothing
    if (activeSpanLabel) {
      // Need to merge the queue and current selection area
      let updatedPageSelectionQueue: Record<number, BoundingBox[]> =
        pageSelectionQueue;

      // If page number is already in queue... append to queue at page number key
      if (pageSelection && pageSelection.hasOwnProperty("pageNumber")) {
        if (pageSelection.pageNumber in updatedPageSelectionQueue) {
          updatedPageSelectionQueue = {
            ...updatedPageSelectionQueue,
            [pageSelection.pageNumber]: [
              ...updatedPageSelectionQueue[pageSelection.pageNumber],
              pageSelection.bounds,
            ],
          };
        } else {
          // Otherwise, add page number as key and then add bounds to it.
          updatedPageSelectionQueue = {
            ...updatedPageSelectionQueue,
            [pageSelection?.pageNumber]: [pageSelection.bounds],
          };
        }
      }

      let annotations: Record<number, SinglePageAnnotationJson> = {};
      let combinedRawText = "";
      let firstPage = -1;

      //console.log("updatedPageSelectionQueue", updatedPageSelectionQueue);

      for (var pageNumber in updatedPageSelectionQueue) {
        //console.log("Update annotation queue for pageNumber", pageNumber);
        if (firstPage === -1) firstPage = parseInt(pageNumber);
        let page_annotation = pdfPageInfoObjs[
          parseInt(pageNumber)
        ].getPageAnnotationJson(updatedPageSelectionQueue[pageNumber]);
        if (page_annotation) {
          annotations[pageNumber] = page_annotation;
          combinedRawText += " " + page_annotation.rawText;
        }
      }

      //console.log("New Annotation json is: ", annotations);
      // Once the selection is converted to an annotation, set the the
      // selection queue to undefined to empty it and also
      // clear out our multi-selection array which is used to hold multiple selections
      // when user hits SHIFT + click to select text.
      setSelection(undefined);
      setMultiSelections([]);
      requestCreateAnnotation(
        new ServerTokenAnnotation(
          firstPage,
          activeSpanLabel,
          combinedRawText,
          false,
          annotations,
          [
            PermissionTypes.CAN_CREATE,
            PermissionTypes.CAN_REMOVE,
            PermissionTypes.CAN_UPDATE,
          ],
          false,
          false,
          true
        )
      );
    }
  };

  // Create context values
  const documentContextValue = createDocumentContextValue(
    openedDocument,
    openedCorpus,
    rawText,
    doc,
    pageTextMaps,
    data_loading,
    pages,
    pageSelectionQueue,
    scrollContainerRef,
    setScrollContainerRef,
    pdfPageInfoObjs,
    setPdfPageInfoObjs
  );

  const corpusContextValue = createCorpusContextValue(openedCorpus);

  const uiContextValue = createUIContextValue(1.0, 1000);

  // Create annotation store value
  const annotationStoreValue = {
    allowComment: openedCorpus?.allowComments ?? true,
    humanSpanLabelChoices: human_span_label_lookup,
    spanLabels: span_label_lookup,
    searchText,
    hideSidebar,
    relationModalVisible,
    approveAnnotation,
    rejectAnnotation,
    textSearchMatches: textSearchMatches ? textSearchMatches : [],
    searchForText: setSearchText,
    selectedTextSearchMatchIndex,
    reverseTextSearchMatch,
    advanceTextSearchMatch,
    setSelectedTextSearchMatchIndex: safeSetSelectedTextSearchMatchIndex,
    setSelection,
    pageSelection,
    pageSelectionQueue,
    setMultiSelections,
    selectionElementRefs: annotationElementRefs,
    insertSelectionElementRef,
    searchResultElementRefs: textSearchElementRefs,
    insertSearchResultElementRefs,
    pageElementRefs,
    insertPageRef,
    removePageRef,
    activeSpanLabel,
    showOnlySpanLabels: spanLabelsToView,
    clearViewLabels: clearSpanLabelsToView,
    addLabelsToView: addSpanLabelsToViewSelection,
    removeLabelsToView: removeSpanLabelsToViewSelection,
    setActiveLabel: setActiveSpanLabel,
    showStructuralLabels: show_structural_annotations,
    setViewLabels: (ls: AnnotationLabelType[]) => setSpanLabelsToView(ls),
    toggleShowStructuralLabels: () =>
      showStructuralAnnotations(!show_structural_annotations),
    relationLabels: relationship_label_lookup,
    activeRelationLabel,
    setActiveRelationLabel,
    pdfAnnotations,
    setPdfAnnotations: onUpdatePdfAnnotations,
    docTypeLabels: document_label_lookup,
    createAnnotation: requestCreateAnnotation,
    deleteAnnotation: requestDeleteAnnotation,
    updateAnnotation: requestUpdateAnnotation,
    createDocTypeAnnotation: requestCreateDocTypeAnnotation,
    deleteDocTypeAnnotation: requestDeleteDocTypeAnnotation,
    createMultiPageAnnotation,
    createRelation: requestCreateRelation,
    deleteRelation: requestDeleteRelation,
    removeAnnotationFromRelation: requestRemoveAnnotationFromRelationship,
    selectedAnnotations,
    setSelectedAnnotations,
    selectedRelations,
    setSelectedRelations,
    freeFormAnnotations: useFreeFormAnnotations,
    toggleFreeFormAnnotations: toggleUseFreeFormAnnotations,
    hideLabels,
    setHideLabels,
    showAnnotationBoundingBoxes: show_annotation_bounding_boxes,
    showAnnotationLabels: show_annotation_labels,
    setJumpedToAnnotationOnLoad: setHasScrolledToAnnotation,
  };

  return (
    <UIContext.Provider value={uiContextValue}>
      <CorpusContext.Provider value={corpusContextValue}>
        <DocumentContext.Provider value={documentContextValue}>
          <AnnotationStore.Provider value={annotationStoreValue}>
            <listeners.UndoAnnotation />
            <listeners.HandleAnnotationSelection
              setModalVisible={setRelationModalVisible}
            />
            <listeners.HideAnnotationLabels />
            <DocumentViewer
              read_only={read_only}
              editMode={editMode}
              allowInput={allowInput}
              setEditMode={setEditMode}
              setAllowInput={setAllowInput}
            />
          </AnnotationStore.Provider>
        </DocumentContext.Provider>
      </CorpusContext.Provider>
    </UIContext.Provider>
  );
};
