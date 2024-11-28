import { useCallback, useEffect, useRef, useState } from "react";
import { DocumentViewer } from "../viewer";
import {
  AnalysisType,
  ExtractType,
  LabelDisplayBehavior,
  ColumnType,
  DatacellType,
} from "../../../../types/graphql-api";
import { ViewState, TokenId } from "../../../types";
import _ from "lodash";
import { getPermissions } from "../../../../utils/transform";
import {
  useSpanLabels,
  useHumanSpanLabels,
  useRelationLabels,
  useDocTypeLabels,
} from "../../context/CorpusAtom";
import { useZoomLevel } from "../../context/UISettingsAtom";
import {
  usePdfDoc,
  useSelectedDocument,
  useSelectedCorpus,
  useDocText,
  usePages,
  usePageTextMaps,
} from "../../context/DocumentAtom";
import {
  useCreateAnnotation,
  useDeleteAnnotation,
  useUpdateAnnotation,
  useApproveAnnotation,
  useRejectAnnotation,
  useCreateRelationship,
  usePdfAnnotations,
} from "../../hooks/AnnotationHooks";
import {
  ServerSpanAnnotation,
  ServerTokenAnnotation,
} from "../../types/annotations";

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

interface AnnotatorRendererProps {
  open: boolean;
  data_loading?: boolean;
  loading_message?: string;
  view_document_only: boolean; // If true, won't show topbar or any of the label selectors.
  analyses?: AnalysisType[];
  extracts?: ExtractType[];
  selected_analysis?: AnalysisType | null;
  selected_extract?: ExtractType | null;
  onSelectAnalysis?: (analysis: AnalysisType | null) => undefined | null | void;
  onSelectExtract?: (extract: ExtractType | null) => undefined | null | void;
  read_only: boolean;
  load_progress: number;
  scrollToAnnotation?: ServerTokenAnnotation | ServerSpanAnnotation;
  show_structural_annotations: boolean;
  show_annotation_labels: LabelDisplayBehavior;
  data_cells?: DatacellType[];
  columns?: ColumnType[];
  structural_annotations?: ServerTokenAnnotation[];
  editMode: "ANNOTATE" | "ANALYZE";
  allowInput: boolean;
  setEditMode: (m: "ANNOTATE" | "ANALYZE") => void | undefined | null;
  setAllowInput: (v: boolean) => void | undefined | null;
  setIsHumanAnnotationMode?: (val: boolean) => undefined | void | null;
  setIsEditingEnabled?: (val: boolean) => undefined | void | null;
  onError: (state: ViewState) => void | any;
}

