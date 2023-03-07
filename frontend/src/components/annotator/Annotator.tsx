import { useMutation, useQuery, useReactiveVar } from "@apollo/client";
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
import { CenterOnPage, WithSidebar } from ".";
import { SidebarContainer } from "../common";
import { getPawlsLayer } from "./api/rest";
import {
  AnnotationLabelType,
  CorpusType,
  DocumentType,
  LabelDisplayBehavior,
  LabelType,
  ServerAnnotationType,
} from "../../graphql/types";
import {
  ViewState,
  PageTokens,
  TokenId,
  PermissionTypes,
  LooseObject,
  Token,
} from "../types";
import { SemanticICONS } from "semantic-ui-react/dist/commonjs/generic";
import { toast } from "react-toastify";
import { Result } from "../widgets/data-display/Result";
import { createTokenStringSearch } from "./utils";
import { getPermissions } from "../../utils/transform";
import _ from "lodash";
import {
  displayAnnotationOnAnnotatorLoad,
  pagesVisible,
  selectedAnalysesIds,
} from "../../graphql/cache";
import useWindowDimensions from "../hooks/WindowDimensionHook";

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
  opened_document: DocumentType;
  opened_corpus: CorpusType;
  read_only: boolean;
  scroll_to_annotation_on_open: ServerAnnotationType | null;
  show_selected_annotation_only: boolean;
  show_annotation_bounding_boxes: boolean;
  show_annotation_labels: LabelDisplayBehavior;
  onClose: (args?: any) => void | any;
}

