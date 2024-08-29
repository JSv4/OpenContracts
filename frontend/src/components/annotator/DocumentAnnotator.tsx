import { useQuery, useReactiveVar } from "@apollo/client";
import { useEffect, useState } from "react";

import {
  DocTypeAnnotation,
  PDFPageInfo,
  RelationGroup,
  ServerAnnotation,
} from "./context";
import {
  REQUEST_PAGE_ANNOTATION_DATA,
  RequestPageAnnotationDataOutputs,
  RequestPageAnnotationDataInputs,
} from "../../graphql/queries";
import {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
} from "pdfjs-dist/types/src/display/api";

import { getPawlsLayer } from "./api/rest";
import {
  AnnotationLabelType,
  DocumentType,
  LabelDisplayBehavior,
  LabelType,
  RelationshipTypeEdge,
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
import { createTokenStringSearch } from "./utils";
import { getPermissions } from "../../utils/transform";
import _ from "lodash";
import {
  displayAnnotationOnAnnotatorLoad,
  onlyDisplayTheseAnnotations,
  selectedAnalysesIds,
} from "../../graphql/cache";
import { Header, Icon, Modal, Progress } from "semantic-ui-react";
import AnnotatorSidebar from "./sidebar/AnnotatorSidebar";
import { WithSidebar } from "./common";
import { Result } from "../widgets/data-display/Result";
import { SidebarContainer } from "../common";
import { CenterOnPage } from "./CenterOnPage";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { AnnotatorRenderer } from "./AnnotatorRenderer";

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

interface DocumentAnnotatorProps {
  open: boolean;
  opened_document: DocumentType;
  read_only: boolean;
  scroll_to_annotation_on_open: ServerAnnotationType | null;
  display_annotations: ServerAnnotationType[];
  show_selected_annotation_only: boolean;
  show_annotation_bounding_boxes: boolean;
  show_annotation_labels: LabelDisplayBehavior;
  onClose: (args?: any) => void | any;
}

export const DocumentAnnotator = ({
  open,
  opened_document,
  display_annotations,
  read_only,
  scroll_to_annotation_on_open,
  show_selected_annotation_only,
  show_annotation_bounding_boxes,
  show_annotation_labels,
  onClose,
}: DocumentAnnotatorProps) => {
  const { width } = useWindowDimensions();
  const responsive_sidebar_width = width <= 1000 ? "0px" : "400px";

  const selected_analysis_ids = useReactiveVar(selectedAnalysesIds);

  const [viewState, setViewState] = useState<ViewState>(ViewState.LOADING);
  const [doc, setDocument] = useState<PDFDocumentProxy>();
  const [pages, setPages] = useState<PDFPageInfo[]>([]);
  const [pageTextMaps, setPageTextMaps] = useState<Record<number, TokenId>>();
  const [loaded_page_for_annotation, setLoadedPageForAnnotation] =
    useState<ServerAnnotationType | null>(null);
  const [jumped_to_annotation_on_load, setJumpedToAnnotationOnLoad] = useState<
    string | null
  >(null);

  // Hold all span labels displayable between analyzers and human labelset
  const [span_labels, setSpanLabels] = useState<AnnotationLabelType[]>([]);

  // Hold span labels selectable for human annotation only
  const [human_span_labels, setHumanSpanLabels] = useState<
    AnnotationLabelType[]
  >([]);

  const initial_query_vars = {
    pageNumberList: "1",
    selectedDocumentId: opened_document.id,
    preloadAnnotations: display_annotations !== undefined,
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

  const [relation_labels, setRelationLabels] = useState<AnnotationLabelType[]>(
    []
  );
  const [doc_type_labels, setDocTypeLabels] = useState<AnnotationLabelType[]>(
    []
  );
  const [annotation_objs, setAnnotationObjs] = useState<ServerAnnotation[]>([]);
  const [relationship_annotations, setRelationshipAnnotations] = useState<
    RelationGroup[]
  >([]);
  const [doc_type_annotations, setDocTypeAnnotations] = useState<
    DocTypeAnnotation[]
  >([]);
  const [progress, setProgress] = useState(0);

  let doc_permissions: PermissionTypes[] = [];
  let raw_permissions = opened_document.myPermissions;
  if (opened_document && raw_permissions !== undefined) {
    doc_permissions = getPermissions(raw_permissions);
  }

  // When unmounting... ensure we turn off limiting to provided set of annotations
  useEffect(() => {
    return () => {
      onlyDisplayTheseAnnotations(undefined);
    };
  }, []);

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
    RequestPageAnnotationDataOutputs,
    RequestPageAnnotationDataInputs
  >(REQUEST_PAGE_ANNOTATION_DATA, {
    variables: { selectedDocumentId: opened_document.id },
    notifyOnNetworkStatusChange: true, // required to get loading signal on fetchMore
  });

  // When selected analyzers change reload data... NOTE there is a more efficient way to do this but this is ok for now
  useEffect(() => {
    // console.log("selected_analysis_ids is different.");

    // Once we successfully get new page(s) of annotations... reset loaded pages
    // with JUST the most recently returned pages as we've switched the analysis
    // we're viewing and don't care if we loaded annotations on other pages for a **DIFFERENT**
    // analysis / human annotation
    refetch_annotator({ selectedDocumentId: opened_document.id });
  }, [opened_document]);

  // When the opened document is changed... reload...
  useEffect(() => {
    console.log("DocumentAnotator - opened_document changed", opened_document);
    if (opened_document && opened_document.pdfFile) {
      console.log("Load pdf from ", opened_document.pdfFile);

      setViewState(ViewState.LOADING);

      const loadingTask: PDFDocumentLoadingTask = pdfjsLib.getDocument(
        opened_document.pdfFile
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
          opened_document?.pawlsParseFile ? opened_document.pawlsParseFile : ""
        ),
      ])
        .then(([doc, resp]: [PDFDocumentProxy, PageTokens[]]) => {
          console.log("Doc loaded?", doc);
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
  }, [opened_document]);

  useEffect(() => {
    // When modal is hidden, ensure we reset state and clear provided annotations to display
    if (!open) {
      onlyDisplayTheseAnnotations(undefined);
    }
  }, [open]);

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

    // TODO - use display_annotations if they're provided
    if (annotator_data) {
      // Build proper span label objs from GraphQL results
      // Build proper doc type label objs from GraphQL results
      let span_label_lookup: LooseObject = {};
      let human_span_label_lookup: LooseObject = {};
      let relationship_label_lookup: LooseObject = {};
      let document_label_lookup: LooseObject = {};

      // If we passed a specific group of annotations in for rendering, we're going to take a very different pathway here and just extract all relationships,
      // annotations and label lookups from the passed in annotations.
      if (display_annotations !== undefined) {
        // Extract unique annotation labels from display_annotations
        const uniqueAnnotationLabels = [
          ...new Set(
            display_annotations.map((annotation) => annotation.annotationLabel)
          ),
        ];

        // Build span_label_lookup
        span_label_lookup = uniqueAnnotationLabels
          .filter((label) => label.labelType === LabelType.TokenLabel)
          .reduce((obj: Record<string, any>, label) => {
            obj[label.id] = {
              id: label.id,
              color: label.color,
              text: label.text,
              icon: label.icon as SemanticICONS,
              description: label.description,
              labelType: label.labelType,
            };
            return obj;
          }, {});

        // Build relationship_label_lookup
        relationship_label_lookup = uniqueAnnotationLabels
          .filter((label) => label.labelType === LabelType.RelationshipLabel)
          .reduce((obj: Record<string, any>, label) => {
            obj[label.id] = {
              id: label.id,
              color: label.color,
              text: label.text,
              icon: label.icon as SemanticICONS,
              description: label.description,
              labelType: label.labelType,
            };
            return obj;
          }, {});

        // Build document_label_lookup
        document_label_lookup = uniqueAnnotationLabels
          .filter((label) => label.labelType === LabelType.DocTypeLabel)
          .reduce((obj: Record<string, any>, label) => {
            obj[label.id] = {
              id: label.id,
              color: label.color,
              text: label.text,
              icon: label.icon as SemanticICONS,
              description: label.description,
              labelType: label.labelType,
            };
            return obj;
          }, {});

        // Build annotation_objs
        setAnnotationObjs(
          display_annotations.map(
            (annotation) =>
              new ServerAnnotation(
                annotation.page,
                annotation.annotationLabel,
                annotation.rawText ? annotation.rawText : "",
                annotation.json ? annotation.json : {},
                annotation.myPermissions
                  ? getPermissions(annotation.myPermissions)
                  : [],
                annotation.id
              )
          )
        );

        // Build doc_type_annotations
        setDocTypeAnnotations(
          display_annotations
            .filter(
              (annotation) =>
                annotation.annotationLabel.labelType === LabelType.DocTypeLabel
            )
            .map((annotation) => {
              let label_obj = annotation.annotationLabel;
              try {
                label_obj = document_label_lookup[label_obj.id];
              } catch {}
              return new DocTypeAnnotation(
                label_obj,
                annotation.myPermissions
                  ? getPermissions(annotation.myPermissions)
                  : [],
                annotation.id
              );
            })
        );
        console.log("display_annotations", display_annotations);

        // Build relationship_annotations
        const uniqueRelationships = [
          ...new Set(
            display_annotations.flatMap((annotation) =>
              annotation?.sourceNodeInRelationships?.edges
                ? annotation.sourceNodeInRelationships.edges
                    .concat(annotation.targetNodeInRelationships.edges)
                    .filter(
                      (
                        x: RelationshipTypeEdge | null
                      ): x is RelationshipTypeEdge => x !== null
                    )
                    .map((edge) => edge.node)
                : []
            )
          ),
        ];

        setRelationshipAnnotations(
          uniqueRelationships.map((relationship) => {
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
          })
        );
      } else {
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
        // Build proper relationship label objs from GraphQL results
        if (annotator_data?.corpus?.labelSet?.allAnnotationLabels) {
          relationship_label_lookup = {
            ...relationship_label_lookup,
            ...annotator_data.corpus.labelSet.allAnnotationLabels
              .filter(
                (label) => label.labelType === LabelType.RelationshipLabel
              )
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
        if (annotator_data?.corpus?.labelSet?.allAnnotationLabels) {
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

        // Turn existing annotation data into PDFAnnotations obj and inject into state:
        // Case 1 is where an "Analysis" is not selected
        if (
          annotator_data?.existingTextAnnotations &&
          selected_analysis_ids?.length === 0
        ) {
          console.log("Prepping human annotations", annotator_data);
          setAnnotationObjs(
            annotator_data.existingTextAnnotations
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
              )
          );
          // console.log("Got manual annotation objs: ", annotation_objs);
        }
        // If an analysis is selected... load THOSE annotations
        else if (
          selected_analysis_ids &&
          selected_analysis_ids.length > 0 &&
          annotator_data?.existingTextAnnotations
        ) {
          setAnnotationObjs(
            annotator_data.existingTextAnnotations
              .filter((annotation) => annotation.analysis !== null)
              .map(
                (annot) =>
                  new ServerAnnotation(
                    annot.page,
                    annot.annotationLabel,
                    annot.rawText ? annot.rawText : "",
                    annot.json ? annot.json : {},
                    annot.myPermissions
                      ? getPermissions(annot.myPermissions)
                      : [],
                    annot.id
                  )
              )
          );
        }

        // Load doc-level labels
        if (annotator_data?.existingDocLabelAnnotations) {
          // console.log("There are existingDocLabelAnnotations", annotator_data.existingDocLabelAnnotations);

          setDocTypeAnnotations(
            annotator_data.existingDocLabelAnnotations.map((annot) => {
              let label_obj = annot.annotationLabel;
              try {
                label_obj = document_label_lookup[label_obj.id];
              } catch {}
              return new DocTypeAnnotation(
                label_obj,
                annot.myPermissions ? getPermissions(annot.myPermissions) : [],
                annot.id
              );
            })
          );
        }

        // Load relationships
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
      }

      setHumanSpanLabels(Object.values(human_span_label_lookup));
      setSpanLabels(Object.values(span_label_lookup));
      setRelationLabels(Object.values(relationship_label_lookup));
      setDocTypeLabels(Object.values(document_label_lookup));

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

  let rendered_component = <></>;
  switch (viewState) {
    case ViewState.LOADING:
      rendered_component = (
        <WithSidebar width={responsive_sidebar_width}>
          <SidebarContainer
            width={responsive_sidebar_width}
            {...(responsive_sidebar_width ? { display: "none" } : {})}
          >
            <AnnotatorSidebar
              read_only={true}
              opened_document={opened_document}
              allowInput={false}
              editMode="ANNOTATE"
              setEditMode={(v: "ANALYZE" | "ANNOTATE") => {}}
              setAllowInput={(v: boolean) => {}}
            />
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
            <AnnotatorSidebar
              read_only={true}
              opened_document={opened_document}
              allowInput={false}
              editMode="ANNOTATE"
              setEditMode={(v: "ANALYZE" | "ANNOTATE") => {}}
              setAllowInput={(v: boolean) => {}}
            />
          </SidebarContainer>
          <CenterOnPage>
            <Result status="unknown" title="PDF Not Found" />
          </CenterOnPage>
        </WithSidebar>
      );
      break;
    case ViewState.LOADED:
      console.log("Viewstate LOADED");
      if (doc) {
        console.log("Doc defined...");
        rendered_component = (
          <AnnotatorRenderer
            open={open}
            doc={doc}
            pages={pages}
            load_progress={progress}
            opened_document={opened_document}
            display_annotations={display_annotations}
            read_only={read_only}
            scroll_to_annotation_on_open={scroll_to_annotation_on_open}
            show_selected_annotation_only={show_selected_annotation_only}
            show_annotation_bounding_boxes={show_annotation_bounding_boxes}
            show_annotation_labels={show_annotation_labels}
            span_labels={span_labels}
            human_span_labels={human_span_labels}
            relationship_labels={relation_labels}
            document_labels={doc_type_labels}
            annotation_objs={annotation_objs}
            editMode="ANALYZE"
            allowInput={false}
            setEditMode={(v: "ANALYZE" | "ANNOTATE") => {}}
            setAllowInput={(v: boolean) => {}}
            doc_type_annotations={doc_type_annotations}
            relationship_annotations={relationship_annotations}
            onError={setViewState}
          />
        );
      }
      break;
    // eslint-disable-line: no-fallthrough
    case ViewState.ERROR:
      rendered_component = (
        <WithSidebar width={responsive_sidebar_width}>
          <SidebarContainer
            width={responsive_sidebar_width}
            {...(responsive_sidebar_width ? { display: "none" } : {})}
          >
            <AnnotatorSidebar
              read_only={true}
              opened_document={opened_document}
              allowInput={false}
              editMode="ANNOTATE"
              setEditMode={(v: "ANALYZE" | "ANNOTATE") => {}}
              setAllowInput={(v: boolean) => {}}
            />
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