export const AnnotatorRenderer = ({
  data_loading,
  loading_message,
  analyses,
  extracts,
  data_cells,
  columns,
  selected_analysis,
  selected_extract,
  editMode,
  allowInput,
  view_document_only,
  setAllowInput,
  setEditMode,
  onSelectAnalysis,
  onSelectExtract,
  read_only,
  scrollToAnnotation,
  show_structural_annotations,
  show_annotation_labels,
  onError,
}: AnnotatorRendererProps) => {
  // Import state from DocumentAtom
  const { selectedDocument } = useSelectedDocument();
  const { selectedCorpus } = useSelectedCorpus();
  const { docText } = useDocText();
  const { pages } = usePages();
  const { pageTextMaps } = usePageTextMaps();
  const { pdfDoc } = usePdfDoc();

  // Use permissions from DocumentAtom
  const raw_permissions = selectedDocument?.myPermissions ?? [];
  const doc_permissions = getPermissions(raw_permissions);

  const corpus_raw_permissions = selectedCorpus
    ? selectedCorpus.myPermissions ?? []
    : ["READ"];
  const corpus_permissions = getPermissions(corpus_raw_permissions);

  const { zoomLevel: zoom_level, setZoomLevel } = useZoomLevel();

  const { spanLabels: span_label_lookup } = useSpanLabels();
  const { humanSpanLabels: human_span_label_lookup } = useHumanSpanLabels();
  const { relationLabels: relationship_label_lookup } = useRelationLabels();
  const { docTypeLabels: document_label_lookup } = useDocTypeLabels();

  const { pdfAnnotations } = usePdfAnnotations();

  const handleCreateAnnotation = useCreateAnnotation();
  const handleDeleteAnnotation = useDeleteAnnotation();
  const handleUpdateAnnotation = useUpdateAnnotation();
  const handleApproveAnnotation = useApproveAnnotation();
  const handleRejectAnnotation = useRejectAnnotation();
  const handleCreateRelationship = useCreateRelationship();

  const [hasScrolledToAnnotation, setHasScrolledToAnnotation] = useState<
    string | null
  >(null);

  const [shiftDown, setShiftDown] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Refs for canvas containers
  const containerRefCallback = useCallback((node: HTMLDivElement | null) => {
    console.log("Started Annotation Renderer");
    if (node !== null) {
      containerRef.current = node;
    }
  }, []);

  // Refs for annotations
  const annotationElementRefs = useRef<Record<string, HTMLElement | null>>({});

  const handleKeyUpPress = useCallback((event: { keyCode: any }) => {
    const { keyCode } = event;
    if (keyCode === 16) {
      //console.log("Shift released");
      setShiftDown(false);
    }
  }, []);

  const handleKeyDownPress = useCallback((event: { keyCode: any }) => {
    const { keyCode } = event;
    if (keyCode === 16) {
      //console.log("Shift depressed")
      setShiftDown(true);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keyup", handleKeyUpPress);
    window.addEventListener("keydown", handleKeyDownPress);
    return () => {
      window.removeEventListener("keyup", handleKeyUpPress);
      window.removeEventListener("keydown", handleKeyDownPress);
    };
  }, [handleKeyUpPress, handleKeyDownPress]);

  // Handle scrolling to annotation
  useEffect(() => {
    if (
      scrollToAnnotation &&
      !hasScrolledToAnnotation &&
      annotationElementRefs.current[scrollToAnnotation.id]
    ) {
      annotationElementRefs?.current[scrollToAnnotation.id]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      setHasScrolledToAnnotation(scrollToAnnotation.id);
    }
  }, [
    scrollToAnnotation,
    hasScrolledToAnnotation,
    annotationElementRefs.current,
  ]);

  // Reset scroll state when scrollToAnnotation changes
  useEffect(() => {
    setHasScrolledToAnnotation(null);
  }, [scrollToAnnotation]);

  console.log("AnnotatorRenderer...");
  return (
    <DocumentViewer
      zoom_level={zoom_level}
      setZoomLevel={setZoomLevel}
      view_document_only={view_document_only}
      doc_permissions={doc_permissions}
      corpus_permissions={corpus_permissions}
      read_only={read_only}
      data_loading={data_loading}
      loading_message={loading_message}
      createAnnotation={handleCreateAnnotation}
      createRelation={handleCreateRelationship}
      deleteAnnotation={handleDeleteAnnotation}
      updateAnnotation={handleUpdateAnnotation}
      approveAnnotation={handleApproveAnnotation}
      rejectAnnotation={handleRejectAnnotation}
      containerRef={containerRef}
      containerRefCallback={containerRefCallback}
      pdfAnnotations={pdfAnnotations}
      show_structural_annotations={show_structural_annotations}
      show_annotation_labels={show_annotation_labels}
      scroll_to_annotation_on_open={scrollToAnnotation}
      setJumpedToAnnotationOnLoad={setHasScrolledToAnnotation}
      doc={pdfDoc}
      doc_text={docText}
      page_token_text_maps={pageTextMaps ? pageTextMaps : {}}
      pages={pages}
      spanLabels={span_label_lookup}
      humanSpanLabelChoices={human_span_label_lookup}
      relationLabels={relationship_label_lookup}
      docTypeLabels={document_label_lookup}
      setViewState={onError}
      shiftDown={shiftDown}
      selected_corpus={selectedCorpus}
      selected_document={selectedDocument}
      analyses={analyses ? analyses : []}
      extracts={extracts ? extracts : []}
      datacells={data_cells ? data_cells : []}
      columns={columns ? columns : []}
      editMode={editMode}
      setEditMode={setEditMode}
      allowInput={allowInput}
      setAllowInput={setAllowInput}
      selected_analysis={selected_analysis}
      selected_extract={selected_extract}
      onSelectAnalysis={
        onSelectAnalysis ? onSelectAnalysis : (a: AnalysisType | null) => null
      }
      onSelectExtract={
        onSelectExtract ? onSelectExtract : (e: ExtractType | null) => null
      }
    />
  );
};