export const Annotator = ({
  open,
  opened_document: openedDocument,
  opened_corpus: openedCorpus,
  read_only,
  scroll_to_annotation_on_open,
  show_selected_annotation_only,
  show_annotation_bounding_boxes,
  show_annotation_labels,
  onClose,
}: AnnotatorProps) => {
  const { width } = useWindowDimensions();
  const responsive_sidebar_width = width <= 1000 ? "0px" : "400px";

  const selected_analysis_ids = useReactiveVar(selectedAnalysesIds);
  // console.log("selected_analysis_ids", selected_analysis_ids);

  const [pdfAnnotations, setPdfAnnotations] = useState<PdfAnnotations>(
    new PdfAnnotations([], [], [])
  );

  const [pages_visible, setPagesVisible] = useState<
    Record<number, "VISIBLE" | "NOT VISIBLE">
  >(
    scroll_to_annotation_on_open
      ? { [scroll_to_annotation_on_open.page]: "VISIBLE" }
      : { 1: "VISIBLE" }
  );
  const [viewState, setViewState] = useState<ViewState>(ViewState.LOADING);
  const [doc, setDocument] = useState<PDFDocumentProxy>();
  const [pages, setPages] = useState<PDFPageInfo[]>([]);
  const [pageTextMaps, setPageTextMaps] = useState<Record<number, TokenId>>();
  const [doc_text, setDocText] = useState<string>("");
  const [loaded_page_for_annotation, setLoadedPageForAnnotation] =
    useState<ServerAnnotationType | null>(null);
  const [jumped_to_annotation_on_load, setJumpedToAnnotationOnLoad] = useState<
    string | null
  >(null);
  const [loaded_pages, setLoadedPages] = useState<Set<number>>(new Set([1])); // Page 1 loaded on mount

  // Hold all span labels displayable between analyzers and human labelset
  const [span_labels, setSpanLabels] = useState<AnnotationLabelType[]>([]);

  // Hold span labels selectable for human annotation only
  const [human_span_labels, setHumanSpanLabels] = useState<
    AnnotationLabelType[]
  >([]);

  const initial_query_vars = {
    pageNumberList: "1",
    selectedDocumentId: openedDocument.id,
    selectedCorpusId: openedCorpus.id,
    ...(scroll_to_annotation_on_open
      ? {
          pageContainingAnnotationWithId: scroll_to_annotation_on_open.id,
        }
      : {}),
    ...(Array.isArray(selected_analysis_ids) && selected_analysis_ids.length > 0
      ? {
          forAnalysisIds: selected_analysis_ids.join(),
        }
      : {}),
    ...(scroll_to_annotation_on_open?.analysis
      ? {
          forAnalysisIds: scroll_to_annotation_on_open.analysis.id,
        }
      : {}),
  };

  const setPageVisible = (
    page_number: number,
    state: "VISIBLE" | "NOT VISIBLE"
  ) => {
    setPagesVisible((old_pages_visible) => {
      return {
        ...old_pages_visible,
        [page_number]: state,
      };
    });
  };

  // Hold our query variables (using a state var lets us bundle updates to the
  // query var in a single useEffect that prevents multiple re-renders)
  const [annotator_query_vars, setAnnotatorQueryVars] =
    useState<Record<string, any>>(initial_query_vars);

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

  // Refs for canvas containers
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

  // Once the query is built, use apollo's useQuery hook to request data
  const {
    refetch: refetch_annotator,
    loading: annotator_loading,
    data: annotator_data,
    error: annotator_error,
    fetchMore: fetchMoreAnnotatorData,
  } = useQuery<
    RequestAnnotatorDataForDocumentOutputs,
    RequestAnnotatorDataForDocumentInputs
  >(REQUEST_ANNOTATOR_DATA_FOR_DOCUMENT, {
    variables: initial_query_vars as RequestAnnotatorDataForDocumentInputs,
    notifyOnNetworkStatusChange: true, // required to get loading signal on fetchMore
  });

  // When selected analyzers change reload data... NOTE there is a more efficient way to do this but this is ok for now
  useEffect(() => {
    // console.log("selected_analysis_ids is different.");

    // Store query vars
    const pages_to_load = Object.keys(pages_visible)
      .map((p) => Number(p))
      .filter((p) => pages_visible[p] === "VISIBLE");
    // console.log("Pages to load after changing analyzer", pages_to_load);
    setAnnotatorQueryVars((old_query_vars: Record<string, any>) => {
      let new_query_vars = {
        ...old_query_vars,
        ...{
          pageNumberList: pages_to_load.join(),
          ...(Array.isArray(selected_analysis_ids) &&
          selected_analysis_ids.length > 0
            ? {
                forAnalysisIds: selected_analysis_ids.join(),
              }
            : {}),
        },
      };

      if (
        selected_analysis_ids.length === 0 &&
        new_query_vars.hasOwnProperty("forAnalysisIds")
      ) {
        delete new_query_vars["forAnalysisIds"];
      }

      // Once we successfully get new page(s) of annotations... reset loaded pages
      // with JUST the most recently returned pages as we've switched the analysis
      // we're viewing and don't care if we loaded annotations on other pages for a **DIFFERENT**
      // analysis / human annotation
      refetch_annotator(new_query_vars).then(() => {
        setLoadedPages(new Set(pages_to_load));
      });

      return new_query_vars;
    });
  }, [selected_analysis_ids]);

  // When the opened document is changed... reload...
  useEffect(() => {
    // console.log("Anotator - openedDocument changed");
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

          console.log("Response", resp);

          // Load all the pages too. In theory this makes things a little slower to startup,
          // as fetching and rendering them asynchronously would make it faster to render the
          // first, visible page. That said it makes the code simpler, so we're ok with it for
          // now.
          const loadPages: Promise<PDFPageInfo>[] = [];
          for (let i = 1; i <= doc.numPages; i++) {
            // See line 50 for an explanation of the cast here.
            loadPages.push(
              doc.getPage(i).then((p) => {
                let pageTokens: Token[] = [];
                if (resp.length === 0) {
                  toast.error(
                    "Token layer isn't available for this document... annotations can't be displayed."
                  );
                  // console.log("Loading up some data for page ", i, p);
                } else {
                  // console.log("Loading up some data for page ", i, p);
                  const pageIndex = p.pageNumber - 1;

                  console.log("pageIndex", pageIndex);
                  pageTokens = resp[pageIndex].tokens;
                }

                // console.log("Tokens", pageTokens);
                return new PDFPageInfo(p, pageTokens);
              }) as unknown as Promise<PDFPageInfo>
            );
          }
          return Promise.all(loadPages);
        })
        .then((pages) => {
          setPages(pages);

          let { doc_text, string_index_token_map } =
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
    // console.log("New Annotator data", annotator_data);

    // We only want to load annotation page for selected annotation on load ONCE
    if (
      scroll_to_annotation_on_open !== null &&
      loaded_page_for_annotation === null &&
      jumped_to_annotation_on_load !== scroll_to_annotation_on_open.id
    ) {
      setLoadedPageForAnnotation(scroll_to_annotation_on_open);
      // console.log(
      //   "setLoadedPageForAnnotation - scroll_to_annotation_on_open",
      //   scroll_to_annotation_on_open
      // );
    }

    if (annotator_data) {
      // Build proper span label objs from GraphQL results
      let span_label_lookup: LooseObject = {};
      let human_span_label_lookup: LooseObject = {};

      if (annotator_data?.corpus?.labelSet?.allAnnotationLabels) {
        span_label_lookup = {
          ...span_label_lookup,
          ...annotator_data.corpus.labelSet.allAnnotationLabels
            .filter((label) => label.labelType === LabelType.TokenLabel)
            .reduce(function (obj: Record<string, any>, label) {
              obj[label.id] = {
                id: label.id,
                color: label.color,
                text: label.text,
                icon: label.icon as SemanticICONS,
                description: label.description,
                labelType: label.labelType,
              };
              return obj;
            }, {}),
        };

        // console.log(
        //   "Span choices",
        //   annotator_data.corpus.labelSet.allAnnotationLabels
        // );
        human_span_label_lookup = {
          ...span_label_lookup,
          ...annotator_data.corpus.labelSet.allAnnotationLabels
            .filter((label) => label.labelType === LabelType.TokenLabel)
            .filter((label) => label.analyzer === null)
            .reduce(function (obj: Record<string, any>, label) {
              obj[label.id] = {
                id: label.id,
                color: label.color,
                text: label.text,
                icon: label.icon as SemanticICONS,
                description: label.description,
                labelType: label.labelType,
              };
              return obj;
            }, {}),
        };
        // console.log("human_span_label_choices", human_span_label_lookup);
      }

      // If we're looking at an analysis, make sure we get required labels
      if (selected_analysis_ids && selected_analysis_ids.length > 0) {
        let annotation_label_list: AnnotationLabelType[] = [];
        if (annotator_data?.selectedAnalyzersWithLabels?.edges) {
          for (let analyzer of annotator_data.selectedAnalyzersWithLabels
            .edges) {
            if (Array.isArray(analyzer.node.fullLabelList)) {
              annotation_label_list = annotation_label_list.concat(
                analyzer.node.fullLabelList
              );
            }
          }
          annotation_label_list = _.uniqBy(annotation_label_list, "id");
        }

        span_label_lookup = {
          ...span_label_lookup,
          ...annotation_label_list.reduce(function (
            obj: Record<string, any>,
            annot_label
          ) {
            obj[annot_label.id] = {
              id: annot_label.id,
              color: annot_label.color,
              text: annot_label.text,
              icon: annot_label.icon as SemanticICONS,
              description: annot_label.description,
              labelType: annot_label.labelType,
            };
            return obj;
          },
          {}),
        };
      }

      setHumanSpanLabels(Object.values(human_span_label_lookup));
      setSpanLabels(Object.values(span_label_lookup));

      // Build proper relationship label objs from GraphQL results
      let relationship_label_lookup: LooseObject = {};
      if (annotator_data?.corpus?.labelSet?.allAnnotationLabels) {
        relationship_label_lookup = {
          ...relationship_label_lookup,
          ...annotator_data.corpus.labelSet.allAnnotationLabels
            .filter((label) => label.labelType === LabelType.RelationshipLabel)
            .reduce(function (obj: Record<string, any>, label) {
              obj[label.id] = {
                id: label.id,
                color: label.color,
                text: label.text,
                icon: label.icon as SemanticICONS,
                description: label.description,
                labelType: label.labelType,
              };
              return obj;
            }, {}),
        };
      }
      setRelationLabels(Object.values(relationship_label_lookup));

      // Build proper doc type label objs from GraphQL results
      let document_label_lookup: LooseObject = {};

      if (annotator_data?.corpus?.labelSet.allAnnotationLabels) {
        document_label_lookup = {
          ...document_label_lookup,
          ...annotator_data.corpus.labelSet.allAnnotationLabels
            .filter((label) => label.labelType === LabelType.DocTypeLabel)
            .reduce(function (obj: Record<string, any>, label) {
              obj[label.id] = {
                id: label.id,
                color: label.color,
                text: label.text,
                icon: label.icon as SemanticICONS,
                description: label.description,
                labelType: label.labelType,
              };
              return obj;
            }, {}),
        };
      }
      setDocTypeLabels(Object.values(document_label_lookup));

      // Turn existing annotation data into PDFAnnotations obj and inject into state:
      let annotation_objs: ServerAnnotation[] = [];
      if (
        annotator_data?.existingTextAnnotations &&
        selected_analysis_ids?.length === 0
      ) {
        console.log("Prepping human annotations", annotator_data);
        annotation_objs = annotator_data.existingTextAnnotations
          .filter((annotation) => annotation.analysis == null)
          .map(
            (e) =>
              new ServerAnnotation(
                e.page,
                e.annotationLabel,
                e.rawText ? e.rawText : "",
                e.json ? e.json : {},
                e.myPermissions ? getPermissions(e.myPermissions) : [],
                e.id
              )
          );
        // console.log("Got manual annotation objs: ", annotation_objs);
      } else if (
        selected_analysis_ids &&
        selected_analysis_ids.length > 0 &&
        annotator_data?.existingTextAnnotations
      ) {
        annotation_objs = annotator_data.existingTextAnnotations
          .filter((annotation) => annotation.analysis !== null)
          .map(
            (annot) =>
              new ServerAnnotation(
                annot.page,
                annot.annotationLabel,
                annot.rawText ? annot.rawText : "",
                annot.json ? annot.json : {},
                annot.myPermissions ? getPermissions(annot.myPermissions) : [],
                annot.id
              )
          );
      }

      let doc_type_annotations: DocTypeAnnotation[] = [];

      if (annotator_data?.existingDocLabelAnnotations) {
        // console.log("There are existingDocLabelAnnotations", annotator_data.existingDocLabelAnnotations);

        doc_type_annotations = annotator_data.existingDocLabelAnnotations.map(
          (annot) => {
            let label_obj = annot.annotationLabel;
            try {
              label_obj = document_label_lookup[label_obj.id];
            } catch {}
            return new DocTypeAnnotation(
              label_obj,
              annot.myPermissions ? getPermissions(annot.myPermissions) : [],
              annot.id
            );
          }
        );
      }

      let relationship_annotations: RelationGroup[] = [];

      if (annotator_data?.existingRelationships) {
        annotator_data.existingRelationships.map((relationship) => {
          let label_obj = relationship.relationshipLabel;
          if (label_obj) {
            try {
              label_obj = relationship_label_lookup[label_obj.id];
            } catch {}
          }
          let source_ids = relationship.sourceAnnotations.edges
            .filter(
              (relationship) =>
                relationship && relationship.node && relationship.node.id
            )
            .map((relationship) => relationship?.node?.id);
          let target_ids = relationship.targetAnnotations.edges
            .filter(
              (relationship) =>
                relationship && relationship.node && relationship.node.id
            )
            .map((relationship) => relationship?.node?.id);
          return new RelationGroup(
            source_ids as string[],
            target_ids as string[],
            label_obj,
            relationship.id
          );
        });
      }

      // add our loaded annotations from the backend into local state
      // console.log("Final anotation list", annotation_objs);
      setPdfAnnotations(
        new PdfAnnotations(
          annotation_objs,
          relationship_annotations,
          doc_type_annotations
        )
      );

      // Set up contexts for annotations
      setViewState(ViewState.LOADED);
    }
  }, [annotator_data]);

  useEffect(() => {
    if (annotator_error) {
      toast.error(
        "Sorry, something went wrong!\nUnable to fetch required data to open annotations for this document and corpus."
      );
    }
  }, [annotator_error]);

  useEffect(() => {
    console.log("Mounted");
  }, []);

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

  let rendered_component = <></>;
  switch (viewState) {
    case ViewState.LOADING:
      rendered_component = (
        <WithSidebar width={responsive_sidebar_width}>
          <SidebarContainer
            width={responsive_sidebar_width}
            {...(responsive_sidebar_width ? { display: "none" } : {})}
          >
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
        <WithSidebar width={responsive_sidebar_width}>
          <SidebarContainer
            width={responsive_sidebar_width}
            {...(responsive_sidebar_width ? { display: "none" } : {})}
          >
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
          spanLabels={span_labels}
          humanSpanLabelChoices={human_span_labels}
          relationLabels={relation_labels}
          docTypeLabels={doc_type_labels}
          setViewState={setViewState}
          shiftDown={shiftDown}
          // setPageVisible={setPageVisible}
        />
      );
      break;
    // eslint-disable-line: no-fallthrough
    case ViewState.ERROR:
      rendered_component = (
        <WithSidebar width={responsive_sidebar_width}>
          <SidebarContainer
            width={responsive_sidebar_width}
            {...(responsive_sidebar_width ? { display: "none" } : {})}
          >
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
    <Modal
      className="AnnotatorModal"
      closeIcon
      open={open}
      onClose={onClose}
      size="fullscreen"
    >
      <Modal.Content
        className="AnnotatorModalContent"
        style={{ padding: "0px", height: "90vh", overflow: "hidden" }}
      >
        {rendered_component}
      </Modal.Content>
    </Modal>
  );
};
