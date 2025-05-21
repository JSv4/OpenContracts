import {
  MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import styled from "styled-components";

import {
  AnalysisType,
  ColumnType,
  DatacellType,
  ExtractType,
} from "../../../../types/graphql-api";

import _ from "lodash";

import AnnotatorSidebar from "../../sidebar/AnnotatorSidebar";
import { SidebarContainer } from "../../../common";

import { AnnotatorTopbar } from "../../topbar/AnnotatorTopbar";
import useWindowDimensions from "../../../hooks/WindowDimensionHook";

import "./DocumentViewer.css";
import { PDF } from "../../renderers/pdf/PDF";
import { Menu } from "semantic-ui-react";
import { PDFActionBar } from "../components/ActionBar";
import { showSelectCorpusAnalyzerOrFieldsetModal } from "../../../../graphql/cache";
import { MOBILE_VIEW_BREAKPOINT } from "../../../../assets/configurations/constants";
import {
  ServerSpanAnnotation,
  RelationGroup,
  ServerTokenAnnotation,
} from "../../types/annotations";
import {
  useAdditionalUIStates,
  useAnnotationControls,
  useAnnotationSelection,
} from "../../context/UISettingsAtom";
import { LabelSelector } from "../../labels/label_selector/LabelSelector";
import { DocTypeLabelDisplay } from "../../labels/doc_types/DocTypeLabelDisplay";
import { useUISettings } from "../../hooks/useUISettings";
import { useCreateRelationship } from "../../hooks/AnnotationHooks";
import { useAnnotationRefs } from "../../hooks/useAnnotationRefs";
import TxtAnnotatorWrapper from "../../components/wrappers/TxtAnnotatorWrapper";
import { useSelectedDocument } from "../../context/DocumentAtom";

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

export const PDFContainer = styled.div<{ width?: number }>(
  ({ width }) => `
    overflow-y: scroll;
    overflow-x: scroll;
    height: calc(100vh - 120px);
    background: #f7f9f9;
    padding: 1rem;
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
    z-index: 1;
    -webkit-overflow-scrolling: touch; /* Enable smooth scrolling on iOS */
    
    @media (max-width: 768px) {
      padding: 0.5rem;
      width: 100%;
      min-width: 100%;
      overflow-x: auto;
      overflow-y: auto;
      /* Ensure content can be scrolled fully into view */
      scroll-padding: 1rem;
      /* Prevent any horizontal bounce/rubber-band effect */
      overscroll-behavior-x: none;
    }
  `
);

const ViewerLayout = styled.div`
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  overflow: hidden;
`;

const ContentLayout = styled.div<{
  sidebarVisible: boolean;
  sidebarWidth: string;
}>`
  display: flex;
  flex-direction: column;
  flex: 1;
  height: 100%;
  position: relative;
  margin-left: ${(props) => (props.sidebarVisible ? props.sidebarWidth : "0")};
  overflow: hidden;
`;

const MainContent = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
`;

const FixedSidebar = styled(SidebarContainer)<{ width: string }>`
  position: fixed;
  left: 0;
  top: 0;
  width: ${(props) => props.width};
  height: 100%;
  z-index: 10;
`;

const PDFActionBarWrapper = styled.div`
  position: sticky;
  top: 0;
  z-index: 1; /* Below AnnotatorTopbar */
`;

export const DocumentViewer = ({
  analyses,
  extracts,
  datacells,
  columns,
  scrollToAnnotation,
  allowInput,
  scroll_to_annotation_on_open,
  doc,
}: {
  allowInput: boolean;
  analyses: AnalysisType[];
  extracts: ExtractType[];
  datacells: DatacellType[];
  columns: ColumnType[];
  scrollToAnnotation?: ServerTokenAnnotation | ServerSpanAnnotation;
  scroll_to_annotation_on_open: ServerTokenAnnotation | null | undefined;
  doc: PDFDocumentProxy | undefined;
}) => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;
  const hasScrolledToAnnotation = useRef(false);

  const { selectedDocument } = useSelectedDocument();

  // Access annotation controls
  const { setSelectedAnnotations } = useAnnotationSelection();
  const { activeSpanLabel, setActiveSpanLabel } = useAnnotationControls();

  const { isSidebarVisible, readOnly, zoomLevel, setZoomLevel, setShiftDown } =
    useUISettings();

  // TODO - move this to <SelectionLayer/>
  const handleCreateRelationship = useCreateRelationship();

  const { annotationElementRefs, registerRef } = useAnnotationRefs();

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const containerRefCallback = useCallback(
    (node: HTMLDivElement | null) => {
      if (node) {
        scrollContainerRef.current = node;
        registerRef(
          "scrollContainer",
          scrollContainerRef as MutableRefObject<HTMLElement | null>
        );
      }
    },
    [registerRef]
  );

  const handleKeyUpPress = useCallback(
    (event: { keyCode: any }) => {
      const { keyCode } = event;
      if (keyCode === 16) {
        //console.log("Shift released");
        setShiftDown(false);
      }
    },
    [setShiftDown]
  );

  const handleKeyDownPress = useCallback(
    (event: { keyCode: any }) => {
      const { keyCode } = event;
      if (keyCode === 16) {
        //console.log("Shift depressed")
        setShiftDown(true);
      }
    },
    [setShiftDown]
  );

  // Handle scrolling to annotation on first mount
  useEffect(() => {
    if (
      scrollToAnnotation &&
      !hasScrolledToAnnotation.current &&
      annotationElementRefs.current[scrollToAnnotation.id]
    ) {
      annotationElementRefs.current[scrollToAnnotation.id]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      hasScrolledToAnnotation.current = true;
    }
  }, [scrollToAnnotation, annotationElementRefs]);

  useEffect(() => {
    window.addEventListener("keyup", handleKeyUpPress);
    window.addEventListener("keydown", handleKeyDownPress);
    return () => {
      window.removeEventListener("keyup", handleKeyUpPress);
      window.removeEventListener("keydown", handleKeyDownPress);
    };
  }, [handleKeyUpPress, handleKeyDownPress]);

  const { setTopbarVisible } = useAdditionalUIStates();

  // Update selectedAnnotations when selection changes (e.g., user selection)
  // This can be managed via props or other state management as per your application.
  // When scroll_to_annotation_on_open is provided and we haven't scrolled yet
  useEffect(() => {
    if (scroll_to_annotation_on_open && !hasScrolledToAnnotation.current) {
      setSelectedAnnotations([scroll_to_annotation_on_open.id]);
      hasScrolledToAnnotation.current = true;
    }
  }, [scroll_to_annotation_on_open, hasScrolledToAnnotation]);

  const [relationModalVisible, setRelationModalVisible] =
    useState<boolean>(false);

  // We optionally hidesidebar where width < 1000 px OR we have annotation state hideSidebar flipped to false (which can happen in a number of places, including in sidebar)
  const banish_sidebar = !isSidebarVisible || width <= 1000;
  const responsive_sidebar_width = !isSidebarVisible ? "0px" : "400px";

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
        value: () => {
          setTopbarVisible(true);
          return true;
        },
      },
    ];
  }

  const onRelationModalOk = (group: RelationGroup) => {
    // TODO - hook into this to sync local relationship changes to server
    handleCreateRelationship(group);
    setRelationModalVisible(false);
    setSelectedAnnotations([]);
  };

  const onRelationModalCancel = () => {
    // TODO - hook into this to sync local relationship changes to server
    setRelationModalVisible(false);
    setSelectedAnnotations([]);
  };

  let view_components = <></>;
  if (
    !selectedDocument ||
    (selectedDocument.fileType === "application/pdf" && !doc)
  ) {
    view_components = <></>;
  }

  if (selectedDocument) {
    type AnyAnnotation = ServerSpanAnnotation | ServerTokenAnnotation;

    const createAnnotationHandler = useCallback(
      async (_annotation: AnyAnnotation): Promise<void> => {
        /* no-op */
      },
      []
    );

    switch (selectedDocument.fileType) {
      case "application/pdf":
        view_components = (
          <PDF
            read_only={readOnly}
            createAnnotationHandler={createAnnotationHandler}
          />
        );
        break;
      case "application/txt":
      case "text/plain":
        console.log("Application txt detected!");
        view_components = (
          <TxtAnnotatorWrapper readOnly={readOnly} allowInput={allowInput} />
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
      <ViewerLayout>
        {!banish_sidebar && (
          <FixedSidebar width={responsive_sidebar_width}>
            <AnnotatorSidebar
              read_only={readOnly}
              columns={columns}
              datacells={datacells}
              allowInput={allowInput}
            />
          </FixedSidebar>
        )}

        <ContentLayout
          sidebarVisible={!banish_sidebar}
          sidebarWidth={responsive_sidebar_width}
        >
          <AnnotatorTopbar analyses={analyses} extracts={extracts} />

          <MainContent>
            <PDFActionBarWrapper>
              <PDFActionBar
                zoom={zoomLevel}
                onZoomIn={() => setZoomLevel(Math.min(zoomLevel + 0.1, 4))}
                onZoomOut={() => setZoomLevel(Math.min(zoomLevel - 0.1, 4))}
                actionItems={actionBarItems}
              />
            </PDFActionBarWrapper>

            <PDFContainer ref={containerRefCallback}>
              {/* {!read_only &&
              allowInput &&
              !selected_analysis &&
              corpusPermissions.includes(PermissionTypes.CAN_UPDATE) && ( */}
              <LabelSelector
                sidebarWidth={responsive_sidebar_width}
                activeSpanLabel={activeSpanLabel ?? null}
                setActiveLabel={setActiveSpanLabel}
              />
              <DocTypeLabelDisplay />
              {view_components}
            </PDFContainer>
          </MainContent>
        </ContentLayout>
      </ViewerLayout>
    );
  }

  // Add an explicit return for when selected_document is falsy
  return null; // or return a loading/empty state component
};
