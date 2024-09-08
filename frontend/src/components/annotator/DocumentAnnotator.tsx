import { useLazyQuery, useQuery, useReactiveVar } from "@apollo/client";
import { useEffect, useState } from "react";

import {
  DocTypeAnnotation,
  PDFPageInfo,
  RelationGroup,
  ServerAnnotation,
} from "./context";
import {
  GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
  GetDocumentAnalysesAndExtractsOutput,
  GetDocumentAnalysesAndExtractsInput,
  GET_DATACELLS_FOR_EXTRACT,
  GET_ANNOTATIONS_FOR_ANALYSIS,
  GetAnnotationsForAnalysisOutput,
  GetAnnotationsForAnalysisInput,
  GetDatacellsForExtractOutput,
  GetDatacellsForExtractInput,
  GET_DOCUMENT_ANNOTATIONS_AND_RELATIONSHIPS,
  GetDocumentAnnotationsAndRelationshipsOutput,
  GetDocumentAnnotationsAndRelationshipsInput,
} from "../../graphql/queries";
import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

import { getPawlsLayer } from "./api/rest";
import {
  AnalysisRowType,
  AnalysisType,
  AnnotationLabelType,
  ColumnType,
  CorpusType,
  DatacellType,
  DocumentType,
  ExtractType,
  LabelDisplayBehavior,
  LabelType,
  ServerAnnotationType,
} from "../../graphql/types";
import {
  ViewState,
  TokenId,
  PermissionTypes,
  PageTokens,
  Token,
  label_display_options,
} from "../types";
import {
  convertToDocTypeAnnotation,
  convertToServerAnnotation,
  convertToServerAnnotations,
  getPermissions,
} from "../../utils/transform";
import _ from "lodash";
import {
  allowUserInput,
  displayAnnotationOnAnnotatorLoad,
  editMode,
  onlyDisplayTheseAnnotations,
  pdfZoomFactor,
  selectedAnalysis,
  selectedExtract,
  showAnnotationBoundingBoxes,
  showAnnotationLabels,
  showSelectedAnnotationOnly,
  showStructuralAnnotations,
  viewStateVar,
} from "../../graphql/cache";
import { Header, Icon, Modal, Progress } from "semantic-ui-react";
import AnnotatorSidebar from "./sidebar/AnnotatorSidebar";
import { WithSidebar } from "./common";
import { Result } from "../widgets/data-display/Result";
import { SidebarContainer } from "../common";
import { CenterOnPage } from "./CenterOnPage";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { AnnotatorRenderer } from "./display/AnnotatorRenderer";
import { PDFDocumentLoadingTask } from "pdfjs-dist";
import { toast } from "react-toastify";
import { createTokenStringSearch } from "./utils";
import { ViewSettingsPopup } from "../widgets/popups/ViewSettingsPopup";

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
  opened_corpus?: CorpusType;
  read_only: boolean;
  show_selected_annotation_only: boolean;
  show_annotation_bounding_boxes: boolean;
  show_annotation_labels: LabelDisplayBehavior;
  onClose: (args?: any) => void | any;
}

