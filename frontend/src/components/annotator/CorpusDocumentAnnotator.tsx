import { useLazyQuery, useQuery } from "@apollo/client";
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
} from "../../graphql/queries";
import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

import { getPawlsLayer } from "./api/rest";
import {
  AnalysisType,
  AnnotationLabelType,
  ColumnType,
  CorpusType,
  DatacellType,
  DocumentType,
  ExtractType,
  LabelDisplayBehavior,
  ServerAnnotationType,
} from "../../graphql/types";
import {
  ViewState,
  TokenId,
  PermissionTypes,
  PageTokens,
  Token,
} from "../types";
import { getPermissions } from "../../utils/transform";
import _ from "lodash";
import {
  displayAnnotationOnAnnotatorLoad,
  onlyDisplayTheseAnnotations,
} from "../../graphql/cache";
import { Header, Icon, Modal, Progress } from "semantic-ui-react";
import AnnotatorSidebar from "./sidebar/AnnotatorSidebar";
import { WithSidebar } from "./common";
import { Result } from "../widgets/data-display/Result";
import { SidebarContainer } from "../common";
import { CenterOnPage } from "./CenterOnPage";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { AnnotatorRenderer } from "./AnnotatorRenderer";
import { PDFDocumentLoadingTask } from "pdfjs-dist";
import { toast } from "react-toastify";
import { createTokenStringSearch } from "./utils";

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

interface CorpusDocumentAnnotatorProps {
  open: boolean;
  opened_document: DocumentType;
  opened_corpus: CorpusType;
  read_only: boolean;
  scroll_to_annotation_on_open: ServerAnnotationType | null;
  display_annotations?: ServerAnnotationType[];
  show_selected_annotation_only: boolean;
  show_annotation_bounding_boxes: boolean;
  show_annotation_labels: LabelDisplayBehavior;
  onClose: (args?: any) => void | any;
}

export const CorpusDocumentAnnotator = ({
  open,
  opened_document,
  opened_corpus,
  display_annotations,
  read_only,
  scroll_to_annotation_on_open,
  show_selected_annotation_only,
  show_annotation_bounding_boxes,
  show_annotation_labels,
  onClose,
}: CorpusDocumentAnnotatorProps) => {
  const { width } = useWindowDimensions();
  const responsive_sidebar_width = width <= 1000 ? "0px" : "400px";

  const [viewState, setViewState] = useState<ViewState>(ViewState.LOADING);
  const [doc, setDocument] = useState<PDFDocumentProxy>();
  const [pages, setPages] = useState<PDFPageInfo[]>([]);
  const [pageTextMaps, setPageTextMaps] = useState<Record<number, TokenId>>();

  // New states for analyses and extracts
  const [analyses, setAnalyses] = useState<AnalysisType[]>([]);
  const [extracts, setExtracts] = useState<ExtractType[]>([]);
  const [selected_analysis, setSelectedAnalysis] =
    useState<AnalysisType | null>(null);
  const [selected_extract, setSelectedExtract] = useState<ExtractType | null>(
    null
  );

  // States for annotations and related data
  const [annotation_objs, setAnnotationObjs] = useState<ServerAnnotation[]>([]);
  const [doc_type_annotations, setDocTypeAnnotations] = useState<
    DocTypeAnnotation[]
  >([]);
  const [relationship_annotations, setRelationshipAnnotations] = useState<
    RelationGroup[]
  >([]);
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

  const [progress, setProgress] = useState(0);

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

  const {
    loading: analysesLoading,
    data: analysesData,
    refetch,
  } = useQuery<
    GetDocumentAnalysesAndExtractsOutput,
    GetDocumentAnalysesAndExtractsInput
  >(GET_DOCUMENT_ANALYSES_AND_EXTRACTS, {
    variables: { documentId: opened_document.id, corpusId: opened_corpus?.id },
  });
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

  // When unmounting... ensure we turn off limiting to provided set of annotations
  useEffect(() => {
    return () => {
      onlyDisplayTheseAnnotations(undefined);
    };
  }, []);

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

  // Effect to load document and pawls layer
  useEffect(() => {
    if (open && opened_document && opened_document.pdfFile) {
      setViewState(ViewState.LOADING);
      refetch();
      const loadingTask: PDFDocumentLoadingTask = pdfjsLib.getDocument(
        opened_document.pdfFile
      );
      loadingTask.onProgress = (p: { loaded: number; total: number }) => {
        setProgress(Math.round((p.loaded / p.total) * 100));
      };

      // Load PDF and pawls layer
      Promise.all([
        loadingTask.promise,
        getPawlsLayer(opened_document.pawlsParseFile || ""),
      ])
        .then(([pdfDoc, pawlsData]: [PDFDocumentProxy, PageTokens[]]) => {
          setDocument(pdfDoc);

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
                  // console.log("Loading up some data for page ", i, p);
                  const pageIndex = p.pageNumber - 1;

                  console.log("pageIndex", pageIndex);
                  pageTokens = pawlsData[pageIndex].tokens;
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

          setViewState(ViewState.LOADED);
        })
        .catch((err) => {
          console.error("Error loading document:", err);
          setViewState(ViewState.ERROR);
        });
    }
  }, [open, opened_document]);

  useEffect(() => {
    // When modal is hidden, ensure we reset state and clear provided annotations to display
    if (!open) {
      onlyDisplayTheseAnnotations(undefined);
    }
  }, [open]);

  useEffect(() => {
    refetch();
  }, []);

  // Effect to process analyses and extracts data
  useEffect(() => {
    if (analysesData) {
      const { analyses, extracts } = analysesData.documentCorpusActions;
      setAnalyses(analyses);
      setExtracts(extracts);
    }
  }, [analysesData]);

  // Effect to fetch annotations when an analysis is selected
  useEffect(() => {
    if (selected_analysis) {
      setSelectedExtract(null); // Ensure extract is deselected
      fetchAnnotationsForAnalysis({
        variables: {
          analysisId: selected_analysis.id,
        },
      });
    }
  }, [selected_analysis, opened_document.id, opened_corpus?.id]);

  // Effect to fetch data cells when an extract is selected
  useEffect(() => {
    if (selected_extract) {
      setSelectedAnalysis(null); // Ensure analysis is deselected
      fetchDataCellsForExtract({
        variables: {
          extractId: selected_extract.id,
        },
      });
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
    setSelectedAnalysis(analysis);
    setSelectedExtract(null);
  };

  const onSelectExtract = (extract: ExtractType | null) => {
    setSelectedExtract(extract);
    setSelectedAnalysis(null);
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
            <AnnotatorSidebar read_only={true} />
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
            doc={doc}
            pages={pages}
            load_progress={progress}
            opened_document={opened_document}
            opened_corpus={opened_corpus}
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
            doc_type_annotations={doc_type_annotations}
            relationship_annotations={relationship_annotations}
            data_cells={data_cells}
            columns={columns}
            analyses={analyses}
            extracts={extracts}
            onSelectAnalysis={onSelectAnalysis}
            onSelectExtract={onSelectExtract}
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
