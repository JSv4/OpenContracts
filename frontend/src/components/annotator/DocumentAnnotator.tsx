import {
  useReactiveVar,
  useApolloClient,
  ApolloClient,
  NormalizedCacheObject,
} from "@apollo/client";
import { useEffect } from "react";
import { useAtom, useSetAtom } from "jotai";

import {
  CorpusType,
  DocumentType,
  ExtractType,
  LabelDisplayBehavior,
} from "../../types/graphql-api";
import { ViewState, label_display_options } from "../types";
import { convertToServerAnnotation } from "../../utils/transform";
import _ from "lodash";
import {
  allowUserInput,
  displayAnnotationOnAnnotatorLoad,
  onlyDisplayTheseAnnotations,
  showAnnotationBoundingBoxes,
  showAnnotationLabels,
  showSelectedAnnotationOnly,
  viewStateVar,
} from "../../graphql/cache";
import { Header, Icon, Modal, Progress } from "semantic-ui-react";
import AnnotatorSidebar from "./sidebar/AnnotatorSidebar";
import { WithSidebar } from "./common";
import { Result } from "../widgets/data-display/Result";
import { SidebarContainer } from "../common";
import { CenterOnPage } from "./CenterOnPage";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { AnnotatorRenderer } from "./display/components/AnnotatorRenderer";
import { ViewSettingsPopup } from "../widgets/popups/ViewSettingsPopup";
import {
  viewStateAtom,
  editModeAtom,
  allowUserInputAtom,
  showStructuralAnnotationsAtom,
  showAnnotationLabelsAtom,
  pdfDocumentAtom,
  pdfPagesAtom,
  pageTextMapsAtom,
  rawTextAtom,
  analysesAtom,
  extractsAtom,
  selectedAnalysisAtom,
  selectedExtractAtom,
  structuralAnnotationsAtom,
  annotationObjectsAtom,
  docTypeAnnotationsAtom,
  relationshipAnnotationsAtom,
  dataCellsAtom,
  columnsAtom,
  relationLabelsAtom,
  docTypeLabelsAtom,
  spanLabelsAtom,
  humanSpanLabelsAtom,
  progressAtom,
  loadedPageForAnnotationAtom,
  jumpedToAnnotationOnLoadAtom,
  zoomLevelAtom,
  apolloClientAtom,
  processedAnalysisAnnotationsAtom,
  analysisAnnotationsEffectAtom,
  selectedAnalysisWithEffectsAtom,
  corpusAtom,
  modalOpenAtom,
  openContractDocAtom,
  initialAnalysesLoadEffectAtom,
  editModeEffectAtom,
  documentTypeEffectAtom,
  pdfLoadingEffectAtom,
  onlyDisplayTheseAnnotationsAtom,
  displayOnlyAnnotationsEffectAtom,
  dataLoadingAtom,
} from "./state/atoms";

// Loading pdf js libraries without cdn is a right PITA... cobbled together a working
// approach via these guides:
// https://stackoverflow.com/questions/63553008/looking-for-help-to-make-npm-pdfjs-dist-work-with-webpack-and-django
// https://github.com/mozilla/pdf.js/issues/12379
// https://github.com/mozilla/pdf.js/blob/f40bbe838e3c09b84e6f69df667a453c55de25f8/examples/webpack/main.js
const pdfjsLib = require("pdfjs-dist");

