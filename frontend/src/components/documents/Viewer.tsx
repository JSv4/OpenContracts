import React, { useState, useEffect, useCallback } from "react";
import { useQuery } from "@apollo/client";
import { Header, Modal, Loader } from "semantic-ui-react";
import {
  User,
  X,
  FileType,
  ArrowLeft,
  Search,
  FileText,
  Calendar,
  Database,
} from "lucide-react";
import {
  GET_DOCUMENT_DETAILS,
  GetDocumentDetailsInput,
  GetDocumentDetailsOutput,
} from "../../graphql/queries";
import { getDocumentRawText, getPawlsLayer } from "../annotator/api/rest";
import { AnimatePresence } from "framer-motion";
import { PDFContainer } from "../annotator/display/viewer/DocumentViewer";
import { PDFDocumentLoadingTask } from "pdfjs-dist";
import { useUISettings } from "../annotator/hooks/useUISettings";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { PDFPageInfo } from "../annotator/types/pdf";
import { Token, ViewState } from "../types";
import { toast } from "react-toastify";
import {
  useDocText,
  useDocumentPermissions,
  useDocumentState,
  useDocumentType,
  usePages,
  usePageTokenTextMaps,
  usePdfDoc,
  useSearchText,
  useTextSearchState,
} from "../annotator/context/DocumentAtom";
import { createTokenStringSearch } from "../annotator/utils";
import { getPermissions } from "../../utils/transform";
import { LabelSelector } from "../annotator/labels/label_selector/LabelSelector";
import { PDF } from "../annotator/renderers/pdf/PDF";
import TxtAnnotatorWrapper from "../annotator/components/wrappers/TxtAnnotatorWrapper";
import { DocTypeLabelDisplay } from "../annotator/labels/doc_types/DocTypeLabelDisplay";
import { useAnnotationControls } from "../annotator/context/UISettingsAtom";
import LayerSwitcher from "../widgets/buttons/LayerSelector";
import DocNavigation from "../widgets/buttons/DocNavigation";
import {
  ContentArea,
  ControlButton,
  ControlButtonGroupLeft,
  ControlButtonWrapper,
  HeaderContainer,
  LoadingPlaceholders,
  MainContentArea,
  MetadataRow,
  SlidingPanel,
  SummaryContent,
  TabButton,
  TabsColumn,
  EmptyState,
} from "../knowledge_base/document/StyledContainers";
import { SearchSidebarWidget } from "../annotator/search_widget/SearchSidebarWidget";
import { useTextSearch } from "../annotator/hooks/useTextSearch";
import { FullScreenModal } from "../knowledge_base/document/LayoutComponents";
import { useChatSourceState } from "../annotator/context/ChatSourceAtom";
import { useCreateAnnotation } from "../annotator/hooks/AnnotationHooks";

import { getDocument } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import * as pdfjs from "pdfjs-dist";
import { SafeMarkdown } from "../knowledge_base/markdown/SafeMarkdown";

// Setting worker path to worker bundle.
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

interface DocumentViewerBaseProps {
  documentId: string;
  onClose?: () => void;
}

