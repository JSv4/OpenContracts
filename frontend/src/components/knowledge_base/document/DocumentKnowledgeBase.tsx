import React, { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@apollo/client";
import { Card, Button, Header, Modal, Loader } from "semantic-ui-react";
import {
  MessageSquare,
  FileText,
  Notebook,
  User,
  Calendar,
  X,
  ChartNetwork,
  FileType,
  ArrowLeft,
  Search,
  BarChart3,
  Edit3,
  BookOpen,
  Database,
  Eye,
  EyeOff,
  Settings,
  Maximize2,
  GitBranch,
  Clock,
  User as UserIcon,
  Save,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  EditIcon,
} from "lucide-react";
import {
  GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS,
  GetDocumentKnowledgeAndAnnotationsInput,
  GetDocumentKnowledgeAndAnnotationsOutput,
} from "../../../graphql/queries";
import { getDocumentRawText, getPawlsLayer } from "../../annotator/api/rest";
import { CorpusType, LabelType } from "../../../types/graphql-api";
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
  getPermissions,
} from "../../../utils/transform";
import {
  PdfAnnotations,
  RelationGroup,
} from "../../annotator/types/annotations";
import {
  pdfAnnotationsAtom,
  structuralAnnotationsAtom,
} from "../../annotator/context/AnnotationAtoms";
import {
  CorpusState,
  useCorpusState,
} from "../../annotator/context/CorpusAtom";
import { useAtom } from "jotai";
import { useInitialAnnotations } from "../../annotator/hooks/AnnotationHooks";
import { UnifiedLabelSelector } from "../../annotator/labels/UnifiedLabelSelector";
import { PDF } from "../../annotator/renderers/pdf/PDF";
import TxtAnnotatorWrapper from "../../annotator/components/wrappers/TxtAnnotatorWrapper";
import { useAnnotationControls } from "../../annotator/context/UISettingsAtom";
import { RelationshipList } from "../../annotator/display/components/RelationshipList";
import { AnnotationList } from "../../annotator/display/components/AnnotationList";
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
  KnowledgeLayerContainer,
  VersionHistorySidebar,
  VersionHistoryHeader,
  VersionList,
  VersionItem,
  KnowledgeContent,
  KnowledgeHeader,
  KnowledgeBody,
  EditModeToolbar,
  MarkdownEditor,
  CollapseSidebarButton,
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
import { NewChatFloatingButton } from "./ChatContainers";
import { SelectDocumentAnalyzerModal } from "./SelectDocumentAnalyzerModal";
import { SelectDocumentFieldsetModal } from "./SelectDocumentFieldsetModal";
import { useAnnotationSelection } from "../../annotator/hooks/useAnnotationSelection";
import styled from "styled-components";
import { Icon } from "semantic-ui-react";
import { useChatSourceState } from "../../annotator/context/ChatSourceAtom";
import { useCreateAnnotation } from "../../annotator/hooks/AnnotationHooks";
import { useScrollContainerRef } from "../../annotator/context/DocumentAtom";
import { useChatPanelWidth } from "../../annotator/context/UISettingsAtom";
import {
  ResizeHandle,
  WidthControlMenu,
  WidthControlToggle,
  WidthMenuItem,
  MenuDivider,
  ChatIndicator,
} from "./StyledContainers";
import { format } from "date-fns";
import { NoteEditor } from "./NoteEditor";
import { NewNoteModal } from "./NewNoteModal";
import { useUrlAnnotationSync } from "../../../hooks/useUrlAnnotationSync";
import { FloatingSummaryPreview } from "./floating_summary_preview/FloatingSummaryPreview";
import { ZoomControls } from "./ZoomControls";
import { useSummaryVersions } from "./floating_summary_preview/hooks/useSummaryVersions";

import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import { openedDocument, openedCorpus } from "../../../graphql/cache";
import { selectedAnnotationIds } from "../../../graphql/cache";
import { useAuthReady } from "../../../hooks/useAuthReady";

// New imports for unified feed
import {
  UnifiedContentFeed,
  SidebarControlBar,
  ContentFilters,
  SortOption,
  SidebarViewMode,
} from "./unified_feed";
import { FloatingDocumentControls } from "./FloatingDocumentControls";
import { FloatingDocumentInput } from "./FloatingDocumentInput";

// Setting worker path to worker bundle.
GlobalWorkerOptions.workerSrc = workerSrc;

interface DocumentKnowledgeBaseProps {
  documentId: string;
  corpusId: string;
  /**
   * Optional list of annotation IDs that should be selected when the modal opens.
   * When provided the component will seed `selectedAnnotationsAtom`, triggering
   * the usual scroll-to-annotation behaviour in the PDF/TXT viewers.
   */
  initialAnnotationIds?: string[];
  onClose?: () => void;
}