// Setting worker path to worker bundle.
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.js`;

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
  const apolloClient = useApolloClient() as ApolloClient<NormalizedCacheObject>;
  const setApolloClient = useSetAtom(apolloClientAtom);

  const { width } = useWindowDimensions();
  const responsive_sidebar_width = width <= 1000 ? "0px" : "400px";

  const [viewState] = useAtom(viewStateAtom);
  const [editMode, setEditMode] = useAtom(editModeAtom);
  const [allowInput] = useAtom(allowUserInputAtom);
  const [zoomLevel, setZoomLevel] = useAtom(zoomLevelAtom);
  const [showStructuralAnnotations, setShowStructuralAnnotations] = useAtom(
    showStructuralAnnotationsAtom
  );
  const [labelDisplayBehavior] = useAtom(showAnnotationLabelsAtom);

  const [, setOpenContractDoc] = useAtom(openContractDocAtom);
  const [doc, setDoc] = useAtom(pdfDocumentAtom);
  const [pages] = useAtom(pdfPagesAtom);
  const [pageTextMaps] = useAtom(pageTextMapsAtom);
  const [rawText] = useAtom(rawTextAtom);
  const [, setCorpus] = useAtom(corpusAtom);
  const [, setModalOpen] = useAtom(modalOpenAtom);

  const [analyses] = useAtom(analysesAtom);
  const [extracts] = useAtom(extractsAtom);
  const [selectedAnalysis, setSelectedAnalysis] = useAtom(selectedAnalysisAtom);
  const [selectedExtract, setSelectedExtract] = useAtom(selectedExtractAtom);

  const [structuralAnnotations] = useAtom(structuralAnnotationsAtom);
  const [annotationObjs] = useAtom(annotationObjectsAtom);
  const [docTypeAnnotations] = useAtom(docTypeAnnotationsAtom);
  const [relationshipAnnotations] = useAtom(relationshipAnnotationsAtom);
  const [dataCells] = useAtom(dataCellsAtom);
  const [columns] = useAtom(columnsAtom);

  const [relationLabels] = useAtom(relationLabelsAtom);
  const [docTypeLabels] = useAtom(docTypeLabelsAtom);
  const [spanLabels] = useAtom(spanLabelsAtom);
  const [humanSpanLabels] = useAtom(humanSpanLabelsAtom);

  const [progress] = useAtom(progressAtom);
  const [loadedPageForAnnotation, setLoadedPageForAnnotation] = useAtom(
    loadedPageForAnnotationAtom
  );
  const [jumpedToAnnotationOnLoad, setJumpedToAnnotationOnLoad] = useAtom(
    jumpedToAnnotationOnLoadAtom
  );

  const setAnalysisAnnotationsEffect = useSetAtom(
    analysisAnnotationsEffectAtom
  );
  const setSelectedAnalysisWithEffects = useSetAtom(
    selectedAnalysisWithEffectsAtom
  );
  useAtom(pdfLoadingEffectAtom);

  // Global state variables to jump to and/or load certain annotations on load
  const scrollToAnnotation = useReactiveVar(displayAnnotationOnAnnotatorLoad);
  const displayOnlyTheseAnnotationsValue = useReactiveVar(
    onlyDisplayTheseAnnotations
  );

  // Set the atom value whenever reactive var changes
  const setOnlyDisplayTheseAnnotations = useSetAtom(
    onlyDisplayTheseAnnotationsAtom
  );

  // Subscribe to effect
  useAtom(displayOnlyAnnotationsEffectAtom);

  // Update atom when reactive var changes
  useEffect(() => {
    setOnlyDisplayTheseAnnotations(displayOnlyTheseAnnotationsValue);
  }, [displayOnlyTheseAnnotationsValue]);

  // Initialize Apollo client
  useEffect(() => {
    setApolloClient(apolloClient);
  }, [apolloClient]);

  // Subscribe to effects
  useAtom(editModeEffectAtom);
  useAtom(documentTypeEffectAtom);

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
        jumpedToAnnotationOnLoad &&
        loadedPageForAnnotation &&
        loadedPageForAnnotation.id === jumpedToAnnotationOnLoad &&
        loadedPageForAnnotation.id === scrollToAnnotation.id
      ) {
        displayAnnotationOnAnnotatorLoad(undefined);
        setLoadedPageForAnnotation(null);
        setJumpedToAnnotationOnLoad(null);
      }
    }
  }, [jumpedToAnnotationOnLoad, loadedPageForAnnotation, scrollToAnnotation]);

  // Effect to load document and pawls layer
  useEffect(() => {
    setOpenContractDoc(opened_document);
    setCorpus(opened_corpus ?? null);
    setModalOpen(open);
  }, [open, opened_document, opened_corpus]);

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

  const setInitialAnalysesLoad = useSetAtom(initialAnalysesLoadEffectAtom);

  // Effect to trigger initial load
  useEffect(() => {
    setInitialAnalysesLoad();
  }, []); // Empty deps array for mount-only effect

  // Add this effect to handle annotation processing
  useEffect(() => {
    const processedData = processedAnalysisAnnotationsAtom;
    if (processedData) {
      setAnalysisAnnotationsEffect();
    }
  }, [processedAnalysisAnnotationsAtom]);

  const onSelectExtract = (extract: ExtractType | null) => {
    setSelectedExtract(extract);
    setSelectedAnalysis(null);
  };

  const [isDataLoading] = useAtom(dataLoadingAtom);

  let rendered_component = <></>;
  console.log("view_state", viewState, ViewState.LOADING, ViewState.LOADED);
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
              selected_analysis={selectedAnalysis}
              selected_extract={selectedExtract}
              allowInput={false}
              editMode="ANNOTATE"
              datacells={dataCells}
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
              selected_analysis={selectedAnalysis}
              selected_extract={selectedExtract}
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
          open={open}
          view_document_only={false}
          loading_message="Loading Annotator Data"
          data_loading={isDataLoading}
          doc={doc}
          rawText={rawText}
          pageTextMaps={pageTextMaps}
          pages={pages}
          zoom_level={zoomLevel}
          setZoomLevel={setZoomLevel}
          load_progress={progress}
          opened_document={opened_document}
          opened_corpus={opened_corpus}
          read_only={read_only}
          structural_annotations={structuralAnnotations}
          scrollToAnnotation={
            scrollToAnnotation && convertToServerAnnotation(scrollToAnnotation)
          }
          show_structural_annotations={showStructuralAnnotations}
          show_selected_annotation_only={show_selected_annotation_only}
          show_annotation_bounding_boxes={show_annotation_bounding_boxes}
          show_annotation_labels={show_annotation_labels}
          span_labels={spanLabels}
          human_span_labels={humanSpanLabels}
          relationship_labels={relationLabels}
          document_labels={docTypeLabels}
          annotation_objs={[
            ...annotationObjs,
            ...(scrollToAnnotation
              ? [convertToServerAnnotation(scrollToAnnotation)]
              : []),
          ]}
          doc_type_annotations={docTypeAnnotations}
          relationship_annotations={relationshipAnnotations}
          data_cells={dataCells}
          columns={columns}
          editMode={editMode}
          setEditMode={(m: "ANALYZE" | "ANNOTATE") => {
            setEditMode(m);
          }}
          allowInput={allowInput}
          setAllowInput={(v: boolean) => {
            allowUserInput(v);
          }}
          analyses={analyses}
          extracts={extracts}
          selected_analysis={selectedAnalysis}
          selected_extract={selectedExtract}
          onSelectAnalysis={setSelectedAnalysis}
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
              selected_analysis={selectedAnalysis}
              selected_extract={selectedExtract}
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
        setDoc(undefined);
      }}
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
            showStructuralAnnotations ? showStructuralAnnotations : false
          }
          toggleShowStructuralLabels={() =>
            setShowStructuralAnnotations(!showStructuralAnnotations)
          }
          show_annotation_bounding_boxes={show_annotation_bounding_boxes}
          showAnnotationBoundingBoxes={showAnnotationBoundingBoxes}
          label_display_behavior={labelDisplayBehavior}
          showAnnotationLabels={showAnnotationLabels}
          label_display_options={label_display_options}
        />
        {rendered_component}
      </Modal.Content>
    </Modal>
  );
};
