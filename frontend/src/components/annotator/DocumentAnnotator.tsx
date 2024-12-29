import { useLazyQuery, useReactiveVar } from "@apollo/client";
import { useEffect, useState, useLayoutEffect } from "react";
import { useAtom } from "jotai";
import {
  AnalysisType,
  CorpusType,
  DocumentType,
  ExtractType,
  LabelDisplayBehavior,
  LabelType,
  ServerAnnotationType,
} from "../../types/graphql-api";
import {
  ViewState,
  Token,
  label_display_options,
  PermissionTypes,
} from "../types";
import {
  convertToDocTypeAnnotations,
  convertToServerAnnotation,
  convertToServerAnnotations,
  getPermissions,
} from "../../utils/transform";
import { toast } from "react-toastify";
import { createTokenStringSearch } from "./utils";
import { PdfAnnotations, RelationGroup } from "./types/annotations";
import {
  usePdfDoc,
  usePageTokenTextMaps,
  useDocumentType,
  useDocText,
  usePages,
  useSelectedDocument,
  useSearchText,
  useTextSearchState,
} from "./context/DocumentAtom";
import {
  pdfAnnotationsAtom,
  structuralAnnotationsAtom,
  docTypeAnnotationsAtom,
} from "./context/AnnotationAtoms";
import { useCorpusState } from "./context/CorpusAtom";

import {
  GET_DOCUMENT_ANNOTATIONS_AND_RELATIONSHIPS,
  GetDocumentAnnotationsAndRelationshipsInput,
  GetDocumentAnnotationsAndRelationshipsOutput,
} from "../../graphql/queries";
import { getDocumentRawText, getPawlsLayer } from "./api/rest";

import {
  allowUserInput,
  displayAnnotationOnAnnotatorLoad,
  editMode,
  onlyDisplayTheseAnnotations,
  viewStateVar,
} from "../../graphql/cache";

import { PDFDocumentLoadingTask } from "pdfjs-dist";
import { PDFPageInfo } from "./types/pdf";

import { Header, Icon, Modal, Progress } from "semantic-ui-react";
import { AnnotatorSidebar } from "./sidebar/AnnotatorSidebar";
import { WithSidebar } from "./common";
import { Result } from "../widgets/data-display/Result";
import { SidebarContainer } from "../common";
import { CenterOnPage } from "./CenterOnPage";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { ViewSettingsPopup } from "../widgets/popups/ViewSettingsPopup";
import { useUISettings } from "./hooks/useUISettings";
import {
  useAnalysisManager,
  useAnalysisSelection,
} from "./hooks/AnalysisHooks";

// Import Annotation Hooks
import {
  usePdfAnnotations,
  useAnnotationObjs,
  useInitialAnnotations,
} from "./hooks/AnnotationHooks";
import {
  useAnnotationControls,
  useAnnotationDisplay,
} from "./context/UISettingsAtom";
import styled from "styled-components";
import { DocumentViewer } from "./display/viewer/DocumentViewer";

// Loading pdf js libraries without cdn is a right PITA... cobbled together a working
// approach via these guides:
// https://stackoverflow.com/questions/63553008/looking-for-help-to-make-npm-pdfjs-dist-work-with-webpack-and-django
// https://github.com/mozilla/pdf.js/issues/12379
// https://github.com/mozilla/pdf.js/blob/f40bbe838e3c09b84e6f69df667a453c55de25f8/examples/webpack/main.js
const pdfjsLib = require("pdfjs-dist");

