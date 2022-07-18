import { useMutation, useQuery } from "@apollo/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Progress, Header, Icon } from "semantic-ui-react";
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
import {
  RequestAnnotatorDataForDocumentInputs,
  RequestAnnotatorDataForDocumentOutputs,
  REQUEST_ANNOTATOR_DATA_FOR_DOCUMENT,
} from "../../graphql/queries";
import {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
} from "pdfjs-dist/types/src/display/api";

import AnnotatorSidebar from "./sidebar/AnnotatorSidebar";
import { CenterOnPage, sidebarWidth, WithSidebar } from ".";
import { SidebarContainer } from "../common";
import { getPawlsLayer } from "./api/rest";
import {
  AnnotationLabelType,
  CorpusType,
  DocumentType,
  LabelDisplayBehavior,
  ServerAnnotationType,
} from "../../graphql/types";
import {
  ViewState,
  PageTokens,
  TokenId,
  PermissionTypes,
  LooseObject,
} from "../types";
import { SemanticICONS } from "semantic-ui-react/dist/commonjs/generic";
import { toast } from "react-toastify";
import { Result } from "../widgets/data-display/Result";
import { createTokenStringSearch } from "./utils";
import { getPermissions } from "../../utils/transform";

// Loading pdf js libraries without cdn is a right PITA... cobbled together a working
// approach via these guides:
// https://stackoverflow.com/questions/63553008/looking-for-help-to-make-npm-pdfjs-dist-work-with-webpack-and-django
// https://github.com/mozilla/pdf.js/issues/12379
// https://github.com/mozilla/pdf.js/blob/f40bbe838e3c09b84e6f69df667a453c55de25f8/examples/webpack/main.js
const pdfjsLib = require("pdfjs-dist");

