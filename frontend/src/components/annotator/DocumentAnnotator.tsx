import { useLazyQuery, useReactiveVar } from "@apollo/client";
import { useEffect, useState } from "react";
import { useSetAtom, useAtom } from "jotai";
// import pdfjsLib from "pdfjs-dist";
import {
  CorpusType,
  DocumentType,
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
  convertToServerAnnotation,
  convertToServerAnnotations,
  getPermissions,
} from "../../utils/transform";
import { toast } from "react-toastify";
import { createTokenStringSearch } from "./utils";
import { PdfAnnotations, RelationGroup } from "./types/annotations";
import {
  usePdfDoc,
  usePages,
  usePageTextMaps,
  useDocumentType,
  useDocText,
  selectedDocumentAtom,
  selectedCorpusAtom,
} from "./context/DocumentAtom";
import {
  pdfAnnotationsAtom,
  structuralAnnotationsAtom,
  docTypeAnnotationsAtom,
} from "./context/AnnotationAtoms";
import {
  useHumanTokenLabels,
  useInitializeCorpusAtoms,
} from "./context/CorpusAtom";
import {
  useSpanLabels,
  useHumanSpanLabels,
  useRelationLabels,
  useDocTypeLabels,
} from "./context/CorpusAtom";

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
  selectedAnalysis,
  selectedExtract,
  showAnnotationLabels,
  showStructuralAnnotations,
  viewStateVar,
} from "../../graphql/cache";

import { PDFDocumentLoadingTask } from "pdfjs-dist";
import { PDFPageInfo } from "./types/pdf";

import { Header, Icon, Modal, Progress } from "semantic-ui-react";
import AnnotatorSidebar from "./sidebar/AnnotatorSidebar";
import { WithSidebar } from "./common";
import { Result } from "../widgets/data-display/Result";
import { SidebarContainer } from "../common";
import { CenterOnPage } from "./CenterOnPage";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { AnnotatorRenderer } from "./display/components/AnnotatorRenderer";
import { ViewSettingsPopup } from "../widgets/popups/ViewSettingsPopup";
import { useUISettings } from "./hooks/useUISettings";
import { useAnalysisManager } from "./hooks/AnalysisHooks";

// Import Annotation Hooks
import {
  usePdfAnnotations,
  useStructuralAnnotations,
  useAnnotationObjs,
  useDocTypeAnnotations,
} from "./hooks/AnnotationHooks";
import { useAnnotationDisplay } from "./context/UISettingsAtom";
import styled from "styled-components";

// Loading pdf js libraries without cdn is a right PITA... cobbled together a working
// approach via these guides:
// https://stackoverflow.com/questions/63553008/looking-for-help-to-make-npm-pdfjs-dist-work-with-webpack-and-django
// https://github.com/mozilla/pdf.js/issues/12379
// https://github.com/mozilla/pdf.js/blob/f40bbe838e3c09b84e6f69df667a453c55de25f8/examples/webpack/main.js
const pdfjsLib = require("pdfjs-dist");

