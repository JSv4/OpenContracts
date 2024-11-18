import { useCallback, useContext } from "react";
import styled from "styled-components";

import { PermissionTypes, TextSearchSpanResult } from "../../../types";
import { LabelType } from "../../../../types/graphql-api";
import { PDFStore } from "../../context";
import _ from "lodash";

import AnnotatorSidebar from "../../sidebar/AnnotatorSidebar";
import { SidebarContainer } from "../../../common";
import { AnnotatorTopbar } from "../../topbar/AnnotatorTopbar";
import useWindowDimensions from "../../../hooks/WindowDimensionHook";

import "./DocumentViewer.css";
import { RelationModal } from "../../../widgets/modals/RelationModal";
import { PDF } from "../../renderers/pdf/PDF";
import { DocTypeLabelDisplay } from "../../labels/doc_types/DocTypeLabelDisplay";
import { LabelSelector } from "../../labels/label_selector/LabelSelector";
import { Dimmer, Loader } from "semantic-ui-react";
import { Menu } from "semantic-ui-react";
import { PDFActionBar } from "../components/ActionBar";
import {
  setTopbarVisible,
  showSelectCorpusAnalyzerOrFieldsetModal,
} from "../../../../graphql/cache";
import { MOBILE_VIEW_BREAKPOINT } from "../../../../assets/configurations/constants";
import TxtAnnotator from "../../renderers/txt/TxtAnnotator";
import { ServerSpanAnnotation } from "../../types/annotations";
import { AnnotationStore } from "../../context/AnnotationStore";
import { useDocumentContext } from "../../context/DocumentContext";
import { useCorpusContext } from "../../context/CorpusContext";
import { useUIContext } from "../../context/UIContext";
import { useAnalysisContext } from "../../context/AnalysisContext";
import { ViewState } from "../../types/enums";

export const PDFViewContainer = styled.div`
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "row",
  justifyContent: "flex-start",
`;

export const PDFViewContent = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

export const StyledMenu = styled(Menu)`
  &.ui.menu {
    margin: 0;
    border-radius: 0;
  }
`;

const PDFContainer = styled.div<{ width?: number }>(
  ({ width }) => `
    overflow-y: scroll;
    overflow-x: scroll;
    height: 100%;
    background: #f7f9f9;
    padding: 1rem;
    flex: 1;
  `
);

interface DocumentViewerProps {
  read_only: boolean;
  editMode: "ANNOTATE" | "ANALYZE";
  allowInput: boolean;
  setEditMode: (m: "ANNOTATE" | "ANALYZE") => void | undefined | null;
  setAllowInput: (v: boolean) => void | undefined | null;
}