// Setting worker path to worker bundle.
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.js`;
/**
 * Props for the DocumentAnnotator component.
 */
export interface TextSearchResultsProps {
  start: Token;
  end: Token;
}

export interface PageTokenMapProps {
  string_index_token_map: Record<number, Token>;
  page_text: string;
}

export interface PageTokenMapBuilderProps {
  end_text_index: number;
  token_map: PageTokenMapProps;
}

interface DocumentAnnotatorProps {
  open: boolean;
  opened_document?: DocumentType | null;
  opened_corpus?: CorpusType;
  opened_extract?: ExtractType | null;
  opened_analysis?: AnalysisType | null;
  read_only: boolean;
  show_structural_annotations: boolean;
  show_selected_annotation_only: boolean;
  show_annotation_bounding_boxes: boolean;
  show_annotation_labels: LabelDisplayBehavior;
  onClose: (args?: any) => void | any;
}

/**
 * DocumentAnnotator Component
 *
 * @param props - Props adhering to DocumentAnnotatorProps interface.
 * @returns JSX Element representing the Document Annotator.
 */
export const DocumentAnnotator = ({
  open,
  opened_document,
  opened_corpus,
  opened_extract,
  opened_analysis,
  read_only,
  show_structural_annotations,
  show_selected_annotation_only,
  show_annotation_bounding_boxes,
  show_annotation_labels,
  onClose,
}: DocumentAnnotatorProps) => {
  const { width } = useWindowDimensions();
  const { setProgress, progress, zoomLevel } = useUISettings({
    width,
  });

  // Using Jotai atoms for managing annotations
  const [, setPdfAnnotations] = useAtom(pdfAnnotationsAtom);
  const [, setStructuralAnnotations] = useAtom(structuralAnnotationsAtom);
  const [, setDocTypeAnnotations] = useAtom(docTypeAnnotationsAtom);
  const {
    setShowSelectedOnly,
    setShowLabels,
    setShowStructural,
    setShowBoundingBoxes,
  } = useAnnotationDisplay();
  const { setTextSearchState } = useTextSearchState();

  useLayoutEffect(() => {
    setShowSelectedOnly(show_selected_annotation_only);
  }, [show_selected_annotation_only, setShowSelectedOnly]);

  useEffect(() => {
    setShowBoundingBoxes(show_annotation_bounding_boxes);
  }, [show_annotation_bounding_boxes, setShowBoundingBoxes]);

  useEffect(() => {
    setShowStructural(show_structural_annotations);
  }, [show_structural_annotations, setShowStructural]);

  useEffect(() => {
    setShowLabels(show_annotation_labels);
  }, [show_annotation_labels, setShowLabels]);

  const displayOnlyTheseAnnotations = useReactiveVar(
    onlyDisplayTheseAnnotations
  );
  const edit_mode = useReactiveVar(editMode);
  const { selectedAnalysis: selected_analysis } = useAnalysisSelection();
  const { setActiveSpanLabel } = useAnnotationControls();

  const { pdfDoc, setPdfDoc } = usePdfDoc();
  const { pages, setPages } = usePages();
  const {
    pageTokenTextMaps: pageTextMaps,
    setPageTokenTextMaps: setPageTextMaps,
  } = usePageTokenTextMaps();
  const { setDocumentType } = useDocumentType();
  const { setDocText } = useDocText();

  // Instead of multiple useAtoms, just call useCorpusState once:
  const { setCorpus } = useCorpusState();

  const [
    getDocumentAnnotationsAndRelationships,
    { data: humanAnnotationsAndRelationshipsData, loading: humanDataLoading },
  ] = useLazyQuery<
    GetDocumentAnnotationsAndRelationshipsOutput,
    GetDocumentAnnotationsAndRelationshipsInput
  >(GET_DOCUMENT_ANNOTATIONS_AND_RELATIONSHIPS);

  // Set document and corpus atoms when component mounts
  const { setSelectedDocument } = useSelectedDocument();
  const { setSearchText } = useSearchText();

  useEffect(() => {
    setSelectedDocument(opened_document ?? null);
    if (opened_corpus) {
      const corpus_permissions = getPermissions(opened_corpus.myPermissions);
      setCorpus({
        selectedCorpus: opened_corpus,
        permissions: corpus_permissions,
      });
    }
  }, [opened_document, opened_corpus]);

  // Process annotations when data is loaded
  useEffect(() => {
    if (humanAnnotationsAndRelationshipsData && !displayOnlyTheseAnnotations) {
      // Then process the annotations
      processAnnotationsData(humanAnnotationsAndRelationshipsData);
    }
  }, [humanAnnotationsAndRelationshipsData, displayOnlyTheseAnnotations]);

  // Store document type
  useEffect(() => {
    if (opened_document) {
      setDocumentType(opened_document.fileType ? opened_document.fileType : "");
    } else {
      setDocumentType("");
    }
  }, [opened_document]);

  const [loadTrigger, setLoadTrigger] = useState(0);

  // Handle opening of the annotator
  useEffect(() => {
    const loadAnnotations = () => {
      if (opened_document) {
        if (opened_corpus?.labelSet && !displayOnlyTheseAnnotations) {
          console.log("Calling getDocumentAnnotationsAndRelationships");
          return getDocumentAnnotationsAndRelationships({
            variables: {
              documentId: opened_document.id,
              corpusId: opened_corpus.id,
              ...(selected_analysis
                ? { analysisId: selected_analysis.id }
                : { analysisId: "__none__" }),
            },
          });
        } else if (opened_corpus !== undefined && displayOnlyTheseAnnotations) {
          console.log("Using mock data for displayOnlyTheseAnnotations");
          // Create mock data of type GetDocumentAnnotationsAndRelationshipsOutput
          const mockData: GetDocumentAnnotationsAndRelationshipsOutput = {
            document: {
              ...opened_document,
              allAnnotations: displayOnlyTheseAnnotations,
            },
            corpus: opened_corpus,
          };
          // Return a Promise that resolves to an object similar to the Apollo QueryResult
          return Promise.resolve({ data: mockData });
        }
        return Promise.resolve(null);
      }
    };

    if (open && opened_document) {
      viewStateVar(ViewState.LOADING);

      if (
        opened_document.fileType === "application/pdf" &&
        opened_document.pdfFile
      ) {
        console.debug("React to PDF doc load request");
        const loadingTask: PDFDocumentLoadingTask = pdfjsLib.getDocument(
          opened_document.pdfFile
        );
        loadingTask.onProgress = (p: { loaded: number; total: number }) => {
          setProgress(Math.round((p.loaded / p.total) * 100));
        };

        Promise.all([
          loadingTask.promise,
          getPawlsLayer(opened_document.pawlsParseFile || ""),
          loadAnnotations(),
        ])
          .then(([pdfDocProxy, pawlsData]) => {
            setPdfDoc(pdfDocProxy);

            const loadPages: Promise<PDFPageInfo>[] = [];
            for (let i = 1; i <= pdfDocProxy.numPages; i++) {
              loadPages.push(
                pdfDocProxy.getPage(i).then((p) => {
                  let pageTokens: Token[] = [];
                  if (pawlsData.length === 0) {
                    toast.error(
                      "Token layer isn't available for this document... annotations can't be displayed."
                    );
                  } else {
                    const pageIndex = p.pageNumber - 1;
                    pageTokens = pawlsData[pageIndex].tokens;
                  }
                  return new PDFPageInfo(p, pageTokens, zoomLevel);
                }) as unknown as Promise<PDFPageInfo>
              );
            }
            return Promise.all(loadPages);
          })
          .then((loadedPages) => {
            setPages(loadedPages);
            let { doc_text, string_index_token_map } =
              createTokenStringSearch(loadedPages);
            setPageTextMaps({
              ...string_index_token_map,
              ...pageTextMaps,
            });
            setDocText(doc_text);
            // Loaded state set by useEffect for state change in doc state store.
          })
          .catch((err) => {
            console.error("Error loading PDF document:", err);
            viewStateVar(ViewState.ERROR);
          });
      } else if (
        opened_document.fileType === "application/txt" ||
        opened_document.fileType === "text/plain"
      ) {
        console.debug("React to TXT document");

        Promise.all([
          getDocumentRawText(opened_document.txtExtractFile || ""),
          loadAnnotations(),
        ])
          .then(([txt, annotationsResult]) => {
            setDocText(txt);
            console.log("annotationsResult", annotationsResult);
            if (annotationsResult?.data) {
              processAnnotationsData(annotationsResult.data);
            }
            viewStateVar(ViewState.LOADED);
          })
          .catch((err) => {
            console.error("Error loading TXT document:", err);
            viewStateVar(ViewState.ERROR);
          });
      } else {
        console.error("Unexpected filetype: ", opened_document.fileType);
      }
    }
  }, [
    open,
    opened_document,
    opened_corpus,
    displayOnlyTheseAnnotations,
    loadTrigger,
  ]);

  // Use the initialAnnotationsAtom to store initial annotations
  const { setInitialAnnotations } = useInitialAnnotations();

  /**
   * Processes the annotations data and updates the annotation atoms.
   * @param data Data containing annotations and relationships.
   */
  const processAnnotationsData = (
    data: GetDocumentAnnotationsAndRelationshipsOutput
  ) => {
    console.log("Processing annotations data:", data);
    if (data?.document) {
      const processedAnnotations =
        data.document.allAnnotations?.map((annotation) =>
          convertToServerAnnotation(annotation)
        ) ?? [];

      const structuralAnnotations =
        data.document.allStructuralAnnotations?.map((annotation) =>
          convertToServerAnnotation(annotation)
        ) ?? [];

      const processedDocTypeAnnotations = convertToDocTypeAnnotations(
        data.document.allAnnotations?.filter(
          (ann) => ann.annotationLabel.labelType === LabelType.DocTypeLabel
        ) ?? []
      );

      // Update pdfAnnotations atom
      setPdfAnnotations(
        (prev) =>
          new PdfAnnotations(
            [...processedAnnotations, ...structuralAnnotations],
            prev.relations,
            processedDocTypeAnnotations,
            true
          )
      );

      // **Store the initial annotations**
      setInitialAnnotations(processedAnnotations);

      // Process structural annotations
      if (data.document.allStructuralAnnotations) {
        const structuralAnns = data.document.allStructuralAnnotations.map(
          (ann) => convertToServerAnnotation(ann)
        );
        setStructuralAnnotations(structuralAnns);
      }

      // Process relationships
      const processedRelationships = data.document.allRelationships?.map(
        (rel) =>
          new RelationGroup(
            rel.sourceAnnotations.edges
              .map((edge) => edge?.node?.id)
              .filter((id): id is string => id !== undefined),
            rel.targetAnnotations.edges
              .map((edge) => edge?.node?.id)
              .filter((id): id is string => id !== undefined),
            rel.relationshipLabel,
            rel.id,
            rel.structural
          )
      );

      setPdfAnnotations(
        (prev) =>
          new PdfAnnotations(
            prev.annotations,
            processedRelationships || [],
            prev.docTypes,
            true
          )
      );

      // Update label atoms
      if (data.corpus?.labelSet) {
        const allLabels = data.corpus.labelSet.allAnnotationLabels ?? [];
        const filteredTokenLabels = allLabels.filter(
          (label) => label.labelType === LabelType.TokenLabel
        );
        const filteredSpanLabels = allLabels.filter(
          (label) => label.labelType === LabelType.SpanLabel
        );
        const filteredRelationLabels = allLabels.filter(
          (label) => label.labelType === LabelType.RelationshipLabel
        );
        const filteredDocTypeLabels = allLabels.filter(
          (label) => label.labelType === LabelType.DocTypeLabel
        );

        setCorpus({
          spanLabels: filteredSpanLabels,
          humanSpanLabels: filteredSpanLabels,
          relationLabels: filteredRelationLabels,
          docTypeLabels: filteredDocTypeLabels,
          humanTokenLabels: filteredTokenLabels,
        });
      }
    }
  };

  // Update view state when PDF document is loaded
  useEffect(() => {
    if (opened_document && opened_document.fileType === "application/pdf") {
      if (pdfDoc && pageTextMaps && Object.keys(pages).length > 0) {
        viewStateVar(ViewState.LOADED);
      }
    }
  }, [pageTextMaps, pages, pdfDoc]);

  // Initialize Annotation Hooks
  const { replaceAnnotations, replaceRelations } = usePdfAnnotations();
  const { setAnnotationObjs } = useAnnotationObjs();

  const {
    dataCells,
    columns,
    analyses,
    extracts,
    resetStates: analysisResetStates,
    onSelectAnalysis,
    onSelectExtract,
  } = useAnalysisManager();

  const responsive_sidebar_width = width <= 1000 ? "0px" : "400px";

  const view_state = useReactiveVar(viewStateVar);
  const allow_input = useReactiveVar(allowUserInput);

  // Global state variables to jump to and/or load certain annotations on load
  const scrollToAnnotation = useReactiveVar(displayAnnotationOnAnnotatorLoad);

  const [loaded_page_for_annotation, setLoadedPageForAnnotation] =
    useState<ServerAnnotationType | null>(null);
  const [jumped_to_annotation_on_load, setJumpedToAnnotationOnLoad] = useState<
    string | null
  >(null);

  // Reset allow inputs when the mode switches
  useEffect(() => {
    allowUserInput(false);
  }, [editMode]);
  let doc_permissions: PermissionTypes[] = [];
  let raw_permissions = opened_document?.myPermissions;
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

  // Some artful React workarounds to jump to the annotations we specified to display on load - displayAnnotationOnAnnotatorLoad
  // only ONCE
  useEffect(() => {
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

  useEffect(() => {
    onSelectAnalysis(opened_analysis ?? null);
  }, [opened_analysis?.id]);

  useEffect(() => {
    onSelectExtract(opened_extract ?? null);
  }, [opened_extract]);

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

  // When annotations are provided to display only, update annotation states
  useEffect(() => {
    console.debug(
      "React to displayOnlyTheseAnnotations",
      displayOnlyTheseAnnotations
    );
    if (displayOnlyTheseAnnotations) {
      const annotations = convertToServerAnnotations(
        displayOnlyTheseAnnotations
      );
      setAnnotationObjs(annotations);

      // Clear other annotation types as they're not specified in onlyDisplayTheseAnnotations
      replaceAnnotations([
        ...annotations.filter(
          (a) => !annotations.some((ann) => ann.id === a.id)
        ),
        ...annotations,
      ]);
      // Assuming there are methods to clear docTypeAnnotations and setPdfAnnotations appropriately
      setDocTypeAnnotations([]);
      replaceRelations([], []); // Adjust based on actual hook implementation
    }
  }, [
    displayOnlyTheseAnnotations,
    setAnnotationObjs,
    replaceAnnotations,
    setDocTypeAnnotations,
    replaceRelations,
  ]);

  let rendered_component = <></>;
  switch (view_state) {
    case ViewState.LOADING:
      rendered_component = (
        <ModalLoadingContainer>
          <LoadingContent>
            <Header as="h2" icon>
              {progress < 100 && (
                <Icon size="mini" name="file alternate outline" />
              )}
              {progress === 100
                ? "Fetching Annotations"
                : "Loading Document Data"}
              <Header.Subheader style={{ marginTop: "2rem" }}>
                {progress === 100
                  ? "Retrieving annotation data from server..."
                  : "Fetching document data from server..."}
              </Header.Subheader>
            </Header>
            {progress < 100 ? (
              <Progress
                style={{ width: "300px" }}
                percent={progress}
                indicating
              />
            ) : (
              <Icon
                loading
                name="spinner"
                size="large"
                style={{ marginTop: "1rem" }}
              />
            )}
          </LoadingContent>
        </ModalLoadingContainer>
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
              allowInput={false}
              datacells={dataCells}
              columns={columns}
            />
          </SidebarContainer>
          <CenterOnPage>
            <Result status="unknown" title="PDF Not Found" />
          </CenterOnPage>
        </WithSidebar>
      );
      break;
    case ViewState.LOADED:
      rendered_component = (
        <DocumentViewer
          scroll_to_annotation_on_open={
            scrollToAnnotation && convertToServerAnnotation(scrollToAnnotation)
          }
          doc={pdfDoc}
          analyses={analyses}
          extracts={extracts}
          datacells={dataCells}
          columns={columns}
          allowInput={allow_input}
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
            <AnnotatorSidebar
              read_only={true}
              allowInput={false}
              datacells={dataCells}
              columns={columns}
            />
          </SidebarContainer>
          <CenterOnPage>
            <Result status="warning" title="Unable to Render Document" />
          </CenterOnPage>
        </WithSidebar>
      );
      break;
  }

  useEffect(() => {
    if (!open) {
      // Reset only annotation-specific state
      setPdfAnnotations(new PdfAnnotations([], [], [], false));
      setStructuralAnnotations([]);
      setDocTypeAnnotations([]);
      setAnnotationObjs([]);
      setInitialAnnotations([]);
      setActiveSpanLabel(undefined);

      // Reset selected analysis and extract
      onSelectAnalysis(null);
      onSelectExtract(null);

      // Reset search state
      setSearchText("");
      setTextSearchState({
        matches: [],
        selectedIndex: 0,
      });

      // Increment load trigger to force reload of annotations
      setLoadTrigger((prev) => prev + 1);
    }
  }, [open]);

  // Return early if no document is provided
  if (!opened_document) {
    return null;
  }

  return (
    <Modal
      className="AnnotatorModal"
      closeIcon
      open={open}
      onClose={() => {
        onClose();
      }}
      size="fullscreen"
    >
      <Modal.Content
        className="AnnotatorModalContent"
        style={{ padding: "0px", height: "90vh", overflow: "hidden" }}
      >
        <ViewSettingsPopup label_display_options={label_display_options} />
        {rendered_component}
      </Modal.Content>
    </Modal>
  );
};
const ModalLoadingContainer = styled.div`
  display: flex;
  width: 100%;
  height: 90vh;
  align-items: center;
  justify-content: center;
  background-color: white;
`;

const LoadingContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rem;
  text-align: center;
`;