export const DocumentViewer: React.FC<DocumentViewerBaseProps> = ({
  documentId,
  onClose,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Helper to compute the panel width following the clamp strategy
  const getPanelWidth = (windowWidth: number): number =>
    Math.min(Math.max(windowWidth * 0.65, 320), 520);

  const { setProgress, zoomLevel, setShiftDown, setZoomLevel } = useUISettings({
    width,
  });

  const [showGraph, setShowGraph] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("summary");
  const [activeLayer, setActiveLayer] = useState<"knowledge" | "document">(
    "knowledge"
  );
  const [viewState, setViewState] = useState<ViewState>(ViewState.LOADING);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(false);

  const { setDocumentType } = useDocumentType();
  const { setDocument } = useDocumentState();
  const { setDocText } = useDocText();
  const {
    pageTokenTextMaps: pageTextMaps,
    setPageTokenTextMaps: setPageTextMaps,
  } = usePageTokenTextMaps();
  const { setPages } = usePages();
  const { setSearchText } = useSearchText();
  const { setPermissions } = useDocumentPermissions();
  const { setTextSearchState } = useTextSearchState();
  const { activeSpanLabel, setActiveSpanLabel } = useAnnotationControls();
  const { setChatSourceState } = useChatSourceState();

  // Call the hook ONCE here
  const createAnnotationHandler = useCreateAnnotation();

  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [markdownError, setMarkdownError] = useState<boolean>(false);
  const [initialStateSet, setInitialStateSet] = useState<boolean>(false);

  useTextSearch();

  useEffect(() => {
    setSearchText("");
    setTextSearchState({
      matches: [],
      selectedIndex: 0,
    });
  }, [setTextSearchState]);

  // We'll store the measured containerWidth here
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  // Our PDFContainer callback ref
  const containerRefCallback = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      // Measure the node's width now
      const width = node.getBoundingClientRect().width;
      setContainerWidth(width);
    }
  }, []);

  // Whenever the window resizes, re-measure that container
  useEffect(() => {
    function handleResize() {
      const node = document.getElementById("pdf-container");
      if (!node) return;
      const width = node.getBoundingClientRect().width;
      setContainerWidth(width);
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch combined knowledge & annotation data
  const {
    data: combinedData,
    loading,
    error: queryError,
    refetch,
  } = useQuery<GetDocumentDetailsOutput, GetDocumentDetailsInput>(
    GET_DOCUMENT_DETAILS,
    {
      variables: {
        documentId,
      },
      onCompleted: (data) => {
        if (!data?.document) {
          console.error("onCompleted: No document data received.");
          setViewState(ViewState.ERROR);
          toast.error("Failed to load document details.");
          return;
        }
        setDocumentType(data.document.fileType ?? "");
        let processedDocData = {
          ...data.document,
          myPermissions: getPermissions(data.document.myPermissions) ?? [],
        };
        setDocument(processedDocData);
        setPermissions(data.document.myPermissions ?? []);

        if (
          data.document.fileType === "application/pdf" &&
          data.document.pdfFile
        ) {
          setViewState(ViewState.LOADING); // Set loading state
          const loadingTask: PDFDocumentLoadingTask = getDocument(
            data.document.pdfFile
          );
          loadingTask.onProgress = (p: { loaded: number; total: number }) => {
            setProgress(Math.round((p.loaded / p.total) * 100));
          };

          const pawlsPath = data.document.pawlsParseFile || "";

          Promise.all([
            loadingTask.promise,
            getPawlsLayer(pawlsPath), // Fetches PAWLS via REST
          ])
            .then(([pdfDocProxy, pawlsData]) => {
              // --- DETAILED LOGGING FOR PAWLS DATA ---
              if (!pawlsData) {
                console.error(
                  "onCompleted: PAWLS data received is null or undefined!"
                );
              }
              // --- END DETAILED LOGGING ---

              if (!pdfDocProxy) {
                throw new Error("PDF document proxy is null or undefined.");
              }
              setPdfDoc(pdfDocProxy);

              const loadPagesPromises: Promise<PDFPageInfo>[] = [];
              for (let i = 1; i <= pdfDocProxy.numPages; i++) {
                const pageNum = i; // Capture page number for logging
                loadPagesPromises.push(
                  pdfDocProxy.getPage(pageNum).then((p) => {
                    let pageTokens: Token[] = [];
                    const pageIndex = p.pageNumber - 1;

                    if (
                      !pawlsData ||
                      !Array.isArray(pawlsData) ||
                      pageIndex >= pawlsData.length
                    ) {
                      console.warn(
                        `Page ${pageNum}: PAWLS data index out of bounds. Index: ${pageIndex}, Length: ${pawlsData.length}`
                      );
                      pageTokens = [];
                    } else {
                      const pageData = pawlsData[pageIndex];

                      if (!pageData) {
                        pageTokens = [];
                      } else if (typeof pageData.tokens === "undefined") {
                        pageTokens = [];
                      } else if (!Array.isArray(pageData.tokens)) {
                        console.error(
                          `Page ${pageNum}: CRITICAL - pageData.tokens is not an array at index ${pageIndex}! Type: ${typeof pageData.tokens}`
                        );
                        pageTokens = [];
                      } else {
                        pageTokens = pageData.tokens;
                      }
                    }
                    return new PDFPageInfo(p, pageTokens, zoomLevel);
                  }) as unknown as Promise<PDFPageInfo>
                );
              }
              return Promise.all(loadPagesPromises);
            })
            .then((loadedPages) => {
              setPages(loadedPages);
              const { doc_text, string_index_token_map } =
                createTokenStringSearch(loadedPages);
              setPageTextMaps({
                ...string_index_token_map,
                ...pageTextMaps,
              });
              setDocText(doc_text);
              setViewState(ViewState.LOADED); // Set loaded state only after everything is done
            })
            .catch((err) => {
              // Log the specific error causing the catch
              console.error("Error during PDF/PAWLS loading Promise.all:", err);
              setViewState(ViewState.ERROR);
              toast.error(
                `Error loading PDF details: ${
                  err instanceof Error ? err.message : String(err)
                }`
              );
            });
        } else if (
          (data.document.fileType === "application/txt" ||
            data.document.fileType === "text/plain") &&
          data.document.txtExtractFile
        ) {
          console.log("onCompleted: Loading TXT", data.document.txtExtractFile);
          setViewState(ViewState.LOADING); // Set loading state
          getDocumentRawText(data.document.txtExtractFile)
            .then((txt) => {
              setDocText(txt);
              setViewState(ViewState.LOADED);
            })
            .catch((err) => {
              setViewState(ViewState.ERROR);
              toast.error(
                `Error loading text content: ${
                  err instanceof Error ? err.message : String(err)
                }`
              );
            });
        } else {
          console.warn(
            "onCompleted: Unsupported file type or missing file path.",
            data.document.fileType
          );
          setViewState(ViewState.ERROR); // Treat unsupported as error
        }
      },
      onError: (error) => {
        console.error("GraphQL Query Error fetching document data:", error);
        toast.error(`Failed to load document details: ${error.message}`);
        setViewState(ViewState.ERROR);
      },
      fetchPolicy: "network-only",
      nextFetchPolicy: "no-cache",
      skip: !documentId,
    }
  );

  const metadata = combinedData?.document ?? {
    title: "Loading...",
    fileType: "",
    creator: { email: "" },
    created: new Date().toISOString(),
  };

  // Load MD summary if available
  useEffect(() => {
    const fetchMarkdownContent = async () => {
      if (!combinedData?.document?.mdSummaryFile) {
        setMarkdownContent(null);
        setMarkdownError(false);
        return;
      }
      try {
        const response = await fetch(combinedData.document.mdSummaryFile);
        if (!response.ok) throw new Error("Failed to fetch markdown content");
        const text = await response.text();
        setMarkdownContent(text);
        setMarkdownError(false);
      } catch (error) {
        console.error("Error fetching markdown content:", error);
        setMarkdownContent(null);
        setMarkdownError(true);
      }
    };

    if (combinedData?.document) {
      fetchMarkdownContent();
    }
    // Ensure markdown state is reset if document/summary file changes to undefined
    if (!combinedData?.document?.mdSummaryFile && combinedData?.document) {
      setMarkdownContent(null);
      setMarkdownError(false);
    }
  }, [
    combinedData?.document,
    combinedData?.document?.mdSummaryFile,
    setMarkdownContent,
    setMarkdownError,
  ]);

  // Effect to set initial layer and tab based on summary availability
  useEffect(() => {
    // Ensure main data is loaded, summary fetch attempt has been reflected in markdownContent/markdownError,
    // and we haven't set the initial state yet.
    if (!loading && combinedData && !initialStateSet) {
      const hasSummary = !!markdownContent && !markdownError;

      if (hasSummary) {
        setActiveLayer("knowledge");
        setActiveTab("summary");
        setShowRightPanel(false);
      } else {
        // No summary available or error loading summary
        setActiveLayer("document");
        setActiveTab(""); // No specific tab active on document layer initially
        setShowRightPanel(false);
      }
      setInitialStateSet(true);
    }
  }, [
    loading,
    combinedData,
    markdownContent,
    markdownError,
    initialStateSet,
    setActiveLayer,
    setActiveTab,
    setShowRightPanel,
    setInitialStateSet,
  ]);

  /* doc viewer (pdf or text snippet) */
  const { setPdfDoc } = usePdfDoc();

  // Minimal arrays are replaced by a single unified array of tabs:
  // Each tab includes which layer it wants by default ("knowledge", "document", or "both").
  // If tab.layer === "document", we switch activeLayer to "document".
  // If tab.layer === "knowledge", we switch activeLayer to "knowledge".
  // If tab.layer === "both", we don't change the layer from whatever it currently is.
  interface NavTab {
    key: string;
    label: string;
    icon: React.ReactNode;
    layer: "knowledge" | "document" | "both";
  }

  const allTabs: NavTab[] = [
    {
      key: "summary",
      label: "Summary",
      icon: <FileText size={18} />,
      layer: "knowledge",
    },
    {
      key: "search",
      label: "Search",
      icon: <Search size={18} />,
      layer: "document",
    },
  ];

  // We no longer base tabs on the layer. Instead, we always show allTabs.
  const visibleTabs = allTabs;

  const notes = combinedData?.document?.allNotes ?? [];

  const [isExiting, setIsExiting] = useState(false);

  const handleBack = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsExiting(false);
    }, 200); // Match the slideOut animation duration
  };

  const rightPanelContent = (() => {
    switch (activeTab) {
      case "search":
        return (
          <div
            className="p-4 flex-1 flex flex-col"
            style={{ overflow: "hidden" }}
          >
            <SearchSidebarWidget />
          </div>
        );
      case "summary":
      default:
        return null;
    }
  })();

  // The main viewer content:
  let viewerContent: JSX.Element = <></>;
  if (metadata.fileType === "application/pdf") {
    viewerContent = (
      <PDFContainer id="pdf-container" ref={containerRefCallback}>
        {viewState === ViewState.LOADED ? (
          <PDF
            read_only={false}
            containerWidth={containerWidth}
            createAnnotationHandler={createAnnotationHandler}
          />
        ) : viewState === ViewState.LOADING ? (
          <Loader active inline="centered" content="Loading PDF..." />
        ) : (
          <EmptyState
            icon={<FileText size={40} />}
            title="Error Loading PDF"
            description="Could not load the PDF document."
          />
        )}
      </PDFContainer>
    );
  } else if (
    metadata.fileType === "application/txt" ||
    metadata.fileType === "text/plain"
  ) {
    viewerContent = (
      <PDFContainer id="pdf-container" ref={containerRefCallback}>
        {viewState === ViewState.LOADED ? (
          <TxtAnnotatorWrapper readOnly={true} allowInput={false} />
        ) : viewState === ViewState.LOADING ? (
          <Loader active inline="centered" content="Loading Text..." />
        ) : (
          <EmptyState
            icon={<FileText size={40} />}
            title="Error Loading Text"
            description="Could not load the text file."
          />
        )}
      </PDFContainer>
    );
  } else {
    viewerContent = (
      <div
        style={{
          padding: "2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
        }}
      >
        {viewState === ViewState.LOADING ? (
          <Loader active inline="centered" content="Loading Document..." />
        ) : (
          <EmptyState
            icon={<FileText size={40} />}
            title="Unsupported File"
            description="This document type can't be displayed."
          />
        )}
      </div>
    );
  }

  // Decide which content is in the center based on activeLayer
  const mainLayerContent =
    activeLayer === "knowledge" ? (
      <SummaryContent className={showRightPanel ? "dimmed" : ""}>
        {loading ? (
          <LoadingPlaceholders type="summary" />
        ) : markdownContent ? (
          <div className="prose max-w-none">
            <SafeMarkdown>{markdownContent}</SafeMarkdown>
          </div>
        ) : (
          <EmptyState
            icon={<FileText size={40} />}
            title="No summary available"
            description={
              markdownError
                ? "Failed to load the document summary"
                : "This document doesn't have a summary yet"
            }
          />
        )}
      </SummaryContent>
    ) : (
      <div
        id="document-layer"
        style={{
          flex: 1,
          position: "relative",
          marginRight:
            !isMobile && showRightPanel
              ? `${getPanelWidth(width)}px`
              : undefined,
        }}
      >
        {viewerContent}
      </div>
    );

  // Minimal onClick logic to unify the nav:
  const handleTabClick = (tabKey: string) => {
    if (activeTab === tabKey) {
      // If clicking the same tab, deselect it and close panel
      setActiveTab("");
      setShowRightPanel(false);
      return;
    }

    setActiveTab(tabKey);

    // Determine which layer to switch to based on tab's declared layer
    const clickedTab = visibleTabs.find((t) => t.key === tabKey);
    if (clickedTab?.layer === "document") {
      setActiveLayer("document");
    } else if (clickedTab?.layer === "knowledge") {
      setActiveLayer("knowledge");
    }
    // If layer === 'both', remain on the current activeLayer

    // Show right panel only if the tab has content for it
    // In Viewer.tsx, only 'search' has right panel content.
    if (tabKey === "search") {
      setShowRightPanel(true);
    } else {
      setShowRightPanel(false);
    }
  };

  return (
    <FullScreenModal
      id="knowledge-base-modal"
      open={true}
      onClose={onClose}
      closeIcon
    >
      <HeaderContainer>
        <div>
          <Header as="h2" style={{ margin: 0 }}>
            {metadata.title}
          </Header>
          <MetadataRow>
            <span>
              <FileType size={16} /> {metadata.fileType}
            </span>
            <span>
              <User size={16} /> {metadata.creator?.email}
            </span>
            <span>
              <Calendar size={16} /> Created:{" "}
              {new Date(metadata.created).toLocaleDateString()}
            </span>
          </MetadataRow>
        </div>
      </HeaderContainer>

      <ContentArea id="content-area">
        {/* LEFT SIDEBAR TABS (always visible now) */}
        <TabsColumn
          collapsed={sidebarCollapsed}
          onMouseEnter={() => setSidebarCollapsed(false)}
          onMouseLeave={() => setSidebarCollapsed(true)}
        >
          {visibleTabs.map((t) => (
            <TabButton
              key={t.key}
              tabKey={t.key}
              active={activeTab === t.key}
              onClick={() => handleTabClick(t.key)}
              collapsed={sidebarCollapsed}
            >
              {t.icon}
              <span>{t.label}</span>
            </TabButton>
          ))}
        </TabsColumn>

        <MainContentArea id="main-content-area">
          {mainLayerContent}
          <LabelSelector
            sidebarWidth="0px"
            activeSpanLabel={activeSpanLabel ?? null}
            setActiveLabel={setActiveSpanLabel}
            showRightPanel={showRightPanel}
          />
          <DocTypeLabelDisplay showRightPanel={showRightPanel} />
          <LayerSwitcher
            layers={[
              {
                id: "knowledge",
                label: "Knowledge Base",
                icon: <Database size={16} />,
                isActive: activeLayer === "knowledge",
                onClick: () => {
                  setActiveLayer("knowledge");
                  setActiveTab("summary");
                  // Clear chat selections when switching to knowledge layer
                  setChatSourceState((prev) => ({
                    ...prev,
                    selectedMessageId: null,
                    selectedSourceIndex: null,
                  }));
                },
              },
              {
                id: "document",
                label: "Document",
                icon: <FileText size={16} />,
                isActive: activeLayer === "document",
                onClick: () => {
                  setActiveLayer("document");
                  // If we had no active tab or knowledge tab, default to e.g. "chat" in doc
                  if (!["search"].includes(activeTab)) {
                    setActiveTab("chat");
                  }
                },
              },
            ]}
          />

          {activeLayer === "document" && (
            <DocNavigation
              zoomLevel={zoomLevel}
              onZoomIn={() => setZoomLevel(Math.min(zoomLevel + 0.1, 4))}
              onZoomOut={() => setZoomLevel(Math.min(zoomLevel - 0.1, 4))}
            />
          )}
          {/* Right Panel, if needed */}
          <AnimatePresence>
            {showRightPanel && activeTab && (
              <SlidingPanel
                initial={{ x: "100%", opacity: 0 }}
                animate={{ x: "0%", opacity: 1 }}
                exit={{ x: "100%", opacity: 0 }}
                transition={{
                  x: { type: "spring", damping: 30, stiffness: 300 },
                  opacity: { duration: 0.2, ease: "easeOut" },
                }}
                panelWidth={getPanelWidth(width)}
              >
                <ControlButtonGroupLeft>
                  <ControlButtonWrapper>
                    <ControlButton
                      onClick={() => {
                        setActiveTab("");
                        setShowRightPanel(false);
                      }}
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <div className="energy-core" />
                      <div className="arrow-wrapper">
                        <ArrowLeft strokeWidth={3} />
                      </div>
                    </ControlButton>
                  </ControlButtonWrapper>
                </ControlButtonGroupLeft>
                {rightPanelContent}
              </SlidingPanel>
            )}
          </AnimatePresence>
        </MainContentArea>
      </ContentArea>

      <Modal
        open={showGraph}
        onClose={() => setShowGraph(false)}
        size="large"
        basic
      >
        <Modal.Content>
          {/* Graph or relationship visualization */}
        </Modal.Content>
        <Modal.Actions>
          <ControlButton onClick={() => setShowGraph(false)}>
            <X size={16} />
          </ControlButton>
        </Modal.Actions>
      </Modal>
    </FullScreenModal>
  );
};
