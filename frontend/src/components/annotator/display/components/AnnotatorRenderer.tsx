import { useEffect } from "react";
import { DocumentViewer } from "../viewer";
import {
  AnalysisType,
  ExtractType,
  ColumnType,
  DatacellType,
} from "../../../../types/graphql-api";
import { TokenId } from "../../../types";
import _ from "lodash";
import { getPermissions } from "../../../../utils/transform";
import {
  usePdfDoc,
  useSelectedDocument,
  useSelectedCorpus,
  useHasDocumentPermission,
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
  data_cells?: DatacellType[];
  columns?: ColumnType[];
  structural_annotations?: ServerTokenAnnotation[];
  allowInput: boolean;
  setIsHumanAnnotationMode?: (val: boolean) => undefined | void | null;
  setIsEditingEnabled?: (val: boolean) => undefined | void | null;
}

export const AnnotatorRenderer = ({
  analyses,
  extracts,
  data_cells,
  columns,
  selected_analysis,
  selected_extract,
  allowInput,
  onSelectAnalysis,
  onSelectExtract,
  scrollToAnnotation,
}: AnnotatorRendererProps) => {
  // Import state from DocumentAtom
  const { selectedDocument } = useSelectedDocument();
  const { selectedCorpus } = useSelectedCorpus();
  const { pdfDoc } = usePdfDoc();

  // Use permissions from DocumentAtom
  const raw_permissions = selectedDocument?.myPermissions ?? [];
  const doc_permissions = getPermissions(raw_permissions);

  const corpus_raw_permissions = selectedCorpus
    ? selectedCorpus.myPermissions ?? []
    : ["READ"];
  const corpus_permissions = getPermissions(corpus_raw_permissions);

  const { pdfAnnotations } = usePdfAnnotations();

  useEffect(() => {
    console.log("scrollToAnnotation", scrollToAnnotation);
  }, [scrollToAnnotation]);

  return (
    <DocumentViewer
      pdfAnnotations={pdfAnnotations}
      scroll_to_annotation_on_open={scrollToAnnotation}
      doc={pdfDoc}
      selected_corpus={selectedCorpus}
      selected_document={selectedDocument}
      analyses={analyses ? analyses : []}
      extracts={extracts ? extracts : []}
      datacells={data_cells ? data_cells : []}
      columns={columns ? columns : []}
      allowInput={allowInput}
      onSelectAnalysis={
        onSelectAnalysis ? onSelectAnalysis : (a: AnalysisType | null) => null
      }
      onSelectExtract={
        onSelectExtract ? onSelectExtract : (e: ExtractType | null) => null
      }
    />
  );
};
