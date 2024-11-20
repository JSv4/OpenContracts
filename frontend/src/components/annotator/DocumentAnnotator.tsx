import { useReactiveVar } from "@apollo/client";
import { useEffect, useState, useMemo } from "react";

import {
  CorpusType,
  DocumentType,
  LabelDisplayBehavior,
  ServerAnnotationType,
} from "../../types/graphql-api";
import {
  ViewState,
  TokenId,
  PermissionTypes,
  label_display_options,
} from "../types";
import {
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
import { AnnotatorRenderer } from "./display/components/AnnotatorRenderer";
import { ViewSettingsPopup } from "../widgets/popups/ViewSettingsPopup";
import { PdfAnnotations } from "./types/annotations";
import { useUISettings } from "./hooks/useUISettings";
import { CorpusProvider } from "./context/CorpusContext";
import { useAnnotationManager } from "./hooks/useAnnotationManager";
import { useAnalysisManager } from "./hooks/useAnalysisData";

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

  // Effect to load document and pawls layer
  const annotationManager = useAnnotationManager();

  const { zoomLevel, progress, setProgress, queryLoadingStates } =
    useUISettings({
      width,
    });

  const {
    resetStates: analysisResetStates,
    onSelectAnalysis,
    onSelectExtract,
    dataCells,
    columns,
    extracts,
    analyses,
  } = useAnalysisManager(opened_document, opened_corpus);

  const responsive_sidebar_width = width <= 1000 ? "0px" : "400px";

  const view_state = useReactiveVar(viewStateVar);
  const edit_mode = useReactiveVar(editMode);
  const allow_input = useReactiveVar(allowUserInput);
  const show_structural_annotations = useReactiveVar(showStructuralAnnotations);
  const label_display_behavior = useReactiveVar(showAnnotationLabels);

  // Global state variables to jump to and/or load certain annotations on load
  const scrollToAnnotation = useReactiveVar(displayAnnotationOnAnnotatorLoad);
  const displayOnlyTheseAnnotations = useReactiveVar(
    onlyDisplayTheseAnnotations
  );

  // New states for analyses and extracts
  const selected_analysis = useReactiveVar(selectedAnalysis);
  const selected_extract = useReactiveVar(selectedExtract);

  const [loaded_page_for_annotation, setLoadedPageForAnnotation] =
    useState<ServerAnnotationType | null>(null);
  const [jumped_to_annotation_on_load, setJumpedToAnnotationOnLoad] = useState<
    string | null
  >(null);

  const isLoading = useMemo(
    () => Object.values(queryLoadingStates).some((loading) => loading),
    [queryLoadingStates]
  );

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

  // When annotations are provided to display only, update annotation manager's state
  useEffect(() => {
    console.log(
      "React to displayOnlyTheseAnnotations",
      displayOnlyTheseAnnotations
    );
    if (displayOnlyTheseAnnotations) {
      const annotations = convertToServerAnnotations(
        displayOnlyTheseAnnotations
      );
      annotationManager.setAnnotationObjs(annotations);

      // Clear other annotation types as they're not specified in onlyDisplayTheseAnnotations
      annotationManager.setDocTypeAnnotations([]);
      annotationManager.setPdfAnnotations(
        new PdfAnnotations(annotations, [], [], true)
      );
    }
  }, [displayOnlyTheseAnnotations]);

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
          open={open}
          read_only={true}
          view_document_only={false}
          loading_message="Loading Annotator Data"
          data_loading={false}
          load_progress={progress}
          structural_annotations={annotationManager.structuralAnnotations}
          scrollToAnnotation={
            scrollToAnnotation && convertToServerAnnotation(scrollToAnnotation)
          }
          show_structural_annotations={show_structural_annotations}
          show_selected_annotation_only={show_selected_annotation_only}
          show_annotation_bounding_boxes={show_annotation_bounding_boxes}
          show_annotation_labels={show_annotation_labels}
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
        <CorpusProvider
          selectedCorpus={opened_corpus}
          spanLabels={[]}
          humanSpanLabels={[]}
          relationLabels={[]}
          docTypeLabels={[]}
          isLoading={isLoading}
        >
          {rendered_component}
        </CorpusProvider>
      </Modal.Content>
    </Modal>
  );
};