// Setting worker path to worker bundle.
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.js`;
// "../../build/webpack/pdf.worker.min.js';";

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

interface AnnotatorProps {
  open: boolean;
  openedDocument: DocumentType;
  openedCorpus: CorpusType;
  scroll_to_annotation_on_open: ServerAnnotationType | null;
  show_selected_annotation_only: boolean;
  show_annotation_bounding_boxes: boolean;
  show_annotation_labels: LabelDisplayBehavior;
  onClose: (args?: any) => void | any;
}

export const Annotator = ({
  open,
  openedDocument,
  openedCorpus,
  scroll_to_annotation_on_open,
  show_selected_annotation_only,
  show_annotation_bounding_boxes,
  show_annotation_labels,
  onClose,
}: AnnotatorProps) => {
  const [pdfAnnotations, setPdfAnnotations] = useState<PdfAnnotations>(
    new PdfAnnotations([], [], [])
  );

  const [viewState, setViewState] = useState<ViewState>(ViewState.LOADING);
  const [doc, setDocument] = useState<PDFDocumentProxy>();
  const [pages, setPages] = useState<PDFPageInfo[]>([]);
  const [pageTextMaps, setPageTextMaps] = useState<Record<number, TokenId>>();
  const [doc_text, setDocText] = useState<string>("");
  const [span_labels, setSpanLabels] = useState<AnnotationLabelType[]>([]);
  const [relation_labels, setRelationLabels] = useState<AnnotationLabelType[]>(
    []
  );
  const [doc_type_labels, setDocTypeLabels] = useState<AnnotationLabelType[]>(
    []
  );
  const [progress, setProgress] = useState(0);
  const [shiftDown, setShiftDown] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  let doc_permissions: PermissionTypes[] = [];
  let raw_permissions = openedDocument.myPermissions;
  if (openedDocument && raw_permissions !== undefined) {
    doc_permissions = getPermissions(raw_permissions);
  }

  let corpus_permissions: PermissionTypes[] = [];
  let raw_corp_permissions = openedCorpus.myPermissions;
  if (openedCorpus && raw_corp_permissions !== undefined) {
    corpus_permissions = getPermissions(raw_corp_permissions);
  }

  // Refs for canvas container
  // const containerRef = useRef<HTMLDivElement | null>(null);
  // const containerRef = useCallback((containerDivElement: HTMLDivElement | null) => {
  //   console.log("New containerDivElement", containerDivElement);
  // }, []);
  const containerRefCallback = useCallback((node: HTMLDivElement | null) => {
    if (node !== null) {
      containerRef.current = node;
    }
  }, []);

  // Refs for annotations
  const annotationElementRefs = useRef({});

  // Refs for search results
  const textSearchElementRefs = useRef({});

  const handleKeyUpPress = useCallback((event) => {
    const { key, keyCode } = event;
    if (keyCode === 16) {
      //console.log("Shift released");
      setShiftDown(false);
    }
  }, []);

  const handleKeyDownPress = useCallback((event) => {
    const { key, keyCode } = event;
    if (keyCode === 16) {
      //console.log("Shift depressed")
      setShiftDown(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keyup", handleKeyUpPress);
    window.addEventListener("keydown", handleKeyDownPress);
    return () => {
      window.removeEventListener("keyup", handleKeyUpPress);
      window.removeEventListener("keydown", handleKeyDownPress);
    };
  }, [handleKeyUpPress, handleKeyDownPress]);

  // Get the basic data PAWLS needs to render doc and start annotations:
  const { loading, error, data, refetch } = useQuery<
    RequestAnnotatorDataForDocumentOutputs,
    RequestAnnotatorDataForDocumentInputs
  >(REQUEST_ANNOTATOR_DATA_FOR_DOCUMENT, {
    variables: {
      selectedDocumentId: openedDocument.id,
      selectedCorpusId: openedCorpus.id,
    },
    notifyOnNetworkStatusChange: true, // required to get loading signal on fetchMore
  });

  useEffect(() => {
    if (openedDocument && openedDocument.pdfFile) {
      setViewState(ViewState.LOADING);

      const loadingTask: PDFDocumentLoadingTask = pdfjsLib.getDocument(
        openedDocument.pdfFile
      );
      loadingTask.onProgress = (p: { loaded: number; total: number }) => {
        setProgress(Math.round((p.loaded / p.total) * 100));
      };

      Promise.all([
        // PDF.js uses their own `Promise` type, which according to TypeScript doesn't overlap
        // with the base `Promise` interface. To resolve this we (unsafely) cast the PDF.js
        // specific `Promise` back to a generic one. This works, but might have unexpected
        // side-effects, so we should remain wary of this code.
        loadingTask.promise as unknown as Promise<PDFDocumentProxy>,
        // Fetch the pawls datafile with PageToken JSON (this is stored in S3 for faster retrieval and to cut down
        // storage usage in the PostgreSQL cluster)
        getPawlsLayer(
          openedDocument?.pawlsParseFile ? openedDocument.pawlsParseFile : ""
        ),
      ])
        .then(([doc, resp]: [PDFDocumentProxy, PageTokens[]]) => {
          setDocument(doc);

          // Load all the pages too. In theory this makes things a little slower to startup,
          // as fetching and rendering them asynchronously would make it faster to render the
          // first, visible page. That said it makes the code simpler, so we're ok with it for
          // now.
          const loadPages: Promise<PDFPageInfo>[] = [];
          let total_char_count = 0;
          for (let i = 1; i <= doc.numPages; i++) {
            // See line 50 for an explanation of the cast here.
            loadPages.push(
              doc.getPage(i).then((p) => {
                // console.log("Loading up some data for page ", i, p);
                const pageIndex = p.pageNumber - 1;

                // console.log("pageIndex", pageIndex);
                const pageTokens = resp[pageIndex].tokens;

                // console.log("Tokens", pageTokens);
                return new PDFPageInfo(p, pageTokens);
              }) as unknown as Promise<PDFPageInfo>
            );
          }
          return Promise.all(loadPages);
        })
        .then((pages) => {
          setPages(pages);

          let { doc_text, page_text_map, string_index_token_map } =
            createTokenStringSearch(pages);

          setPageTextMaps({
            ...string_index_token_map,
            ...pageTextMaps,
          });
          setDocText(doc_text);

          // Get any existing annotations for this pdf.
        })
        .catch((err: any) => {
          if (err instanceof Error) {
            // We have to use the message because minification in production obfuscates
            // the error name.
            if (err.message === "Request failed with status code 404") {
              setViewState(ViewState.NOT_FOUND);
              return;
            }
          }
          console.error(`Error Loading PDF: `, err);
          setViewState(ViewState.ERROR);
        });
    }
  }, [openedDocument]);

  useEffect(() => {
    if (data) {
      // Build proper span label objs from GraphQL results
      let span_label_lookup: LooseObject = {};
      if (data?.corpus?.labelSet) {
        span_label_lookup = {
          ...span_label_lookup,
          ...data.corpus.labelSet.spanLabels.edges.reduce(function (
            obj: Record<string, any>,
            edge
          ) {
            obj[edge.node.id] = {
              id: edge.node.id,
              color: edge.node.color,
              text: edge.node.text,
              icon: edge.node.icon as SemanticICONS,
              description: edge.node.description,
              labelType: edge.node.labelType,
            };
            return obj;
          },
          {}),
        };
      }

      setSpanLabels(Object.values(span_label_lookup));

      // Build proper relationship label objs from GraphQL results
      let relationship_label_lookup: LooseObject = {};
      if (data?.corpus?.labelSet?.relationshipLabels?.edges) {
        relationship_label_lookup = {
          ...relationship_label_lookup,
          ...data.corpus.labelSet.relationshipLabels.edges.reduce(function (
            obj: Record<string, any>,
            edge
          ) {
            obj[edge.node.id] = {
              id: edge.node.id,
              color: edge.node.color,
              text: edge.node.text,
              icon: edge.node.icon as SemanticICONS,
              description: edge.node.description,
              labelType: edge.node.labelType,
            };
            return obj;
          },
          {}),
        };
      }
      setRelationLabels(Object.values(relationship_label_lookup));

      // Build proper doc type label objs from GraphQL results
      let document_label_lookup: LooseObject = {};

      if (data?.corpus?.labelSet?.docTypeLabels?.edges) {
        document_label_lookup = {
          ...document_label_lookup,
          ...data.corpus.labelSet.docTypeLabels.edges.reduce(function (
            obj: Record<string, any>,
            edge
          ) {
            obj[edge.node.id] = {
              id: edge.node.id,
              color: edge.node.color,
              text: edge.node.text,
              icon: edge.node.icon as SemanticICONS,
              description: edge.node.description,
              labelType: edge.node.labelType,
            };
            return obj;
          },
          {}),
        };
      }
      setDocTypeLabels(Object.values(document_label_lookup));

      // Turn existing annotation data into PDFAnnotations obj and inject into state:
      let annotation_objs = data.existingSpanAnnotations.edges.map(
        (e) =>
          new ServerAnnotation(
            e.node.page,
            e.node.annotationLabel,
            e.node.rawText ? e.node.rawText : "",
            e.node.json ? e.node.json : {},
            e.node.myPermissions ? getPermissions(e.node.myPermissions) : [],
            e.node.id
          )
      );

      let doc_type_label_objs = data.existingDocLabelAnnotations.edges.map(
        (edge) => {
          let label_obj = edge.node.annotationLabel;
          try {
            label_obj = document_label_lookup[label_obj.id];
          } catch {}
          return new DocTypeAnnotation(
            label_obj,
            edge.node.myPermissions
              ? getPermissions(edge.node.myPermissions)
              : [],
            edge.node.id
          );
        }
      );

      let relationship_label_objs = data.existingRelationships.edges.map(
        (edge) => {
          let label_obj = edge.node.relationshipLabel;
          if (label_obj) {
            try {
              label_obj = relationship_label_lookup[label_obj.id];
            } catch {}
          }
          let source_ids = edge.node.sourceAnnotations.edges
            .filter((edge) => edge && edge.node && edge.node.id)
            .map((edge) => edge?.node?.id);
          let target_ids = edge.node.targetAnnotations.edges
            .filter((edge) => edge && edge.node && edge.node.id)
            .map((edge) => edge?.node?.id);
          return new RelationGroup(
            source_ids as string[],
            target_ids as string[],
            label_obj,
            edge.node.id
          );
        }
      );

      // add our loaded annotations from the backend into local state
      setPdfAnnotations(
        new PdfAnnotations(
          annotation_objs,
          relationship_label_objs,
          doc_type_label_objs
        )
      );

      // Set up contexts for annotations
      setViewState(ViewState.LOADED);
    }
  }, [data]);

  useEffect(() => {
    if (error) {
      toast.error(
        "Sorry, something went wrong!\nUnable to fetch required data to open annotations for this document and corpus."
      );
    }
  }, [error]);

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
          annotationLabelId: doc_type.label.id,
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

  let rendered_component = <></>;
  switch (viewState) {
    case ViewState.LOADING:
      rendered_component = (
        <WithSidebar width={sidebarWidth}>
          <SidebarContainer width={sidebarWidth}>
            <AnnotatorSidebar read_only={true} />
          </SidebarContainer>
          <CenterOnPage>
            <div>
              <Header as="h2" icon>
                <Icon size="mini" name="file alternate outline" />
                Loading Document Data
                <Header.Subheader>
                  Hang tight while we fetch the document and annotations.
                </Header.Subheader>
              </Header>
            </div>
            <Progress style={{ width: "50%" }} percent={progress} indicating />
          </CenterOnPage>
        </WithSidebar>
      );
      break;
    case ViewState.NOT_FOUND:
      rendered_component = (
        <WithSidebar width={sidebarWidth}>
          <SidebarContainer width={sidebarWidth}>
            <AnnotatorSidebar read_only={true} />
          </SidebarContainer>
          <CenterOnPage>
            <Result status="unknown" title="PDF Not Found" />
          </CenterOnPage>
        </WithSidebar>
      );
      break;
    case ViewState.LOADED:
      rendered_component = (
        <PDFView
          doc_permissions={doc_permissions}
          corpus_permissions={corpus_permissions}
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
          scroll_to_annotation_on_open={scroll_to_annotation_on_open}
          doc={doc}
          doc_text={doc_text}
          page_token_text_maps={pageTextMaps ? pageTextMaps : {}}
          pages={pages}
          labels={span_labels}
          relationLabels={relation_labels}
          docTypeLabels={doc_type_labels}
          setViewState={setViewState}
          shiftDown={shiftDown}
        />
      );
      break;
    // eslint-disable-line: no-fallthrough
    case ViewState.ERROR:
      rendered_component = (
        <WithSidebar width={sidebarWidth}>
          <SidebarContainer width={sidebarWidth}>
            <AnnotatorSidebar read_only={true} />
          </SidebarContainer>
          <CenterOnPage>
            <Result status="warning" title="Unable to Render Document" />
          </CenterOnPage>
        </WithSidebar>
      );
      break;
  }

  return (
    <Modal closeIcon open={open} onClose={onClose} size="fullscreen">
      <Modal.Content
        style={{ padding: "0px", height: "90vh", overflowY: "hidden" }}
      >
        {rendered_component}
      </Modal.Content>
    </Modal>
  );
};
