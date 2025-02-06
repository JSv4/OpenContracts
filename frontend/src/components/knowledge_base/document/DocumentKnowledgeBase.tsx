/**
 * DocumentKnowledgeBase Component
 *
 * This component now connects to our websocket backend IF the user is logged in
 * and we have a valid auth token in the Apollo reactive vars.
 * It will:
 *   1) Load existing conversation data from GraphQL (GET_CONVERSATIONS).
 *   2) If authenticated, open a WebSocket to stream new messages with partial updates
 *      (ASYNC_START, ASYNC_CONTENT, ASYNC_FINISH) or synchronous messages (SYNC_CONTENT).
 *   3) Display those messages in real time, appending them to the chat.
 *   4) Allow sending user queries through the socket.
 *
 * Responsive Enhancements:
 *   - The right sidebar uses a clamp-based width for medium screens, then switches
 *     to full-width on very small screens to prevent overflow.
 *   - Child content inside the sidebar is scrollable without causing horizontal overflow.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useQuery } from "@apollo/client";
import { Card, Button, Header, Modal } from "semantic-ui-react";
import {
  MessageSquare,
  FileText,
  Notebook,
  Database,
  User,
  Calendar,
  X,
  ChartNetwork,
  FileType,
  ArrowLeft,
  Search,
  BarChart3,
} from "lucide-react";
import {
  GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS,
  GetDocumentKnowledgeAndAnnotationsInput,
  GetDocumentKnowledgeAndAnnotationsOutput,
} from "../../../graphql/queries";
import { getDocumentRawText, getPawlsLayer } from "../../annotator/api/rest";
import { LabelType } from "../../../types/graphql-api";
import { motion, AnimatePresence } from "framer-motion";
import { PDFContainer } from "../../annotator/display/viewer/DocumentViewer";
import { PDFDocumentLoadingTask } from "pdfjs-dist";
import { useUISettings } from "../../annotator/hooks/useUISettings";
import useWindowDimensions from "../../hooks/WindowDimensionHook";
import { PDFPageInfo } from "../../annotator/types/pdf";
import { Token, ViewState } from "../../types";
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
} from "../../annotator/context/DocumentAtom";
import { createTokenStringSearch } from "../../annotator/utils";
import {
  convertToDocTypeAnnotations,
  convertToServerAnnotation,
} from "../../../utils/transform";
import {
  PdfAnnotations,
  RelationGroup,
} from "../../annotator/types/annotations";
import {
  pdfAnnotationsAtom,
  structuralAnnotationsAtom,
} from "../../annotator/context/AnnotationAtoms";
import { useCorpusState } from "../../annotator/context/CorpusAtom";
import { useAtom } from "jotai";
import { useInitialAnnotations } from "../../annotator/hooks/AnnotationHooks";
import { LabelSelector } from "../../annotator/labels/label_selector/LabelSelector";
import { PDF } from "../../annotator/renderers/pdf/PDF";
import TxtAnnotatorWrapper from "../../annotator/components/wrappers/TxtAnnotatorWrapper";
import { useAnnotationRefs } from "../../annotator/hooks/useAnnotationRefs";
import { DocTypeLabelDisplay } from "../../annotator/labels/doc_types/DocTypeLabelDisplay";
import { useAnnotationControls } from "../../annotator/context/UISettingsAtom";
import { RelationshipList } from "../../annotator/display/components/RelationshipList";
import { AnnotationList } from "../../annotator/display/components/AnnotationList";
import LayerSwitcher from "../../widgets/buttons/LayerSelector";
import DocNavigation from "../../widgets/buttons/DocNavigation";
import {
  ContentArea,
  ControlButton,
  ControlButtonGroupLeft,
  ControlButtonWrapper,
  HeaderContainer,
  LoadingPlaceholders,
  MainContentArea,
  MetadataRow,
  RelationshipCard,
  RelationshipPanel,
  RelationshipType,
  SlidingPanel,
  SummaryContent,
  TabButton,
  TabsColumn,
  EmptyState,
} from "./StyledContainers";
import { NoteModal, NotesGrid, PostItNote, NotesHeader } from "./StickyNotes";
import { SearchSidebarWidget } from "../../annotator/search_widget/SearchSidebarWidget";
import { useTextSearch } from "../../annotator/hooks/useTextSearch";
import {
  useAnalysisManager,
  useAnalysisSelection,
} from "../../annotator/hooks/AnalysisHooks";
import ExtractTraySelector from "../../analyses/ExtractTraySelector";
import AnalysisTraySelector from "../../analyses/AnalysisTraySelector";
import { SingleDocumentExtractResults } from "../../annotator/sidebar/SingleDocumentExtractResults";
import { FullScreenModal, SourceIndicator } from "./LayoutComponents";
import { ChatTray } from "./right_tray/ChatTray";
import { SafeMarkdown } from "../markdown/SafeMarkdown";

const pdfjsLib = require("pdfjs-dist");

// Setting worker path to worker bundle.
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.js`;

interface DocumentKnowledgeBaseProps {
  documentId: string;
  corpusId: string;
  onClose?: () => void;
}

// Panels from the old "AnnotatorSidebar":
const AnnotationsPanel: React.FC = () => {
  const { selectedAnalysis, selectedExtract } = useAnalysisSelection();

  return (
    <div className="sidebar__annotations" style={{ padding: "1rem" }}>
      {selectedAnalysis && (
        <SourceIndicator>
          Showing annotations from analysis: {selectedAnalysis.analyzer.id}
        </SourceIndicator>
      )}
      {selectedExtract && (
        <SourceIndicator>
          Showing annotations from extract: {selectedExtract.name}
        </SourceIndicator>
      )}
      <AnnotationList read_only={false} />
    </div>
  );
};

const RelationsPanel: React.FC = () => {
  const { selectedAnalysis } = useAnalysisSelection();
  const { selectedExtract } = useAnalysisSelection();

  return (
    <div className="sidebar__relation__annotation" style={{ padding: "1rem" }}>
      {selectedAnalysis && (
        <SourceIndicator>
          Showing relationships from analysis: {selectedAnalysis.analyzer.id}
        </SourceIndicator>
      )}
      {selectedExtract && (
        <SourceIndicator>
          Showing relationships from extract: {selectedExtract.name}
        </SourceIndicator>
      )}
      <RelationshipList read_only={false} />
    </div>
  );
};

const DocumentKnowledgeBase: React.FC<DocumentKnowledgeBaseProps> = ({
  documentId,
  corpusId,
  onClose,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // This holds the partial content coming in from the assistant
  const partialAssistantContent = useRef("");

  // Helper to compute the panel width following the clamp strategy
  const getPanelWidth = (windowWidth: number): number =>
    Math.min(Math.max(windowWidth * 0.65, 320), 520);

  const { setProgress, zoomLevel, setShiftDown, setZoomLevel } = useUISettings({
    width,
  });
  const [showGraph, setShowGraph] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("summary");

  // NEW: a layer to toggle between "knowledge" (summary) and "document" (PDF/TXT).
  const [activeLayer, setActiveLayer] = useState<"knowledge" | "document">(
    "knowledge"
  );

  const [viewState, setViewState] = useState<ViewState>(ViewState.LOADING);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);

  const { setDocumentType } = useDocumentType();
  const { setDocument } = useDocumentState();
  const { setDocText } = useDocText();
  const {
    pageTokenTextMaps: pageTextMaps,
    setPageTokenTextMaps: setPageTextMaps,
  } = usePageTokenTextMaps();
  const { setPages } = usePages();
  const [_, setPdfAnnotations] = useAtom(pdfAnnotationsAtom);
  const [, setStructuralAnnotations] = useAtom(structuralAnnotationsAtom);
  const { setCorpus } = useCorpusState();
  const { setInitialAnnotations } = useInitialAnnotations();
  const { setSearchText } = useSearchText();
  const { setPermissions } = useDocumentPermissions();
  const { setTextSearchState } = useTextSearchState();
  const { scrollContainerRef, registerRef } = useAnnotationRefs();
  const { activeSpanLabel, setActiveSpanLabel } = useAnnotationControls();

  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [markdownError, setMarkdownError] = useState<boolean>(false);

  const { selectedAnalysis, selectedExtract } = useAnalysisSelection();

  const {
    dataCells,
    columns,
    analyses,
    extracts,
    onSelectAnalysis,
    onSelectExtract,
  } = useAnalysisManager();

  useTextSearch();

  useEffect(() => {
    setSearchText("");
    setTextSearchState({
      matches: [],
      selectedIndex: 0,
    });
  }, [setTextSearchState]);

  useEffect(() => {
    // Reset or set the default selections.
    onSelectAnalysis(null);
    onSelectExtract(null);
  }, []);

  /**
   * processAnnotationsData
   *
   * Processes annotation data for the current document, updating state atoms
   * and corpus label sets. Accepts GetDocumentKnowledgeAndAnnotationsOutput,
   * which is what's returned from
   * the updated GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS query.
   *
   * @param data - The query result containing document + corpus info
   */
  const processAnnotationsData = (
    data: GetDocumentKnowledgeAndAnnotationsOutput
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
        console.log("All labels:", allLabels);
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

        console.log("Filtered span labels:", filteredSpanLabels);
        console.log("Filtered relation labels:", filteredRelationLabels);
        console.log("Filtered doc type labels:", filteredDocTypeLabels);
        console.log("Filtered token labels:", filteredTokenLabels);

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

  const containerRefCallback = useCallback(
    (node: HTMLDivElement | null) => {
      if (node !== null) {
        scrollContainerRef.current = node;
        registerRef("scrollContainer", scrollContainerRef);
      }
    },
    [scrollContainerRef, registerRef]
  );

  const handleKeyUpPress = useCallback(
    (event: { keyCode: any }) => {
      const { keyCode } = event;
      if (keyCode === 16) {
        setShiftDown(false);
      }
    },
    [setShiftDown]
  );

  const handleKeyDownPress = useCallback(
    (event: { keyCode: any }) => {
      const { keyCode } = event;
      if (keyCode === 16) {
        setShiftDown(true);
      }
    },
    [setShiftDown]
  );

  // Fetch combined knowledge & annotation data
  const {
    data: combinedData,
    loading,
    refetch,
  } = useQuery<
    GetDocumentKnowledgeAndAnnotationsOutput,
    GetDocumentKnowledgeAndAnnotationsInput
  >(GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS, {
    variables: {
      documentId,
      corpusId,
      analysisId: undefined,
    },
    onCompleted: (data) => {
      console.log("Combined data:", data);

      setDocumentType(data.document.fileType ?? "");
      setDocument(data.document);
      setPermissions(data.document.myPermissions ?? []);

      // --------------------------------------------------
      // Call our newly inserted processing function here:
      // --------------------------------------------------
      processAnnotationsData(data);

      // The rest: load PDF or TXT if relevant, etc.
      if (
        data.document.fileType === "application/pdf" &&
        data.document.pdfFile
      ) {
        // setViewComponents(<PDF read_only={false} />);
        const loadingTask: PDFDocumentLoadingTask = pdfjsLib.getDocument(
          data.document.pdfFile
        );
        loadingTask.onProgress = (p: { loaded: number; total: number }) => {
          setProgress(Math.round((p.loaded / p.total) * 100));
        };

        Promise.all([
          loadingTask.promise,
          getPawlsLayer(data.document.pawlsParseFile || ""),
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
            // console.log("Doc text:", doc_text);
            setPageTextMaps({
              ...string_index_token_map,
              ...pageTextMaps,
            });
            setDocText(doc_text);
          })
          .catch((err) => {
            console.error("Error loading PDF document:", err);
            setViewState(ViewState.ERROR);
          });
      } else if (
        data.document.fileType === "application/txt" ||
        data.document.fileType === "text/plain"
      ) {
        // setViewComponents(
        //   <TxtAnnotatorWrapper readOnly={true} allowInput={false} />
        // );

        Promise.all([getDocumentRawText(data.document.txtExtractFile || "")])
          .then(([txt]) => {
            setDocText(txt);
            setViewState(ViewState.LOADED);
          })
          .catch((err) => {
            console.error("Error loading TXT document:", err);
            setViewState(ViewState.ERROR);
          });
      } else {
        // setViewComponents(
        //   <div>
        //     <p>Unsupported filetype: {data.document.fileType}</p>
        //   </div>
        // );
      }
    },
    skip: !documentId || !corpusId,
  });

  useEffect(() => {
    if (!loading) {
      refetch({
        documentId,
        corpusId,
        analysisId: selectedAnalysis?.id,
      });
    }
  }, [selectedAnalysis, corpusId, refetch]);

  useEffect(() => {
    if (!loading) {
      refetch({
        documentId,
        corpusId,
        analysisId: selectedExtract?.id,
      });
    }
  }, [selectedExtract, corpusId, refetch]);

  const metadata = combinedData?.document ?? {
    title: "Loading...",
    fileType: "",
    creator: { email: "" },
    created: new Date().toISOString(),
  };

  const docRelationships = combinedData?.document?.allDocRelationships ?? [];

  // Load MD summary if available
  useEffect(() => {
    const fetchMarkdownContent = async () => {
      if (!combinedData?.document?.mdSummaryFile) {
        setMarkdownContent(null);
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
    fetchMarkdownContent();
  }, [combinedData?.document?.mdSummaryFile]);

  const [selectedNote, setSelectedNote] = useState<(typeof notes)[0] | null>(
    null
  );

  /* doc viewer (pdf or text snippet) */
  const { setPdfDoc } = usePdfDoc();

  // Minimal arrays of tabs for each layer
  const knowledgeTabs = [
    { key: "summary", label: "Summary", icon: <FileText size={18} /> },
    { key: "chat", label: "Chat", icon: <MessageSquare size={18} /> },
    { key: "notes", label: "Notes", icon: <Notebook size={18} /> },
    {
      key: "relationships",
      label: "Doc Relationships",
      icon: <ChartNetwork size={18} />,
    },
  ];
  const documentTabs = [
    { key: "chat", label: "Chat", icon: <MessageSquare size={18} /> },
    { key: "annotations", label: "Annotations", icon: <FileText size={18} /> },
    {
      key: "relations",
      label: "Annotation Relationships",
      icon: <ChartNetwork size={18} />,
    },
    { key: "search", label: "Search", icon: <Search size={18} /> },
    { key: "notes", label: "Notes", icon: <Notebook size={18} /> },
    {
      key: "relationships",
      label: "Doc Relationships",
      icon: <ChartNetwork size={18} />,
    },
  ];

  // Find your visibleTabs declaration (near line ~XXX) and update it:
  const baseTabs = activeLayer === "knowledge" ? knowledgeTabs : documentTabs;
  const extraTabs = [
    { key: "analyses", label: "Analyses", icon: <BarChart3 size={18} /> },
    { key: "extracts", label: "Extracts", icon: <FileText size={18} /> },
  ];
  // Combine the two arrays (for example, add extraTabs to the left nav):
  const visibleTabs = [...baseTabs, ...extraTabs];

  const notes = combinedData?.document?.allNotes ?? [];

  // Decide if we show the right panel
  useEffect(() => {
    if (!activeTab) {
      // If no tab is selected, always hide the panel
      setShowRightPanel(false);
    } else if (activeLayer === "knowledge") {
      setShowRightPanel(activeTab !== "summary");
    } else {
      // for the "document" layer, any tab means show the right panel
      setShowRightPanel(
        [
          "chat",
          "notes",
          "relationships",
          "search",
          "annotations",
          "relations",
          "analyses",
          "extracts",
        ].includes(activeTab)
      );
    }
  }, [activeLayer, activeTab]);

  // Add new state for showing load menu
  const [showLoad, setShowLoad] = useState(false);

  // The content for the right panel
  const rightPanelContent = (() => {
    switch (activeTab) {
      case "chat":
        return (
          <ChatTray
            setShowLoad={setShowLoad}
            showLoad={showLoad}
            documentId={documentId}
          />
        );
      case "notes":
        return (
          <div className="flex-1 overflow-auto">
            <NotesHeader>
              <h3>
                <Notebook size={20} />
                Document Notes
              </h3>
              <div className="meta">
                {notes.length} note{notes.length !== 1 ? "s" : ""}
              </div>
            </NotesHeader>
            {loading ? (
              <LoadingPlaceholders type="notes" />
            ) : notes.length === 0 ? (
              <EmptyState
                icon={<Notebook size={40} />}
                title="No notes yet"
                description="Start adding notes to this document"
              />
            ) : (
              <NotesGrid>
                {notes.map((note, index) => (
                  <PostItNote
                    key={note.id}
                    onClick={() => setSelectedNote(note)}
                    initial={{ opacity: 0, y: 20, rotate: 0 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      rotate:
                        ((index % 3) - 1) * 1.5 + (Math.random() * 1 - 0.5),
                      transition: {
                        opacity: { duration: 0.3 },
                        y: { duration: 0.3 },
                        rotate: { duration: 0.4, ease: "easeOut" },
                      },
                    }}
                    whileHover={{
                      y: -4,
                      rotate: ((index % 3) - 1) * 0.5,
                      transition: { duration: 0.2 },
                    }}
                  >
                    <div className="content">
                      <SafeMarkdown>{note.content}</SafeMarkdown>
                    </div>
                    <div className="meta">
                      {note.creator.email} •{" "}
                      {new Date(note.created).toLocaleDateString()}
                    </div>
                  </PostItNote>
                ))}
              </NotesGrid>
            )}
          </div>
        );
      case "search":
        return (
          <div className="p-4 flex-1 flex flex-col">
            <SearchSidebarWidget />
          </div>
        );
      case "relationships":
        return (
          <div className="p-4 flex-1 flex flex-col">
            {loading ? (
              <LoadingPlaceholders type="relationships" />
            ) : docRelationships.length === 0 ? (
              <EmptyState
                icon={<ChartNetwork size={40} />}
                title="No relationships yet"
                description="Connect this document with others to create relationships"
              />
            ) : (
              <RelationshipPanel>
                <h3>
                  <ChartNetwork size={20} />
                  Document Relationships
                </h3>
                {docRelationships.map((rel) => {
                  const otherDoc =
                    rel.sourceDocument.id === documentId
                      ? rel.targetDocument
                      : rel.sourceDocument;
                  return (
                    <RelationshipCard key={rel.id}>
                      <Card.Content>
                        <RelationshipType>
                          {rel.relationshipType}
                        </RelationshipType>
                        <Card.Header style={{ marginBottom: "0.5rem" }}>
                          {otherDoc.title || "Untitled Document"}
                        </Card.Header>
                        <Card.Meta>
                          <div
                            style={{
                              display: "flex",
                              gap: "1rem",
                              color: "#6c757d",
                            }}
                          >
                            <span>
                              <FileType
                                size={14}
                                style={{ marginRight: "0.25rem" }}
                              />
                              {otherDoc.fileType}
                            </span>
                            <span>
                              <User
                                size={14}
                                style={{ marginRight: "0.25rem" }}
                              />
                              {otherDoc.creator?.email}
                            </span>
                          </div>
                        </Card.Meta>
                        {rel.annotationLabel && (
                          <Card.Description style={{ marginTop: "0.75rem" }}>
                            {rel.annotationLabel.text}
                          </Card.Description>
                        )}
                      </Card.Content>
                    </RelationshipCard>
                  );
                })}
              </RelationshipPanel>
            )}
          </div>
        );
      case "annotations":
        return <AnnotationsPanel />;
      case "relations":
        return <RelationsPanel />;
      case "analyses":
        return (
          <div style={{ padding: "1rem" }}>
            <AnalysisTraySelector read_only={false} analyses={analyses} />
          </div>
        );
      case "extracts":
        return (
          <div style={{ padding: "1rem" }}>
            <AnimatePresence exitBeforeEnter>
              {selectedExtract ? (
                <motion.div
                  key="selected-extract"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      marginBottom: "1rem",
                      padding: "0.5rem",
                      background: "#f7f9f9",
                      borderRadius: "8px",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <h3 style={{ margin: 0 }}>{selectedExtract.name}</h3>
                      <p
                        style={{ margin: 0, fontSize: "0.9rem", color: "#555" }}
                      >
                        {"Placeholder for narrative content"}
                      </p>
                    </div>
                    <Button size="small" onClick={() => onSelectExtract(null)}>
                      Unselect
                    </Button>
                  </div>
                  <motion.div
                    key="extract-results"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <SingleDocumentExtractResults
                      datacells={dataCells}
                      columns={columns}
                    />
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div
                  key="extract-selector"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <ExtractTraySelector read_only={false} extracts={extracts} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      default:
        return null;
    }
  })();

  // The main viewer content:
  let viewerContent: JSX.Element = <></>;
  if (metadata.fileType === "application/pdf") {
    viewerContent = (
      <PDFContainer id="pdf-container" ref={containerRefCallback}>
        <LabelSelector
          sidebarWidth="0px"
          activeSpanLabel={activeSpanLabel ?? null}
          setActiveLabel={setActiveSpanLabel}
        />
        <DocTypeLabelDisplay />
        <PDF read_only={false} />
      </PDFContainer>
    );
  } else if (
    metadata.fileType === "application/txt" ||
    metadata.fileType === "text/plain"
  ) {
    viewerContent = (
      <PDFContainer ref={containerRefCallback}>
        <LabelSelector
          sidebarWidth="0px"
          activeSpanLabel={activeSpanLabel ?? null}
          setActiveLabel={setActiveSpanLabel}
        />
        <DocTypeLabelDisplay />
        <TxtAnnotatorWrapper readOnly={true} allowInput={false} />
      </PDFContainer>
    );
  } else {
    viewerContent = (
      <div style={{ padding: "2rem" }}>
        {viewState === ViewState.ERROR ? (
          <EmptyState
            icon={<FileText size={40} />}
            title="Unsupported File"
            description="This document type can't be displayed."
          />
        ) : (
          <EmptyState
            icon={<FileText size={40} />}
            title="Loading..."
            description="Please wait for the document to finish loading."
          />
        )}
      </div>
    );
  }

  const layers = [
    {
      id: "knowledge",
      label: "Knowledge Base",
      icon: <Database size={16} />,
      isActive: activeLayer === "knowledge",
      onClick: () => {
        setActiveLayer("knowledge");
        setActiveTab("summary");
      },
    },
    {
      id: "document",
      label: "Document",
      icon: <FileText size={16} />,
      isActive: activeLayer === "document",
      onClick: () => {
        setActiveLayer("document");
        if (
          ![
            "chat",
            "notes",
            "relationships",
            "annotations",
            "relations",
          ].includes(activeTab)
        ) {
          setActiveTab("chat");
        }
      },
    },
  ];

  // Modify the tab click handler to support toggling
  const handleTabClick = (tabKey: string) => {
    if (activeTab === tabKey) {
      // If clicking the active tab, deselect it and close panel
      setActiveTab("");
      setShowRightPanel(false);
    } else {
      // Otherwise, select the new tab
      setActiveTab(tabKey);
      setShowRightPanel(true);
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
        {/* LEFT SIDEBAR TABS */}
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
          {/* The main content depends on which layer is active */}
          {activeLayer === "knowledge" ? (
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
            // Document layer
            <div
              id="document-layer"
              style={{
                flex: 1,
                position: "relative",
                /*
                  Push the document to the left only when:
                  1) Not mobile
                  2) Right panel is open
                */
                marginRight:
                  !isMobile && showRightPanel
                    ? `${getPanelWidth(width)}px`
                    : undefined,
              }}
            >
              {viewerContent}
            </div>
          )}

          {/* FLOATING LAYER SWITCHER (bottom-right) */}

          <LayerSwitcher layers={layers} />

          {/* Floating navigation bar (top-left) */}
          {activeLayer === "document" ? (
            <DocNavigation
              zoomLevel={zoomLevel}
              onZoomIn={() => setZoomLevel(Math.min(zoomLevel + 0.1, 4))}
              onZoomOut={() => setZoomLevel(Math.min(zoomLevel - 0.1, 4))}
            />
          ) : null}
          {/* Right Panel, if needed */}
          <AnimatePresence>
            {showRightPanel && (
              <SlidingPanel
                initial={{ x: "100%", opacity: 0 }}
                animate={{ x: "0%", opacity: 1 }}
                exit={{ x: "100%", opacity: 0 }}
                transition={{
                  x: { type: "spring", damping: 30, stiffness: 300 },
                  opacity: { duration: 0.2, ease: "easeOut" },
                }}
              >
                <ControlButtonGroupLeft>
                  <ControlButtonWrapper>
                    <ControlButton
                      onClick={() => {
                        setShowRightPanel(false);
                        setActiveTab("");
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

      <NoteModal
        closeIcon
        open={!!selectedNote}
        onClose={() => setSelectedNote(null)}
        size="large"
      >
        {selectedNote && (
          <>
            <Modal.Content>
              <SafeMarkdown>{selectedNote.content}</SafeMarkdown>
            </Modal.Content>
            <div className="meta">
              Added by {selectedNote.creator.email} on{" "}
              {new Date(selectedNote.created).toLocaleString()}
            </div>
          </>
        )}
      </NoteModal>
    </FullScreenModal>
  );
};

export default DocumentKnowledgeBase;
