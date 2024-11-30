import { useCallback, useRef } from "react";
import { DocumentViewer } from "../viewer";
import {
  AnalysisType,
  ExtractType,
  ColumnType,
  DatacellType,
} from "../../../../types/graphql-api";
import { ViewState, TokenId } from "../../../types";
import _ from "lodash";
import { getPermissions } from "../../../../utils/transform";
import { useSpanLabels } from "../../context/CorpusAtom";
import {
  usePdfDoc,
  useSelectedDocument,
  useSelectedCorpus,
  useDocText,
  usePages,
  usePageTextMaps,
} from "../../context/DocumentAtom";
import { usePdfAnnotations } from "../../hooks/AnnotationHooks";
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
  analyses?: AnalysisType[];
  extracts?: ExtractType[];
  selected_analysis?: AnalysisType | null;
  selected_extract?: ExtractType | null;
  onSelectAnalysis?: (analysis: AnalysisType | null) => undefined | null | void;
  onSelectExtract?: (extract: ExtractType | null) => undefined | null | void;
  scrollToAnnotation?: ServerTokenAnnotation | ServerSpanAnnotation;
  show_structural_annotations: boolean;
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
  analyses,
  extracts,
  data_cells,
  columns,
  selected_analysis,
  selected_extract,
  editMode,
  allowInput,
  setAllowInput,
  setEditMode,
  onSelectAnalysis,
  onSelectExtract,
  scrollToAnnotation,
  show_structural_annotations,
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

  const { spanLabels: span_label_lookup } = useSpanLabels();
  const { pdfAnnotations } = usePdfAnnotations();

  return (
    <DocumentViewer
      doc_permissions={doc_permissions}
      corpus_permissions={corpus_permissions}
      pdfAnnotations={pdfAnnotations}
      show_structural_annotations={show_structural_annotations}
      scroll_to_annotation_on_open={scrollToAnnotation}
      doc={pdfDoc}
      doc_text={docText}
      page_token_text_maps={pageTextMaps ? pageTextMaps : {}}
      pages={pages}
      spanLabels={span_label_lookup}
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