export const DocumentViewer = ({
  read_only,
  editMode,
  allowInput,
  setEditMode,
  setAllowInput,
}: DocumentViewerProps) => {
  const {
    selectedDocument,
    docText,
    pdfDoc,
    pages,
    scrollContainerRef,
    permissions: document_permissions,
  } = useDocumentContext();
  const { selectedCorpus, permissions: corpus_permissions } =
    useCorpusContext();
  const {
    analyses,
    extracts,
    datacells,
    columns,
    selectedAnalysis,
    onSelectAnalysis,
    selectedExtract,
    onSelectExtract,
  } = useAnalysisContext();
  const {
    showAnnotationBoundingBoxes,
    showAnnotationLabels,
    showSelectedAnnotationOnly,
    showStructuralAnnotations,
    setZoomLevel,
    zoomLevel,
    isMobile,
    hideSidebar,
    loadingMessage,
    shiftDown,
    setViewState,
  } = useUIContext();

  const {
    selectedAnnotations,
    spanLabels,
    activeSpanLabel,
    textSearchMatches,
    relationModalVisible,
    activeRelationLabel,
    setJumpedToAnnotationOnLoad,
    pdfAnnotations,
    humanSpanLabelChoices,
    createAnnotation,
    updateAnnotation,
    approveAnnotation,
    rejectAnnotation,
    deleteAnnotation,
    setSelectedAnnotations,
    setActiveLabel,
    showOnlySpanLabels,
  } = useContext(AnnotationStore);

  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;

  // We optionally hidesidebar where width < 1000 px OR we have annotation state hideSidebar flipped to false (which can happen in a number of places, including in sidebar)
  const banish_sidebar = hideSidebar || isMobile;
  const responsive_sidebar_width = hideSidebar ? "0px" : "400px";

  const onError = useCallback(
    (err: Error) => {
      console.error("Unexpected Error rendering PDF", err);
      setViewState(ViewState.ERROR);
    },
    [setViewState]
  );

  // TODO - These are dummy placeholders
  let actionBarItems = [
    {
      key: "action1",
      text: "Analyze",
      value: () => showSelectCorpusAnalyzerOrFieldsetModal(true),
    },
  ];

  if (use_mobile_layout) {
    actionBarItems = [
      ...actionBarItems,
      {
        key: "action2",
        text: "Show Analytics Topbar",
        value: () => setTopbarVisible(true),
      },
    ];
  }

  // React's Error Boundaries don't work for us because a lot of work is done by pdfjs in
  // a background task (a web worker). We instead setup a top level error handler that's
  // passed around as needed so we can display a nice error to the user when something

  const getSpan = (span: { start: number; end: number; text: string }) => {
    console.log("getSpan called with span", span);
    const selectedLabel = spanLabels.find(
      (label) => label.id === activeSpanLabel?.id
    );
    if (!selectedLabel) throw new Error("Selected label not found");

    return new ServerSpanAnnotation(
      0, // Page number (assuming single page)
      selectedLabel,
      span.text,
      false, // structural
      { start: span.start, end: span.end }, // json
      [], // myPermissions
      false, // approved
      false // rejected
    );
  };

  let view_components = <></>;

  console.log(
    "DocumentViewer adapting to filetype: ",
    selectedDocument.fileType
  );

  if (
    !selectedDocument ||
    (selectedDocument.fileType === "application/pdf" && !pdfDoc)
  ) {
    view_components = <></>;
  }

  switch (selectedDocument.fileType) {
    case "application/pdf":
      view_components = (
        <PDF
          read_only={read_only}
          corpus_permissions={corpus_permissions}
          doc_permissions={document_permissions}
          shiftDown={shiftDown}
          show_selected_annotation_only={showSelectedAnnotationOnly}
          show_annotation_bounding_boxes={showAnnotationBoundingBoxes}
          show_annotation_labels={showAnnotationLabels}
          setJumpedToAnnotationOnLoad={setJumpedToAnnotationOnLoad}
        />
      );
      break;
    case "application/txt":
      console.log("Application txt detected!");
      view_components = (
        <TxtAnnotator
          text={docText || ""}
          annotations={
            pdfAnnotations.annotations.filter(
              (annot) => annot instanceof ServerSpanAnnotation
            ) as ServerSpanAnnotation[]
          }
          searchResults={
            textSearchMatches?.filter(
              (match): match is TextSearchSpanResult => "start_index" in match
            ) ?? []
          }
          getSpan={getSpan}
          visibleLabels={showOnlySpanLabels ?? null}
          availableLabels={spanLabels ?? null}
          selectedLabelTypeId={activeSpanLabel?.id ?? null}
          read_only={read_only}
          allowInput={allowInput}
          zoom_level={zoomLevel}
          createAnnotation={createAnnotation}
          updateAnnotation={updateAnnotation}
          approveAnnotation={approveAnnotation}
          rejectAnnotation={rejectAnnotation}
          deleteAnnotation={deleteAnnotation}
          selectedAnnotations={selectedAnnotations}
          setSelectedAnnotations={setSelectedAnnotations}
          showStructuralAnnotations={showStructuralAnnotations}
          maxHeight="100%"
          maxWidth="100%"
        />
      );
      break;
    default:
      view_components = (
        <div>
          <p>Unsupported filetype: {selectedDocument.fileType}</p>
        </div>
      );
      break;
  }

  return (
    <PDFStore.Provider
      key={selectedDocument.id}
      value={{
        doc: pdfDoc,
        pages,
        onError,
        zoomLevel,
        setZoomLevel,
      }}
    >
      <div
        className="PDFViewContainer"
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          justifyContent: "flex-start",
        }}
      >
        {!read_only &&
        allowInput &&
        !selectedAnalysis &&
        corpus_permissions.includes(PermissionTypes.CAN_UPDATE) ? (
          <LabelSelector
            sidebarWidth={responsive_sidebar_width}
            humanSpanLabelChoices={humanSpanLabelChoices}
            activeSpanLabel={activeSpanLabel ? activeSpanLabel : null}
            setActiveLabel={setActiveLabel}
          />
        ) : (
          <></>
        )}
        {(!selectedExtract ||
          pdfAnnotations.annotations.filter(
            (annot) =>
              annot.annotationLabel.labelType === LabelType.DocTypeLabel
          ).length > 0) && (
          <DocTypeLabelDisplay
            read_only={
              Boolean(selectedAnalysis) ||
              Boolean(selectedExtract) ||
              read_only ||
              !corpus_permissions.includes(PermissionTypes.CAN_UPDATE)
            }
          />
        )}

        <Dimmer active={Boolean(loadingMessage)}>
          <Loader content={loadingMessage ? loadingMessage : ""} />
        </Dimmer>
        <SidebarContainer
          width={responsive_sidebar_width}
          {...(banish_sidebar ? { display: "none" } : {})}
        >
          <AnnotatorSidebar
            read_only={read_only}
            selected_analysis={selectedAnalysis}
            selected_extract={selectedExtract}
            selected_corpus={selectedCorpus}
            columns={columns}
            datacells={datacells}
            editMode={editMode}
            setEditMode={setEditMode}
            allowInput={allowInput}
            setAllowInput={setAllowInput}
          />
        </SidebarContainer>
        <div className="PDFViewTopBarWrapper" style={{ position: "relative" }}>
          <AnnotatorTopbar
            opened_corpus={selectedCorpus}
            opened_document={selectedDocument}
            extracts={extracts}
            analyses={analyses}
            selected_analysis={selectedAnalysis}
            selected_extract={selectedExtract}
            onSelectAnalysis={onSelectAnalysis}
            onSelectExtract={onSelectExtract}
          >
            <PDFActionBar
              zoom={zoomLevel}
              onZoomIn={() => setZoomLevel(zoomLevel + 0.1)}
              onZoomOut={() => setZoomLevel(zoomLevel - 0.1)}
              actionItems={actionBarItems}
            />
            <PDFContainer
              className="PDFContainer"
              ref={scrollContainerRef}
              width={banish_sidebar ? 1200 : undefined}
            >
              {activeRelationLabel &&
              !read_only &&
              corpus_permissions.includes(PermissionTypes.CAN_UPDATE) ? (
                <RelationModal
                  visible={relationModalVisible}
                  source={selectedAnnotations}
                  label={activeRelationLabel}
                />
              ) : null}
              {view_components}
            </PDFContainer>
          </AnnotatorTopbar>
        </div>
      </div>
    </PDFStore.Provider>
  );
};