// Setting worker path to worker bundle.
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.js`;
// "../../build/webpack/pdf.worker.min.js';";
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
  opened_document: DocumentType;
  opened_corpus?: CorpusType;
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
  read_only,
  show_structural_annotations,
  show_selected_annotation_only,
  show_annotation_bounding_boxes,
  show_annotation_labels,
  onClose,
}: DocumentAnnotatorProps) => {
  const { width } = useWindowDimensions();
  const { setProgress, progress, zoomLevel, queryLoadingStates } =
    useUISettings({
      width,
    });

  // Using Jotai atoms for managing annotations
  const [pdfAnnotations, setPdfAnnotations] = useAtom(pdfAnnotationsAtom);
  const [structuralAnnotations, setStructuralAnnotations] = useAtom(
    structuralAnnotationsAtom
  );
  const [docTypeAnnotations, setDocTypeAnnotations] = useAtom(
    docTypeAnnotationsAtom
  );
  const {
    setShowSelectedOnly,
    setShowLabels,
    setShowStructural,
    setShowBoundingBoxes,
  } = useAnnotationDisplay();

  useEffect(() => {
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

  //TODO: refelect these in jotai state
  const displayOnlyTheseAnnotations = useReactiveVar(
    onlyDisplayTheseAnnotations
  );
  const edit_mode = useReactiveVar(editMode);
  const selected_analysis = useReactiveVar(selectedAnalysis);

  const { pdfDoc, setPdfDoc } = usePdfDoc();
  const { pages, setPages } = usePages();
  const { pageTextMaps, setPageTextMaps } = usePageTextMaps();
  const { setDocumentType } = useDocumentType();
  const { setDocText } = useDocText();

  // Use atoms for labels from CorpusAtom
  const { spanLabels, setSpanLabels } = useSpanLabels();
  const { humanSpanLabels, setHumanSpanLabels } = useHumanSpanLabels();
  const { humanTokenLabels, setHumanTokenLabels } = useHumanTokenLabels();
  const { relationLabels, setRelationLabels } = useRelationLabels();
  const { docTypeLabels, setDocTypeLabels } = useDocTypeLabels();

  const [
    getDocumentAnnotationsAndRelationships,
    { data: humanAnnotationsAndRelationshipsData, loading: humanDataLoading },
  ] = useLazyQuery<
    GetDocumentAnnotationsAndRelationshipsOutput,
    GetDocumentAnnotationsAndRelationshipsInput
  >(GET_DOCUMENT_ANNOTATIONS_AND_RELATIONSHIPS);

  // Set document and corpus atoms when component mounts
  const setSelectedDocument = useSetAtom(selectedDocumentAtom);
  const setSelectedCorpus = useSetAtom(selectedCorpusAtom);

  useEffect(() => {
    setSelectedDocument(opened_document);
    if (opened_corpus) {
      setSelectedCorpus(opened_corpus);
    }
  }, [opened_document, opened_corpus]);

  // Load annotations when in ANNOTATE mode and necessary conditions are met
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
          ...(selected_analysis
            ? { analysisId: selected_analysis.id }
            : { analysisId: "__none__" }),
        },
      });
    }
  }, [edit_mode, opened_corpus, opened_document, displayOnlyTheseAnnotations]);

  // Process annotations when data is loaded
  useEffect(() => {
    if (humanAnnotationsAndRelationshipsData) {
      processAnnotationsData(humanAnnotationsAndRelationshipsData);
    }
  }, [humanAnnotationsAndRelationshipsData]);

  // Store document type
  useEffect(() => {
    setDocumentType(opened_document.fileType ? opened_document.fileType : "");
  }, [opened_document]);

  // Handle opening of the annotator
  useEffect(() => {
    console.log(
      "1) React to DocumentAnnotator opening or document change",
      opened_document
    );
    if (open && opened_document) {
      console.log(
        "2) React to DocumentAnnotator opening or document change",
        opened_document
      );

      viewStateVar(ViewState.LOADING);

      const loadAnnotations = () => {
        if (opened_corpus?.labelSet && !displayOnlyTheseAnnotations) {
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
          // Create mock data of type GetDocumentAnnotationsAndRelationshipsOutput
          const mockData: GetDocumentAnnotationsAndRelationshipsOutput = {
            document: {
              ...opened_document,
              allAnnotations: displayOnlyTheseAnnotations,
              // Ensure other required fields are included
            },
            corpus: opened_corpus,
          };
          // Return a Promise that resolves to an object similar to the Apollo QueryResult
          return Promise.resolve({ data: mockData });
        }
        return Promise.resolve(null);
      };

      if (
        opened_document.fileType === "application/pdf" &&
        opened_document.pdfFile
      ) {
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
      } else if (opened_document.fileType === "application/txt") {
        console.log("React to TXT document");

        Promise.all([
          getDocumentRawText(opened_document.txtExtractFile || ""),
          loadAnnotations(),
        ])
          .then(([txt]) => {
            setDocText(txt);
            viewStateVar(ViewState.LOADED);
          })
          .catch((err) => {
            console.error("Error loading TXT document:", err);
            viewStateVar(ViewState.ERROR);
          });
      }
    }
  }, [open, opened_document, opened_corpus, displayOnlyTheseAnnotations]);

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

      // Update pdfAnnotations atom
      setPdfAnnotations(
        (prev) =>
          new PdfAnnotations(
            processedAnnotations,
            prev.relations,
            prev.docTypes,
            true
          )
      );

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
            rel.id
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
        console.log("React to label set", data.corpus.labelSet);
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

        setSpanLabels(filteredSpanLabels);
        setHumanSpanLabels(filteredSpanLabels);
        setHumanTokenLabels(filteredTokenLabels);
        setRelationLabels(filteredRelationLabels);
        setDocTypeLabels(filteredDocTypeLabels);
      }
    }
  };

  // Update view state when PDF document is loaded
  useEffect(() => {
    if (opened_document.fileType === "application/pdf") {
      if (pdfDoc && pageTextMaps && pages.length > 0) {
        console.log("React to PDF document loading properly", pdfDoc);
        viewStateVar(ViewState.LOADED);
      }
    }
  }, [pageTextMaps, pages, pdfDoc]);

  // Initialize corpus atoms
  useInitializeCorpusAtoms({
    selectedCorpus: opened_corpus,
    spanLabels: spanLabels,
    humanSpanLabels: humanSpanLabels,
    humanTokenLabels: humanTokenLabels,
    relationLabels: relationLabels,
    docTypeLabels: docTypeLabels,
    isLoading: humanDataLoading,
  });

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

  // New states for analyses and extracts
  const selected_extract = useReactiveVar(selectedExtract);

  const [loaded_page_for_annotation, setLoadedPageForAnnotation] =
    useState<ServerAnnotationType | null>(null);
  const [jumped_to_annotation_on_load, setJumpedToAnnotationOnLoad] = useState<
    string | null
  >(null);

  // Set document and corpus atoms when component mounts
  useEffect(() => {
    setSelectedDocument(opened_document);
    if (opened_corpus) {
      setSelectedCorpus(opened_corpus);
    }
  }, [opened_document, opened_corpus]);

  // Reset allow inputs when the mode switches
  useEffect(() => {
    allowUserInput(false);
  }, [editMode]);

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
    console.log(
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
              <Icon size="mini" name="file alternate outline" />
              Loading Document Data
              <Header.Subheader>
                Hang tight while we fetch the required data.
              </Header.Subheader>
            </Header>
            <Progress
              style={{ width: "300px" }}
              percent={progress}
              indicating
            />
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
              selected_analysis={selected_analysis}
              selected_extract={selected_extract}
              allowInput={false}
              editMode="ANNOTATE"
              datacells={dataCells}
              columns={columns}
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
      rendered_component = (
        <AnnotatorRenderer
          structural_annotations={structuralAnnotations}
          scrollToAnnotation={
            scrollToAnnotation && convertToServerAnnotation(scrollToAnnotation)
          }
          show_structural_annotations={show_structural_annotations}
          data_cells={dataCells}
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
              datacells={dataCells}
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