// Panels from the old "AnnotatorSidebar":
const AnnotationsPanel: React.FC = () => {
  const { selectedAnalysis, selectedExtract } = useAnalysisSelection();

  return (
    <div
      className="sidebar__annotations"
      style={{ padding: "1rem", overflowY: "hidden" }}
    >
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
    <div
      className="sidebar__relation__annotation"
      style={{ padding: "1rem", overflowY: "hidden" }}
    >
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

const SelectedExtractHeader = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 1.25rem;
  padding: 1rem 1.25rem;
  background: linear-gradient(135deg, #f8fafc, rgba(255, 255, 255, 0.8));
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  backdrop-filter: blur(8px);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    background: linear-gradient(135deg, #f1f5f9, rgba(255, 255, 255, 0.9));
    border-color: #cbd5e1;
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(148, 163, 184, 0.05);
  }
`;

const ExtractInfo = styled.div`
  flex: 1;
  min-width: 0;

  h3 {
    margin: 0 0 0.375rem 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: #1e293b;
  }

  p {
    margin: 0;
    font-size: 0.875rem;
    color: #64748b;
  }
`;

const BackButton = styled(Button)`
  background: white !important;
  color: #64748b !important;
  border: 1px solid #e2e8f0 !important;
  padding: 0.625rem 1rem !important;
  border-radius: 12px !important;
  font-size: 0.875rem !important;
  font-weight: 500 !important;
  display: flex !important;
  align-items: center !important;
  gap: 0.5rem !important;
  transition: all 0.2s ease !important;

  &:hover {
    background: #f8fafc !important;
    color: #4a90e2 !important;
    border-color: #4a90e2 !important;
    transform: translateX(-2px);
  }

  i.icon {
    margin: 0 !important;
    font-size: 1rem !important;
    transition: transform 0.2s ease !important;
  }

  &:hover i.icon {
    transform: translateX(-2px);
  }
`;

const AnimatedWrapper = styled.div`
  &.exit {
    animation: slideOut 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes slideOut {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(8px);
    }
  }
`;

const DocumentKnowledgeBase: React.FC<DocumentKnowledgeBaseProps> = ({
  documentId,
  corpusId,
  initialAnnotationIds,
  onClose,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const { setProgress, zoomLevel, setShiftDown, setZoomLevel } = useUISettings({
    width,
  });

  // Chat panel width management
  const {
    mode,
    customWidth,
    autoMinimize,
    setMode,
    setCustomWidth,
    toggleAutoMinimize,
    minimize,
    restore,
  } = useChatPanelWidth();

  // Calculate actual panel width based on mode
  const getPanelWidthPercentage = (): number => {
    switch (mode) {
      case "quarter":
        return 25;
      case "half":
        return 50;
      case "full":
        return 90;
      case "custom":
        return customWidth || 50;
      default:
        return 50;
    }
  };

  // Resize handle state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartWidth, setDragStartWidth] = useState(0);
  const [isMinimized, setIsMinimized] = useState(false);
  const documentAreaRef = useRef<HTMLDivElement>(null);
  const [showWidthMenu, setShowWidthMenu] = useState(false);

  const [showGraph, setShowGraph] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("");
  const [showAnalyzerModal, setShowAnalyzerModal] = useState(false);

  // This layer state still determines whether to show the knowledge base layout vs document layout
  const [activeLayer, setActiveLayer] = useState<"knowledge" | "document">(
    "document"
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
  const { searchText, setSearchText } = useSearchText();
  const { setPermissions } = useDocumentPermissions();
  const { setTextSearchState } = useTextSearchState();
  const { activeSpanLabel, setActiveSpanLabel } = useAnnotationControls();
  const { setChatSourceState } = useChatSourceState();
  const { setPdfDoc } = usePdfDoc();

  // Call the hook ONCE here
  const createAnnotationHandler = useCreateAnnotation();

  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [markdownError, setMarkdownError] = useState<boolean>(false);

  const { selectedAnalysis, selectedExtract } = useAnalysisSelection();
  const { selectedAnnotations, setSelectedAnnotations } =
    useAnnotationSelection();

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
   * If analysis or annotation is selected, switch to document view.
   */
  useEffect(() => {
    if (selectedAnalysis || (selectedAnnotations?.length ?? 0) > 0) {
      setActiveLayer("document");
    }
  }, [selectedAnalysis, selectedAnnotations]);

  /**
   * processAnnotationsData
   *
   * Processes annotation data for the current document, updating state atoms
   * and corpus label sets. Accepts GetDocumentKnowledgeAndAnnotationsOutput,
   * which is what's returned from
   * the GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS query.
   *
   * @param data - The query result containing document + corpus info
   */
  const processAnnotationsData = (
    data: GetDocumentKnowledgeAndAnnotationsOutput
  ) => {
    console.log("[processAnnotationsData] Received data:", data); // Log received data
    console.log(
      "[processAnnotationsData] Received data.corpus:",
      JSON.stringify(data?.corpus, null, 2)
    ); // Log corpus part specifically
    console.log(
      "[processAnnotationsData] Received data.corpus.myPermissions:",
      data?.corpus?.myPermissions
    ); // Log corpus part specifically
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

      // Prepare the update payload for the corpus state atom
      let corpusUpdatePayload: Partial<CorpusState> = {}; // Initialize as Partial<CorpusState>

      // Process corpus permissions if available
      if (data.corpus?.myPermissions) {
        corpusUpdatePayload.myPermissions = getPermissions(
          data.corpus.myPermissions
        );
      }

      // Process labels if labelSet is available
      if (data.corpus?.labelSet) {
        console.log("[processAnnotationsData] Processing labelSet...");
        const allLabels = data.corpus.labelSet.allAnnotationLabels ?? [];
        // Filter labels by type
        corpusUpdatePayload.spanLabels = allLabels.filter(
          (label) => label.labelType === LabelType.SpanLabel
        );
        corpusUpdatePayload.humanSpanLabels = corpusUpdatePayload.spanLabels; // Assuming they are the same initially
        corpusUpdatePayload.relationLabels = allLabels.filter(
          (label) => label.labelType === LabelType.RelationshipLabel
        );
        corpusUpdatePayload.docTypeLabels = allLabels.filter(
          (label) => label.labelType === LabelType.DocTypeLabel
        );
        corpusUpdatePayload.humanTokenLabels = allLabels.filter(
          (label) => label.labelType === LabelType.TokenLabel
        );
      }

      // *** ADD THE ACTUAL CORPUS OBJECT TO THE PAYLOAD ***
      if (data.corpus) {
        // Transform RawCorpusType to CorpusType before assigning
        const transformedCorpus: CorpusType = {
          ...data.corpus,
          myPermissions: getPermissions(data.corpus.myPermissions || []),
        } as any;
        corpusUpdatePayload.selectedCorpus = transformedCorpus; // Assign the transformed object
      }

      // Update corpus state using the constructed payload
      if (Object.keys(corpusUpdatePayload).length > 0) {
        console.log(
          "[processAnnotationsData] Corpus update payload:",
          JSON.stringify(corpusUpdatePayload, null, 2) // Log the final payload
        );
        console.log("[processAnnotationsData] Calling setCorpus...");
        setCorpus(corpusUpdatePayload); // Pass the complete payload
        console.log("[processAnnotationsData] setCorpus called.");
      }

      // Keep global navigation vars in sync so router & other components know
      openedDocument(data.document as any);
      if (data.corpus) {
        const transformedCorpus: CorpusType = {
          ...data.corpus,
          myPermissions: getPermissions(data.corpus.myPermissions || []),
        } as any;
        openedCorpus(transformedCorpus);
      }
      setPermissions(data.document.myPermissions ?? []);
    }
  };

  // We'll store the measured containerWidth here
  const [containerWidth, setContainerWidth] = useState<number | null>(null);

  /**
   * 1. store container width (existing behaviour)
   * 2. publish the same element to scrollContainerRefAtom
   */
  const { setScrollContainerRef } = useScrollContainerRef();
  const pdfContainerRef = useRef<HTMLDivElement | null>(null);

  const containerRefCallback = useCallback(
    (node: HTMLDivElement | null) => {
      pdfContainerRef.current = node;

      if (node) {
        // ① width for initial zoom calc
        setContainerWidth(node.getBoundingClientRect().width);
        // ② virtual-window needs this ref
        setScrollContainerRef(pdfContainerRef);
      } else {
        setScrollContainerRef(null);
      }
    },
    [setContainerWidth, setScrollContainerRef]
  );

  /* clear on unmount so stale refs are never used */
  useEffect(() => () => setScrollContainerRef(null), [setScrollContainerRef]);

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
  const authReady = useAuthReady();
  const {
    data: combinedData,
    loading,
    error: queryError,
    refetch,
  } = useQuery<
    GetDocumentKnowledgeAndAnnotationsOutput,
    GetDocumentKnowledgeAndAnnotationsInput
  >(GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS, {
    skip: !authReady || !documentId || !corpusId,
    variables: {
      documentId,
      corpusId,
      analysisId: undefined,
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
      processAnnotationsData(data);

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
      // If the backend hasn\'t yet indexed/authorised this doc the first
      // request may come back with "Document matching query does not exist.".
      // We silently ignore this **once** and keep the loader visible; a
      // follow-up refetch (triggered when Apollo receives the updated auth
      // headers) will succeed and onCompleted will take over.
      const benign404 =
        error?.graphQLErrors?.length === 1 &&
        error.graphQLErrors[0].message.includes(
          "Document matching query does not exist"
        );

      if (benign404) {
        console.warn("Initial 404 for document – will retry automatically");
        return; // keep LOADING state
      }

      // Otherwise treat as real error
      console.error("GraphQL Query Error fetching document data:", error);
      toast.error(`Failed to load document details: ${error.message}`);
      setViewState(ViewState.ERROR);
    },
    fetchPolicy: "network-only",
    nextFetchPolicy: "no-cache",
  });

  useEffect(() => {
    if (!loading) {
      refetch({
        documentId,
        corpusId,
        analysisId: selectedAnalysis?.id,
      });
    }
  }, [selectedAnalysis, corpusId, refetch, loading, documentId]);

  useEffect(() => {
    if (!loading) {
      refetch({
        documentId,
        corpusId,
        analysisId: selectedExtract?.id,
      });
    }
  }, [selectedExtract, corpusId, refetch, loading, documentId]);

  const metadata = combinedData?.document ?? {
    title: "Loading...",
    fileType: "",
    creator: { email: "" },
    created: new Date().toISOString(),
  };

  const notes = combinedData?.document?.allNotes ?? [];
  const docRelationships = combinedData?.document?.allDocRelationships ?? [];

  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartWidth(getPanelWidthPercentage());
    e.preventDefault();
  };

  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = dragStartX - e.clientX;
      const windowWidth = window.innerWidth;
      const deltaPercentage = (deltaX / windowWidth) * 100;
      const newWidth = Math.max(
        15,
        Math.min(95, dragStartWidth + deltaPercentage)
      );

      // Snap to preset widths if close
      const snapThreshold = 3;
      if (Math.abs(newWidth - 25) < snapThreshold) {
        setMode("quarter");
      } else if (Math.abs(newWidth - 50) < snapThreshold) {
        setMode("half");
      } else if (Math.abs(newWidth - 90) < snapThreshold) {
        setMode("full");
      } else {
        setCustomWidth(newWidth);
      }
    },
    [isDragging, dragStartX, dragStartWidth, setMode, setCustomWidth]
  );

  const handleResizeEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Add resize event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleResizeMove);
      document.addEventListener("mouseup", handleResizeEnd);
      return () => {
        document.removeEventListener("mousemove", handleResizeMove);
        document.removeEventListener("mouseup", handleResizeEnd);
      };
    }
  }, [isDragging, handleResizeMove, handleResizeEnd]);

  // Auto-minimize logic
  const handleDocumentMouseEnter = useCallback(() => {
    if (
      autoMinimize &&
      showRightPanel &&
      activeTab === "chat" &&
      !isDragging &&
      !isMinimized
    ) {
      minimize();
      setIsMinimized(true);
    }
  }, [
    autoMinimize,
    showRightPanel,
    activeTab,
    isDragging,
    isMinimized,
    minimize,
  ]);

  const handlePanelMouseEnter = useCallback(() => {
    if (isMinimized) {
      restore();
      setIsMinimized(false);
    }
  }, [isMinimized, restore]);

  // Reset minimized state when tab changes or panel closes
  useEffect(() => {
    if (!showRightPanel || activeTab !== "chat") {
      setIsMinimized(false);
    }
  }, [showRightPanel, activeTab]);

  // Close width menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showWidthMenu && !target.closest("[data-width-menu]")) {
        setShowWidthMenu(false);
      }
    };

    if (showWidthMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showWidthMenu]);

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
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);

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
      label: "Summary View",
      icon: <BookOpen size={18} />,
      layer: "knowledge",
    },
    {
      key: "chat",
      label: "Chat",
      icon: <MessageSquare size={18} />,
      layer: "both",
    },
    {
      key: "notes",
      label: "Notes",
      icon: <Notebook size={18} />,
      layer: "both",
    },
    {
      key: "relationships",
      label: "Doc Links",
      icon: <ChartNetwork size={18} />,
      layer: "both",
    },
    {
      key: "annotations",
      label: "Annotations",
      icon: <FileText size={18} />,
      layer: "document",
    },
    {
      key: "relations",
      label: "Ann. Links",
      icon: <ChartNetwork size={18} />,
      layer: "document",
    },
    {
      key: "search",
      label: "Search",
      icon: <Search size={18} />,
      layer: "document",
    },
    {
      key: "analyses",
      label: "Analyses",
      icon: <BarChart3 size={18} />,
      layer: "document",
    },
    {
      key: "extracts",
      label: "Extracts",
      icon: <Database size={18} />,
      layer: "document",
    },
  ];

  // We no longer base tabs on the layer. Instead, we always show allTabs.
  const visibleTabs = allTabs;

  // Decide if we show the right panel based on whether or not a tab is selected
  useEffect(() => {
    if (!activeTab) {
      // If no tab is selected, always hide the panel
      setShowRightPanel(false);
    } else if (activeTab === "summary") {
      // Don't show right panel for summary tab
      setShowRightPanel(false);
    } else {
      // Show the right panel for all other tabs
      setShowRightPanel(true);
    }
  }, [activeTab]);

  // Add new state for showing load menu
  const [showLoad, setShowLoad] = useState(false);

  /* State for showing the new SelectDocumentFieldsetModal */
  const [showFieldsetModal, setShowFieldsetModal] = useState(false);

  const [isExiting, setIsExiting] = useState(false);

  // Add state for selected summary version content
  const [selectedSummaryContent, setSelectedSummaryContent] = useState<
    string | null
  >(null);
  const [selectedSummaryVersion, setSelectedSummaryVersion] = useState<
    number | null
  >(null);
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [editedSummaryContent, setEditedSummaryContent] = useState<string>("");

  // Get summary versions data
  const {
    versions: summaryVersions,
    currentVersion: currentSummaryVersion,
    currentContent: currentSummaryContentFromHook,
    loading: summaryLoading,
    updateSummary,
    refetch: refetchSummary,
  } = useSummaryVersions(documentId, corpusId);

  // Unified feed state
  const [sidebarViewMode, setSidebarViewMode] =
    useState<SidebarViewMode["mode"]>("chat");
  const [feedFilters, setFeedFilters] = useState<ContentFilters>({
    contentTypes: new Set(["note", "annotation", "relationship", "search"]),
    annotationFilters: {
      showStructural: false,
    },
    relationshipFilters: {
      showStructural: false,
    },
  });
  const [feedSortBy, setFeedSortBy] = useState<SortOption>("page");

  // Define UnifiedKnowledgeLayer component inside DocumentKnowledgeBase to access state
  const UnifiedKnowledgeLayer: React.FC = () => {
    const [versionSidebarCollapsed, setVersionSidebarCollapsed] =
      useState(false);
    const [savingContent, setSavingContent] = useState(false);

    const displayContent =
      selectedSummaryContent ??
      currentSummaryContentFromHook ??
      (summaryVersions && summaryVersions.length > 0
        ? summaryVersions[0].snapshot
        : undefined) ??
      markdownContent ??
      "";

    const combinedLoading = loading || summaryLoading;
    const isViewingCurrent =
      !selectedSummaryVersion ||
      selectedSummaryVersion === currentSummaryVersion;

    const handleEdit = () => {
      setIsEditingSummary(true);
      setEditedSummaryContent(displayContent);
    };

    const handleCancelEdit = () => {
      setIsEditingSummary(false);
      setEditedSummaryContent("");
    };

    const handleSaveEdit = async () => {
      if (!editedSummaryContent.trim()) {
        toast.error("Summary content cannot be empty");
        return;
      }

      setSavingContent(true);
      try {
        await updateSummary(editedSummaryContent);
        setIsEditingSummary(false);
        setEditedSummaryContent("");
        toast.success("Summary saved successfully!");
        // Reset to show the new current version
        setSelectedSummaryVersion(null);
        setSelectedSummaryContent(null);
        await refetchSummary();
      } catch (error) {
        toast.error("Failed to save summary");
      } finally {
        setSavingContent(false);
      }
    };

    const sortedVersions = summaryVersions
      ? [...summaryVersions].sort((a, b) => b.version - a.version)
      : [];

    return (
      <KnowledgeLayerContainer>
        <VersionHistorySidebar collapsed={versionSidebarCollapsed}>
          <CollapseSidebarButton
            onClick={() => setVersionSidebarCollapsed(!versionSidebarCollapsed)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            {versionSidebarCollapsed ? <ChevronRight /> : <ChevronLeft />}
          </CollapseSidebarButton>

          {!versionSidebarCollapsed && (
            <>
              <VersionHistoryHeader>
                <h3>
                  <GitBranch size={18} />
                  Version History
                </h3>
                <div className="version-count">
                  {sortedVersions.length} version
                  {sortedVersions.length !== 1 ? "s" : ""} total
                </div>
              </VersionHistoryHeader>

              <VersionList>
                {sortedVersions.map((version) => {
                  const isCurrent = version.version === currentSummaryVersion;
                  const isActive = selectedSummaryVersion === version.version;

                  return (
                    <VersionItem
                      key={version.id}
                      $isActive={isActive}
                      $isCurrent={isCurrent}
                      onClick={() => {
                        setSelectedSummaryVersion(version.version);
                        setSelectedSummaryContent(version.snapshot || "");
                      }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="version-header">
                        <div className="version-number">
                          Version {version.version}
                        </div>
                        {isCurrent && (
                          <span className="version-badge">Current</span>
                        )}
                      </div>
                      <div className="version-meta">
                        <div className="meta-row">
                          <UserIcon />
                          {version.author?.email || "Unknown"}
                        </div>
                        <div className="meta-row">
                          <Clock />
                          {format(
                            new Date(version.created),
                            "MMM d, yyyy 'at' h:mm a"
                          )}
                        </div>
                      </div>
                    </VersionItem>
                  );
                })}
              </VersionList>
            </>
          )}
        </VersionHistorySidebar>

        <KnowledgeContent>
          <KnowledgeHeader>
            <div className="header-content">
              <h2>
                <BookOpen />
                {metadata.title || "Untitled Document"} - Summary
              </h2>
              <div className="header-actions">
                {!isEditingSummary && isViewingCurrent && (
                  <Button primary onClick={handleEdit}>
                    <Icon name="edit" />
                    Edit Summary
                  </Button>
                )}
                {isEditingSummary && (
                  <>
                    <Button
                      positive
                      onClick={handleSaveEdit}
                      loading={savingContent}
                      disabled={savingContent}
                    >
                      <Icon name="save" />
                      Save as New Version
                    </Button>
                    <Button onClick={handleCancelEdit}>
                      <Icon name="cancel" />
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="version-info">
              <div className="info-item">
                <GitBranch />
                Viewing: Version{" "}
                {selectedSummaryVersion || currentSummaryVersion || 1}
              </div>
              {!isViewingCurrent && (
                <div className="info-item" style={{ color: "#d97706" }}>
                  <AlertCircle />
                  Viewing historical version - changes will create a new version
                </div>
              )}
            </div>
          </KnowledgeHeader>

          <KnowledgeBody $isEditing={isEditingSummary}>
            {isEditingSummary && (
              <EditModeToolbar
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
              >
                <div className="toolbar-left">
                  <div className="edit-indicator">
                    <EditIcon />
                    Editing Mode
                  </div>
                </div>
                <div className="toolbar-actions">
                  <span style={{ fontSize: "0.875rem", color: "#64748b" }}>
                    {editedSummaryContent.length} characters
                  </span>
                </div>
              </EditModeToolbar>
            )}

            {combinedLoading ? (
              <LoadingPlaceholders type="summary" />
            ) : isEditingSummary ? (
              <MarkdownEditor
                value={editedSummaryContent}
                onChange={(e) => setEditedSummaryContent(e.target.value)}
                placeholder="Enter your summary content in Markdown format..."
                autoFocus
              />
            ) : displayContent ? (
              <div className="prose max-w-none">
                <SafeMarkdown>{displayContent}</SafeMarkdown>
              </div>
            ) : (
              <EmptyState
                icon={<FileText size={40} />}
                title="No summary available"
                description="This document doesn't have a summary yet"
              />
            )}
          </KnowledgeBody>
        </KnowledgeContent>
      </KnowledgeLayerContainer>
    );
  };

  const handleBack = () => {
    setIsExiting(true);
    setTimeout(() => {
      onSelectExtract(null);
      setIsExiting(false);
    }, 200); // Match the slideOut animation duration
  };

  const rightPanelContent = (() => {
    // First, add the control bar for switching between chat and feed modes
    const controlBar = (
      <SidebarControlBar
        viewMode={sidebarViewMode}
        onViewModeChange={setSidebarViewMode}
        filters={feedFilters}
        onFiltersChange={setFeedFilters}
        sortBy={feedSortBy}
        onSortChange={setFeedSortBy}
        hasActiveSearch={!!searchText}
      />
    );

    // Handle unified feed mode
    if (sidebarViewMode === "feed") {
      return (
        <div
          style={{ display: "flex", flexDirection: "column", height: "100%" }}
        >
          {controlBar}
          <UnifiedContentFeed
            notes={notes}
            filters={feedFilters}
            sortBy={feedSortBy}
            isLoading={loading}
            onItemSelect={(item) => {
              // Handle item selection based on type
              if (item.type === "annotation" || item.type === "relationship") {
                setActiveLayer("document");
              }
              // For annotations and relationships, selection is handled within the component
              // For notes, we could open the note modal
              if (item.type === "note" && "creator" in item.data) {
                setSelectedNote(item.data as (typeof notes)[0]);
              }
            }}
          />
        </div>
      );
    }

    // Handle chat mode (default behavior)
    if (activeTab === "chat") {
      return (
        <div
          style={{ display: "flex", flexDirection: "column", height: "100%" }}
        >
          {controlBar}
          <ChatTray
            setShowLoad={setShowLoad}
            showLoad={showLoad}
            documentId={documentId}
            onMessageSelect={() => {
              setActiveLayer("document");
            }}
            corpusId={corpusId}
          />
        </div>
      );
    }

    // Legacy tab-based content (will be removed in next phase)
    switch (activeTab) {
      case "notes":
        return (
          <div
            className="flex-1 overflow-auto"
            style={{ position: "relative" }}
          >
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
                    onDoubleClick={() => setEditingNoteId(note.id)}
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
                    title="Double-click to edit"
                  >
                    <div className="edit-indicator">
                      <Edit3 size={14} />
                    </div>
                    {note.title && <div className="title">{note.title}</div>}
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
            <NewChatFloatingButton
              onClick={() => setShowNewNoteModal(true)}
              style={{
                position: "absolute",
                bottom: "20px",
                right: "20px",
                background: "#4a90e2",
              }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
            >
              <i className="plus icon" />
            </NewChatFloatingButton>
          </div>
        );
      case "search":
        return (
          <div
            className="p-4 flex-1 flex flex-col"
            style={{ overflow: "hidden" }}
          >
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
          <>
            <div style={{ padding: "1rem", overflow: "hidden" }}>
              <AnalysisTraySelector read_only={false} analyses={analyses} />
            </div>
            <NewChatFloatingButton onClick={() => setShowAnalyzerModal(true)}>
              <i className="plus icon" />
            </NewChatFloatingButton>
            <SelectDocumentAnalyzerModal
              documentId={documentId}
              corpusId={corpusId}
              open={showAnalyzerModal}
              onClose={() => setShowAnalyzerModal(false)}
            />
          </>
        );
      case "extracts":
        return (
          <div style={{ padding: "1rem", overflow: "hidden" }}>
            <AnimatePresence exitBeforeEnter>
              {selectedExtract ? (
                <motion.div
                  key="selected-extract"
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <AnimatedWrapper className={isExiting ? "exit" : ""}>
                    <SelectedExtractHeader>
                      <ExtractInfo>
                        <h3>{selectedExtract.name}</h3>
                        <p>
                          {selectedExtract.fieldset?.description ||
                            "No description available"}
                        </p>
                      </ExtractInfo>
                      <BackButton onClick={handleBack}>
                        <Icon name="arrow left" />
                        Back to Extracts
                      </BackButton>
                    </SelectedExtractHeader>
                  </AnimatedWrapper>
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

                  {/* Floating button to open our new fieldset picker */}
                  <NewChatFloatingButton
                    onClick={() => setShowFieldsetModal(true)}
                    style={{ bottom: "80px" }}
                  >
                    <i className="plus icon" />
                  </NewChatFloatingButton>

                  <SelectDocumentFieldsetModal
                    documentId={documentId}
                    corpusId={corpusId}
                    open={showFieldsetModal}
                    onClose={() => setShowFieldsetModal(false)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
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
      <UnifiedKnowledgeLayer />
    ) : (
      <div
        id="document-layer"
        ref={documentAreaRef}
        onMouseEnter={handleDocumentMouseEnter}
        style={{
          flex: 1,
          position: "relative",
          marginRight:
            !isMobile && showRightPanel
              ? `${getPanelWidthPercentage()}%`
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

    // Special handling for summary tab - don't show right panel
    if (tabKey === "summary") {
      setActiveTab(tabKey);
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
  };

  // Set initial state
  useEffect(() => {
    setActiveTab("");
    setShowRightPanel(false);
    setActiveLayer("document");
  }, []);

  /* ------------------------------------------------------------------ */
  /* Seed selection atom once if the caller provided initial ids         */
  useEffect(() => {
    if (initialAnnotationIds && initialAnnotationIds.length > 0) {
      setSelectedAnnotations(initialAnnotationIds);
    }
  }, [initialAnnotationIds, setSelectedAnnotations]);

  // keep URL ↔ selection in sync
  useUrlAnnotationSync();

  /* ------------------------------------------------------ */
  /*  Cleanup on unmount – clear document + annotation sel  */
  /* ------------------------------------------------------ */
  useEffect(() => {
    return () => {
      openedDocument(null); // leave corpus intact
      setSelectedAnnotations([]);
      selectedAnnotationIds([]);
    };
  }, [setSelectedAnnotations]);

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
              $tabKey={t.key}
              $active={activeTab === t.key}
              onClick={() => handleTabClick(t.key)}
              $collapsed={sidebarCollapsed}
            >
              {t.icon}
              <span>{t.label}</span>
            </TabButton>
          ))}
        </TabsColumn>

        <MainContentArea id="main-content-area">
          {mainLayerContent}
          <UnifiedLabelSelector
            sidebarWidth="0px"
            activeSpanLabel={activeSpanLabel ?? null}
            setActiveLabel={setActiveSpanLabel}
          />

          {/* Floating Summary Preview - always visible, acts as picture-in-picture for knowledge layer */}
          <FloatingSummaryPreview
            documentId={documentId}
            corpusId={corpusId}
            documentTitle={metadata.title || "Untitled Document"}
            isVisible={true}
            isInKnowledgeLayer={activeLayer === "knowledge"}
            onSwitchToKnowledge={(content?: string) => {
              setActiveLayer("knowledge");
              setActiveTab("summary");
              setShowRightPanel(false);
              if (content) {
                setSelectedSummaryContent(content);
              } else {
                setSelectedSummaryContent(null);
              }
              setChatSourceState((prev) => ({
                ...prev,
                selectedMessageId: null,
                selectedSourceIndex: null,
              }));
            }}
            onBackToDocument={() => {
              setActiveLayer("document");
              setSelectedSummaryContent(null);
              if (
                ![
                  "chat",
                  "notes",
                  "relationships",
                  "annotations",
                  "relations",
                  "search",
                  "analyses",
                  "extracts",
                ].includes(activeTab)
              ) {
                setActiveTab("chat");
                setShowRightPanel(true);
              }
            }}
          />

          {/* Zoom Controls - only in document layer */}
          {activeLayer === "document" && (
            <ZoomControls
              zoomLevel={zoomLevel}
              onZoomIn={() => setZoomLevel(Math.min(zoomLevel + 0.1, 4))}
              onZoomOut={() => setZoomLevel(Math.max(zoomLevel - 0.1, 0.5))}
            />
          )}

          {/* Unified Search/Chat Input - only in document layer */}
          <FloatingDocumentInput
            visible={activeLayer === "document"}
            onChatSubmit={(message) => {
              // Switch to chat mode and submit message
              setActiveTab("chat");
              setSidebarViewMode("chat");
              setShowRightPanel(true);
              // TODO: Pass message to ChatTray to start new chat
            }}
            onToggleChat={() => {
              setActiveTab("chat");
              setSidebarViewMode("chat");
              setShowRightPanel(true);
            }}
          />

          {/* Floating Document Controls - only in document layer */}
          <FloatingDocumentControls visible={activeLayer === "document"} />

          {/* Right Panel, if needed */}
          <AnimatePresence>
            {showRightPanel && activeTab && (
              <SlidingPanel
                id="sliding-panel"
                panelWidth={getPanelWidthPercentage()}
                onMouseEnter={handlePanelMouseEnter}
                initial={{ x: "100%", opacity: 0 }}
                animate={{ x: "0%", opacity: 1 }}
                exit={{ x: "100%", opacity: 0 }}
                transition={{
                  x: { type: "spring", damping: 30, stiffness: 300 },
                  opacity: { duration: 0.2, ease: "easeOut" },
                }}
              >
                <ResizeHandle
                  id="resize-handle"
                  onMouseDown={handleResizeStart}
                  $isDragging={isDragging}
                  whileHover={{ scale: 1.1 }}
                />
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
                {activeTab === "chat" && (
                  <>
                    <WidthControlToggle
                      onClick={() => setShowWidthMenu(!showWidthMenu)}
                      whileTap={{ scale: 0.9 }}
                      data-width-menu
                    >
                      <Settings />
                    </WidthControlToggle>
                    <AnimatePresence>
                      {showWidthMenu && (
                        <WidthControlMenu
                          initial={{ opacity: 0, scale: 0.95, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -10 }}
                          transition={{ duration: 0.15 }}
                          data-width-menu
                        >
                          <WidthMenuItem
                            id="compact-width-menu-item"
                            $isActive={mode === "quarter"}
                            onClick={() => {
                              setMode("quarter");
                              setShowWidthMenu(false);
                            }}
                            whileTap={{ scale: 0.98 }}
                          >
                            Compact
                            <span className="percentage">25%</span>
                          </WidthMenuItem>
                          <WidthMenuItem
                            $isActive={mode === "half"}
                            onClick={() => {
                              setMode("half");
                              setShowWidthMenu(false);
                            }}
                            whileTap={{ scale: 0.98 }}
                          >
                            Standard
                            <span className="percentage">50%</span>
                          </WidthMenuItem>
                          <WidthMenuItem
                            id="wide-width-menu-item"
                            $isActive={mode === "full"}
                            onClick={() => {
                              setMode("full");
                              setShowWidthMenu(false);
                            }}
                            whileTap={{ scale: 0.98 }}
                          >
                            Wide
                            <span className="percentage">90%</span>
                          </WidthMenuItem>
                          <MenuDivider />
                          <WidthMenuItem
                            $isActive={autoMinimize}
                            onClick={() => {
                              toggleAutoMinimize();
                              setShowWidthMenu(false);
                            }}
                            whileTap={{ scale: 0.98 }}
                          >
                            Auto-minimize
                            {autoMinimize ? (
                              <Eye size={16} />
                            ) : (
                              <EyeOff size={16} />
                            )}
                          </WidthMenuItem>
                        </WidthControlMenu>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </SlidingPanel>
            )}
          </AnimatePresence>

          {/* Chat indicator when panel is closed */}
          <AnimatePresence>
            {!showRightPanel && !isMobile && (
              <ChatIndicator
                onClick={() => {
                  setActiveTab("chat");
                  setShowRightPanel(true);
                }}
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 100, opacity: 0 }}
                transition={{ type: "spring", damping: 20, stiffness: 300 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <MessageSquare />
              </ChatIndicator>
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
            <Modal.Header>{selectedNote.title || "Untitled Note"}</Modal.Header>
            <Modal.Content>
              <SafeMarkdown>{selectedNote.content}</SafeMarkdown>
            </Modal.Content>
            <Modal.Actions>
              <Button
                primary
                onClick={() => {
                  setEditingNoteId(selectedNote.id);
                  setSelectedNote(null);
                }}
              >
                <Icon name="edit" />
                Edit Note
              </Button>
              <Button onClick={() => setSelectedNote(null)}>Close</Button>
            </Modal.Actions>
            <div className="meta">
              Added by {selectedNote.creator.email} on{" "}
              {new Date(selectedNote.created).toLocaleString()}
            </div>
          </>
        )}
      </NoteModal>

      {editingNoteId && (
        <NoteEditor
          noteId={editingNoteId}
          isOpen={true}
          onClose={() => setEditingNoteId(null)}
          onUpdate={() => {
            // Refetch the document data to get updated notes
            refetch();
          }}
        />
      )}

      <NewNoteModal
        isOpen={showNewNoteModal}
        onClose={() => setShowNewNoteModal(false)}
        documentId={documentId}
        corpusId={corpusId}
        onCreated={() => {
          // Refetch the document data to get the new note
          refetch();
        }}
      />
    </FullScreenModal>
  );
};

export default DocumentKnowledgeBase;