export const DocumentAnnotator = ({
  open,
  opened_document,
  opened_corpus,
  read_only,
  show_selected_annotation_only,
  show_annotation_bounding_boxes,
  show_annotation_labels,
  onClose,
}: DocumentAnnotatorProps) => {
  const { width } = useWindowDimensions();
  const responsive_sidebar_width = width <= 1000 ? "0px" : "400px";

  const view_state = useReactiveVar(viewStateVar);
  const edit_mode = useReactiveVar(editMode);
  const allow_input = useReactiveVar(allowUserInput);
  const zoom_level = useReactiveVar(pdfZoomFactor);
  const show_structural_annotations = useReactiveVar(showStructuralAnnotations);
  const label_display_behavior = useReactiveVar(showAnnotationLabels);
  const setZoomLevel = (zl: number) => pdfZoomFactor(zl);

  // Global state variables to jump to and/or load certain annotations on load
  const scrollToAnnotation = useReactiveVar(displayAnnotationOnAnnotatorLoad);
  const displayOnlyTheseAnnotations = useReactiveVar(
    onlyDisplayTheseAnnotations
  );

  const [doc, setDocument] = useState<PDFDocumentProxy>();

  // Hook 16
  const [pages, setPages] = useState<PDFPageInfo[]>([]);

  // Hook 17
  const [pageTextMaps, setPageTextMaps] = useState<Record<number, TokenId>>();

  // New states for analyses and extracts
  const [analyses, setAnalyses] = useState<AnalysisType[]>([]);
  const [extracts, setExtracts] = useState<ExtractType[]>([]);
  const selected_analysis = useReactiveVar(selectedAnalysis);
  const selected_extract = useReactiveVar(selectedExtract);

  // Hook 22
  const [structuralAnnotations, setStructuralAnnotations] = useState<
    ServerAnnotation[]
  >([]);
  const [annotation_objs, setAnnotationObjs] = useState<ServerAnnotation[]>([]);
  const [doc_type_annotations, setDocTypeAnnotations] = useState<
    DocTypeAnnotation[]
  >([]);
  const [relationship_annotations, setRelationshipAnnotations] = useState<
    RelationGroup[]
  >([]);
  const [analysisRows, setAnalysisRows] = useState<AnalysisRowType[]>([]);
  const [data_cells, setDataCells] = useState<DatacellType[]>([]);
  const [columns, setColumns] = useState<ColumnType[]>([]);

  // Hold our query variables (using a state var lets us bundle updates to the
  // query var in a single useEffect that prevents multiple re-renders)
  const [relation_labels, setRelationLabels] = useState<AnnotationLabelType[]>(
    []
  );
  const [doc_type_labels, setDocTypeLabels] = useState<AnnotationLabelType[]>(
    []
  );

  // Hook 31 - progress is trigger LOTS of initial rerenders...
  const [progress, setProgress] = useState(0);

  // Then when progress is complete this sequence of hooks:
  // Hook 31 - fires a lot as progress, setProgress hook fires
  // Hook 15 - PDFDocumentProxy hook - makes sense because PDF is now loaded
  // Hook 22 - Structural Annotations Loaded
  // Hook 16 - PDFPageInfo objs populated
  // Hook 17 - page text maps are stored
  // Hook 3 - ViewStateVar useReactiveVar is updated and AnnotatorRenderer is removed from tree
  // Hook 3

  // When loaded via Corpus
  // 15 -> 22 --> **3** (usually indicates a failure) --> 16 --> 17 --> 3
  // Hook 15 - PDFDocumentProxy hook - makes sense because PDF is now loaded
  // Hook 22 - Structural Annotations Loaded
  // Hook 3 - ViewStateVar useReactiveVar is updated (Loaded)
  // Hook 16 - PDFPageInfo objs populated
  // Hook 17 - page text maps are stored
  // Hook 3 - ViewStateVar useReactiveVar is updated and AnnotatorRenderer is removed from tree (Error)

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

  const resetStates = () => {
    setAnalysisRows([]);
    setAnnotationObjs([]);
    setDocTypeAnnotations([]);
    setDocTypeLabels([]);
    setSpanLabels([]);
    setDataCells([]);
  };

  // Reset allow inputs when the mode switches
  useEffect(() => {
    allowUserInput(false);
  }, [editMode]);

  // Hook #37
  let corpus_id = opened_corpus?.id;
  let analysis_vars = {
    documentId: opened_document.id,
    ...(corpus_id !== undefined ? { corpusId: corpus_id } : {}),
  } as GetDocumentAnalysesAndExtractsInput;
  const {
    loading: analysesLoading,
    data: analysesData,
    refetch: fetchDocumentAnalysesAndExtracts,
  } = useQuery<
    GetDocumentAnalysesAndExtractsOutput,
    GetDocumentAnalysesAndExtractsInput
  >(GET_DOCUMENT_ANALYSES_AND_EXTRACTS, {
    variables: analysis_vars,
    skip: Boolean(displayOnlyTheseAnnotations),
  });

  // Hook #38
  const [
    fetchAnnotationsForAnalysis,
    { loading: annotationsLoading, data: annotationsData },
  ] = useLazyQuery<
    GetAnnotationsForAnalysisOutput,
    GetAnnotationsForAnalysisInput
  >(GET_ANNOTATIONS_FOR_ANALYSIS);

  const [
    fetchDataCellsForExtract,
    { loading: dataCellsLoading, data: dataCellsData },
  ] = useLazyQuery<GetDatacellsForExtractOutput, GetDatacellsForExtractInput>(
    GET_DATACELLS_FOR_EXTRACT
  );

  const [
    getDocumentAnnotationsAndRelationships,
    { data: humanAnnotationsAndRelationshipsData, loading: humanDataLoading },
  ] = useLazyQuery<
    GetDocumentAnnotationsAndRelationshipsOutput,
    GetDocumentAnnotationsAndRelationshipsInput
  >(GET_DOCUMENT_ANNOTATIONS_AND_RELATIONSHIPS);

  let doc_permissions: PermissionTypes[] = [];
  let raw_permissions = opened_document.myPermissions;
  if (opened_document && raw_permissions !== undefined) {
    doc_permissions = getPermissions(raw_permissions);
  }

  let corpus_permissions: PermissionTypes[] = [];
  let raw_corp_permissions = opened_corpus
    ? opened_corpus.myPermissions
    : ["READ"];
  if (opened_corpus && raw_corp_permissions !== undefined) {
    corpus_permissions = getPermissions(raw_corp_permissions);
  }

  // Calculated control and display variables - in certain situations we want to change behavior based on available data or
  // selected configurations.

  // Depending on the edit mode and some state variables, we may wany to load all annotations for the document
  // Particularly of node is when displayOnlyTheseAnnotations is set to something, we don't want to load additional
  // annotations. We are just rendering and displaying the annotations stored in this state variable.
  // TODO - load annotations on a page-by-page basis to cut down on server load.
  useEffect(() => {
    if (
      edit_mode === "ANNOTATE" &&
      opened_corpus?.labelSet &&
      opened_document &&
      !displayOnlyTheseAnnotations
    ) {
      getDocumentAnnotationsAndRelationships({
        variables: {
          documentId: opened_document.id,
          corpusId: opened_corpus.id,
        },
      });
    }
  }, [editMode, opened_corpus, opened_document, displayOnlyTheseAnnotations]);

  // When corpus annotation data is loaded (not analysis or extract data is loaded... react to it)
  useEffect(() => {
    if (humanAnnotationsAndRelationshipsData) {
      const processedAnnotations =
        humanAnnotationsAndRelationshipsData.document?.allAnnotations?.map(
          (annotation) => convertToServerAnnotation(annotation)
        ) ?? [];

      const processedRelationships =
        humanAnnotationsAndRelationshipsData.document?.allRelationships?.map(
          (relationship) =>
            new RelationGroup(
              relationship.sourceAnnotations?.edges
                ?.map((edge) => edge?.node?.id)
                .filter((id): id is string => id != null) ?? [],
              relationship.targetAnnotations?.edges
                ?.map((edge) => edge?.node?.id)
                .filter((id): id is string => id != null) ?? [],
              relationship.relationshipLabel,
              relationship.id
            )
        ) ?? [];

      setAnnotationObjs((prevAnnotations) => [
        ...prevAnnotations,
        ...processedAnnotations,
      ]);
      setRelationshipAnnotations(processedRelationships);

      // Use labelSet.allAnnotationLabels to set the labels
      const allLabels =
        humanAnnotationsAndRelationshipsData?.corpus?.labelSet
          ?.allAnnotationLabels ?? [];

      // Filter and set span labels
      const spanLabels = allLabels.filter(
        (label) => label.labelType === "TOKEN_LABEL"
      );
      setSpanLabels(spanLabels);
      setHumanSpanLabels(spanLabels);

      // Filter and set relation labels
      const relationLabels = allLabels.filter(
        (label) => label.labelType === "RELATIONSHIP_LABEL"
      );
      setRelationLabels(relationLabels);

      // Filter and set document labels (if needed)
      const docLabels = allLabels.filter(
        (label) => label.labelType === "DOC_TYPE_LABEL"
      );
      setDocTypeLabels(docLabels);
    }
  }, [humanAnnotationsAndRelationshipsData]);

  // When unmounting... ensure we turn off limiting to provided set of annotations
  useEffect(() => {
    return () => {
      onlyDisplayTheseAnnotations(undefined);
    };
  }, []);

  // Some artful React workarounds to jump to the annotations we specified to display on load - displayAnnotationOnAnnotatorLoad
  // only ONCE
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
    if (scrollToAnnotation) {
      if (
        jumped_to_annotation_on_load &&
        loaded_page_for_annotation &&
        loaded_page_for_annotation.id === jumped_to_annotation_on_load &&
        loaded_page_for_annotation.id === scrollToAnnotation.id
      ) {
        displayAnnotationOnAnnotatorLoad(undefined);
        setLoadedPageForAnnotation(null);
        setJumpedToAnnotationOnLoad(null);
      }
    }
  }, [
    jumped_to_annotation_on_load,
    loaded_page_for_annotation,
    scrollToAnnotation,
  ]);

  // Effect to load document and pawls layer
  useEffect(() => {
    if (open && opened_document && opened_document.pdfFile) {
      viewStateVar(ViewState.LOADING);
      fetchDocumentAnalysesAndExtracts();
      const loadingTask: PDFDocumentLoadingTask = pdfjsLib.getDocument(
        opened_document.pdfFile
      );
      loadingTask.onProgress = (p: { loaded: number; total: number }) => {
        setProgress(Math.round((p.loaded / p.total) * 100));
      };

      // If we're in annotate mode and corpus has a labelset AND we don't have initial annotations to display
      if (
        edit_mode === "ANNOTATE" &&
        opened_corpus?.labelSet &&
        (!displayOnlyTheseAnnotations ||
          displayOnlyTheseAnnotations.length == 0)
      ) {
        getDocumentAnnotationsAndRelationships({
          variables: {
            documentId: opened_document.id,
            corpusId: opened_corpus.id,
          },
        });
      }

      // Load PDF and pawls layer
      Promise.all([
        loadingTask.promise,
        getPawlsLayer(opened_document.pawlsParseFile || ""),
        opened_document.allStructuralAnnotations || Promise.resolve([]),
      ])
        .then(
          ([pdfDoc, pawlsData, structuralAnns]: [
            PDFDocumentProxy,
            PageTokens[],
            ServerAnnotationType[]
          ]) => {
            setDocument(pdfDoc);

            setStructuralAnnotations(
              structuralAnns.map((annotation) =>
                convertToServerAnnotation(annotation)
              )
            );

            const loadPages: Promise<PDFPageInfo>[] = [];
            for (let i = 1; i <= pdfDoc.numPages; i++) {
              // See line 50 for an explanation of the cast here.
              loadPages.push(
                pdfDoc.getPage(i).then((p) => {
                  let pageTokens: Token[] = [];
                  if (pawlsData.length === 0) {
                    toast.error(
                      "Token layer isn't available for this document... annotations can't be displayed."
                    );
                    // console.log("Loading up some data for page ", i, p);
                  } else {
                    const pageIndex = p.pageNumber - 1;
                    pageTokens = pawlsData[pageIndex].tokens;
                  }

                  // console.log("Tokens", pageTokens);
                  return new PDFPageInfo(p, pageTokens, zoom_level);
                }) as unknown as Promise<PDFPageInfo>
              );
            }
            return Promise.all(loadPages);
          }
        )
        .then((pages) => {
          setPages(pages);

          let { doc_text, string_index_token_map } =
            createTokenStringSearch(pages);

          setPageTextMaps({
            ...string_index_token_map,
            ...pageTextMaps,
          });
        })
        .catch((err) => {
          console.error("Error loading document:", err);
          viewStateVar(ViewState.ERROR);
        });
    }
  }, [open, opened_document]);

  // If analysis or extract is deselected, try to refetch the data
  useEffect(() => {
    resetStates();
    if (!selected_analysis && !selected_extract) {
      fetchDocumentAnalysesAndExtracts();
    }
  }, [selected_analysis, selected_extract]);

  // Only trigger state flip to "Loaded" if PDF, pageTextMaps and page info load properly
  useEffect(() => {
    if (doc && pageTextMaps && pages.length > 0) {
      viewStateVar(ViewState.LOADED);
    }
  }, [pageTextMaps, pages, doc]);

  // When modal is hidden, ensure we reset state and clear provided annotations to display
  useEffect(() => {
    if (!open) {
      onlyDisplayTheseAnnotations(undefined);
    }
  }, [open]);

  // When unmounting... ensure we turn off limiting to provided set of annotations
  useEffect(() => {
    return () => {
      onlyDisplayTheseAnnotations(undefined);
    };
  }, []);

  // If we got a property of annotations to display (and ONLY those), do some post processing and update state variable(s) accordingly
  useEffect(() => {
    if (displayOnlyTheseAnnotations) {
      setAnnotationObjs(
        convertToServerAnnotations(displayOnlyTheseAnnotations)
      );
      // Clear other annotation types as they're not specified in onlyDisplayTheseAnnotations
      setDocTypeAnnotations([]);
      setRelationshipAnnotations([]);
    }
  }, [displayOnlyTheseAnnotations]);

  useEffect(() => {
    fetchDocumentAnalysesAndExtracts();
  }, []);

  // Effect to process analyses and extracts data retrieved
  useEffect(() => {
    if (analysesData && analysesData.documentCorpusActions) {
      const { analysisRows, extracts } = analysesData.documentCorpusActions;
      setExtracts(extracts);
      setAnalysisRows(analysisRows);
      setAnalyses(
        analysisRows
          .map((row) => row.analysis)
          .filter((a): a is AnalysisType => a !== null && a !== undefined)
      );
    }
  }, [analysesData]);

  // Effect to fetch annotations when an analysis is selected
  useEffect(() => {
    // Clear existing state;
    resetStates();

    if (selected_analysis) {
      allowUserInput(false);
      selectedExtract(null); // Ensure extract is deselected
      fetchAnnotationsForAnalysis({
        variables: {
          analysisId: selected_analysis.id,
        },
      }).then(({ data }) => {
        // TODO - properly parse resulting annotation data
        if (data && data.analysis && data.analysis.fullAnnotationList) {
          const rawSpanAnnotations = data.analysis.fullAnnotationList.filter(
            (annot) => annot.annotationLabel.labelType == LabelType.TokenLabel
          );
          const rawDocAnnotations = data.analysis.fullAnnotationList.filter(
            (annot) => annot.annotationLabel.labelType == LabelType.DocTypeLabel
          );

          const processedSpanAnnotations = rawSpanAnnotations.map(
            (annotation) => convertToServerAnnotation(annotation)
          );
          setAnnotationObjs(processedSpanAnnotations);

          // Update span labels
          const uniqueLabels = _.uniqBy(
            processedSpanAnnotations.map((a) => a.annotationLabel),
            "id"
          );
          setSpanLabels(uniqueLabels);

          const processedDocAnnotations = rawDocAnnotations.map((annotation) =>
            convertToDocTypeAnnotation(annotation)
          );
          setDocTypeAnnotations(processedDocAnnotations);
          const uniqueDocLabels = _.uniqBy(
            processedDocAnnotations.map((a) => a.annotationLabel),
            "id"
          );
          setDocTypeLabels(uniqueDocLabels);
        }
      });
    } else {
      allowUserInput(true);
    }
  }, [selected_analysis, opened_document.id, opened_corpus?.id]);

  // Effect to fetch data cells when an extract is selected
  useEffect(() => {
    // Clear existing state;
    resetStates();

    if (selected_extract) {
      allowUserInput(false);
      selectedAnalysis(null); // Ensure analysis is deselected
      fetchDataCellsForExtract({
        variables: {
          extractId: selected_extract.id,
        },
      }).then(({ data }) => {
        if (data && data.extract) {
          setDataCells(data.extract.fullDatacellList || []);
          setColumns(data.extract.fieldset.fullColumnList || []);

          // Process annotations from datacells
          const processedAnnotations = (data.extract.fullDatacellList || [])
            .flatMap((datacell) => datacell.fullSourceList || [])
            .map((annotation) => convertToServerAnnotation(annotation));
          setAnnotationObjs(processedAnnotations);

          // Update span labels
          const uniqueLabels = _.uniqBy(
            processedAnnotations.map((a) => a.annotationLabel),
            "id"
          );
          setSpanLabels(uniqueLabels);
        }
      });
    } else {
      allowUserInput(true);
    }
  }, [selected_extract, opened_document.id, opened_corpus?.id]);

  // Effect to process data cells and columns
  useEffect(() => {
    if (dataCellsData) {
      setDataCells(dataCellsData.extract.fullDatacellList ?? []);
      setColumns(dataCellsData.extract.fieldset.fullColumnList ?? []);
    }
  }, [dataCellsData]);

  const onSelectAnalysis = (analysis: AnalysisType | null) => {
    selectedAnalysis(analysis);
    selectedExtract(null);
  };

  const onSelectExtract = (extract: ExtractType | null) => {
    selectedExtract(extract);
    selectedAnalysis(null);
  };

  let rendered_component = <></>;
  switch (view_state) {
    case ViewState.LOADING:
      rendered_component = (
        <WithSidebar width={responsive_sidebar_width}>
          <SidebarContainer
            width={responsive_sidebar_width}
            {...(responsive_sidebar_width ? { display: "none" } : {})}
          >
            <AnnotatorSidebar
              read_only={true}
              selected_analysis={selected_analysis}
              selected_extract={selected_extract}
              allowInput={false}
              editMode="ANNOTATE"
              datacells={data_cells}
              columns={columns}
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
                  Hang tight while we fetch the required data.
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
              selected_analysis={selected_analysis}
              selected_extract={selected_extract}
              allowInput={false}
              datacells={data_cells}
              columns={columns}
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
      if (doc) {
        rendered_component = (
          <AnnotatorRenderer
            open={open}
            view_document_only={false}
            loading_message="Loading Annotator Data"
            data_loading={
              dataCellsLoading ||
              analysesLoading ||
              annotationsLoading ||
              humanDataLoading
            }
            doc={doc}
            pages={pages}
            zoom_level={zoom_level}
            setZoomLevel={setZoomLevel}
            load_progress={progress}
            opened_document={opened_document}
            opened_corpus={opened_corpus}
            read_only={read_only}
            structural_annotations={structuralAnnotations}
            scrollToAnnotation={
              scrollToAnnotation &&
              convertToServerAnnotation(scrollToAnnotation)
            }
            show_structural_annotations={show_structural_annotations}
            show_selected_annotation_only={show_selected_annotation_only}
            show_annotation_bounding_boxes={show_annotation_bounding_boxes}
            show_annotation_labels={show_annotation_labels}
            span_labels={span_labels}
            human_span_labels={human_span_labels}
            relationship_labels={relation_labels}
            document_labels={doc_type_labels}
            annotation_objs={annotation_objs}
            doc_type_annotations={doc_type_annotations}
            relationship_annotations={relationship_annotations}
            data_cells={data_cells}
            columns={columns}
            editMode={edit_mode}
            setEditMode={(m: "ANALYZE" | "ANNOTATE") => {
              editMode(m);
            }}
            allowInput={allow_input}
            setAllowInput={(v: boolean) => {
              allowUserInput(v);
            }}
            analyses={analyses}
            extracts={extracts}
            selected_analysis={selected_analysis}
            selected_extract={selected_extract}
            onSelectAnalysis={onSelectAnalysis}
            onSelectExtract={onSelectExtract}
            onError={(vs: ViewState) => {
              viewStateVar(vs);
            }}
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
              selected_analysis={selected_analysis}
              selected_extract={selected_extract}
              allowInput={false}
              editMode="ANNOTATE"
              datacells={data_cells}
              columns={columns}
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
        <ViewSettingsPopup
          show_selected_annotation_only={show_selected_annotation_only}
          showSelectedAnnotationOnly={showSelectedAnnotationOnly}
          showStructuralLabels={
            show_structural_annotations ? show_structural_annotations : false
          }
          toggleShowStructuralLabels={() =>
            showStructuralAnnotations(!show_structural_annotations)
          }
          show_annotation_bounding_boxes={show_annotation_bounding_boxes}
          showAnnotationBoundingBoxes={showAnnotationBoundingBoxes}
          label_display_behavior={label_display_behavior}
          showAnnotationLabels={showAnnotationLabels}
          label_display_options={label_display_options}
        />
        {rendered_component}
      </Modal.Content>
    </Modal>
  );
};
