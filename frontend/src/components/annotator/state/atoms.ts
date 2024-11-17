import { atom } from "jotai";
import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { PDFPageInfo } from "../types/pdf";
import {
  AnalysisType,
  AnnotationLabelType,
  ServerAnnotationType,
  LabelDisplayBehavior,
  ExtractType,
  AnalysisRowType,
  DatacellType,
  ColumnType,
  CorpusType,
  DocumentType,
} from "../../../types/graphql-api";
import { atomsWithQuery } from "jotai-apollo";
import {
  ServerTokenAnnotation,
  ServerSpanAnnotation,
  DocTypeAnnotation,
  RelationGroup,
  TokenId,
} from "../types/annotations";
import { LabelType, ViewState } from "../types/enums";
import { ApolloClient, NormalizedCacheObject } from "@apollo/client";
import {
  GET_ANNOTATIONS_FOR_ANALYSIS,
  GET_DATACELLS_FOR_EXTRACT,
  GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
  GET_DOCUMENT_ANNOTATIONS_AND_RELATIONSHIPS,
  GetAnnotationsForAnalysisInput,
  GetAnnotationsForAnalysisOutput,
  GetDatacellsForExtractInput,
  GetDatacellsForExtractOutput,
  GetDocumentAnalysesAndExtractsInput,
  GetDocumentAnalysesAndExtractsOutput,
  GetDocumentAnnotationsAndRelationshipsInput,
  GetDocumentAnnotationsAndRelationshipsOutput,
} from "../../../graphql/queries";
import {
  convertToDocTypeAnnotation,
  convertToServerAnnotation,
} from "../../../utils/transform";
import _ from "lodash";
import pdfjsLib from "pdfjs-dist";
import { getDocumentRawText, getPawlsLayer } from "../api/rest";
import { PermissionTypes, Token } from "../../types";
import { createTokenStringSearch } from "../utils";
import { getPermissions } from "../../../utils/transform";

// UI State & Settings
export const documentLoadingStatusAtom = atom<DocumentLoadingStatus | null>(
  null
);
export const modalOpenAtom = atom<boolean>(false);
export const viewStateAtom = atom<ViewState>(ViewState.LOADING);
export const editModeAtom = atom<"ANALYZE" | "ANNOTATE">("ANNOTATE");
export const allowUserInputAtom = atom<boolean>(false);
export const pdfZoomFactorAtom = atom<number>(1);
export const showStructuralAnnotationsAtom = atom<boolean>(true);
export const showAnnotationLabelsAtom = atom<LabelDisplayBehavior>(
  LabelDisplayBehavior.ON_HOVER
);

/**
 * Controls whether to show only selected annotations.
 * When true, hides all other annotations.
 */
export const showSelectedAnnotationOnlyAtom = atom<boolean>(false);

// Navigation State
/**
 * Controls which annotation to display when the annotator first loads.
 * Used for jumping directly to a specific annotation when opening a document.
 */
export const displayAnnotationOnAnnotatorLoadAtom =
  atom<ServerAnnotationType | null>(null);

/**
 * When set, restricts the annotator to only show these specific annotations.
 * Bypasses loading annotations from the server, useful for preview/review scenarios.
 */
export const onlyDisplayTheseAnnotationsAtom = atom<
  ServerAnnotationType[] | undefined
>(undefined);

// PDF Document State
export const openContractDocAtom = atom<DocumentType>();
export const pdfDocumentAtom = atom<PDFDocumentProxy | undefined>(undefined);
export const documentTypeAtom = atom<string>("");
export const pdfPagesAtom = atom<PDFPageInfo[]>([]);
export const pageTextMapsAtom = atom<Record<number, TokenId> | undefined>(
  undefined
);
export const rawTextAtom = atom<string>("");

// Analysis & Extract State
export const analysesAtom = atom<AnalysisType[]>([]);
export const extractsAtom = atom<ExtractType[]>([]);
export const selectedAnalysisAtom = atom<AnalysisType | null>(null);
export const selectedExtractAtom = atom<ExtractType | null>(null);

// Annotation State
export const structuralAnnotationsAtom = atom<ServerTokenAnnotation[]>([]);
export const annotationObjectsAtom = atom<
  (ServerTokenAnnotation | ServerSpanAnnotation)[]
>([]);
export const docTypeAnnotationsAtom = atom<DocTypeAnnotation[]>([]);
export const relationshipAnnotationsAtom = atom<RelationGroup[]>([]);
export const analysisRowsAtom = atom<AnalysisRowType[]>([]);
export const dataCellsAtom = atom<DatacellType[]>([]);
export const columnsAtom = atom<ColumnType[]>([]);

// Label State
export const relationLabelsAtom = atom<AnnotationLabelType[]>([]);
export const docTypeLabelsAtom = atom<AnnotationLabelType[]>([]);
export const spanLabelsAtom = atom<AnnotationLabelType[]>([]);
export const humanSpanLabelsAtom = atom<AnnotationLabelType[]>([]);

// Progress & Loading State
export const progressAtom = atom<number>(0);
export const loadedPageForAnnotationAtom = atom<ServerAnnotationType | null>(
  null
);
export const jumpedToAnnotationOnLoadAtom = atom<string | null>(null);

// Derived atoms for computed values
export const zoomLevelAtom = atom(
  (get) => get(pdfZoomFactorAtom),
  (get, set, newValue: number) => set(pdfZoomFactorAtom, newValue)
);

// Apollo Client atom
export const apolloClientAtom =
  atom<ApolloClient<NormalizedCacheObject> | null>(null);

// Document Context
export const documentAtom = atom<DocumentType | null>(null);
export const corpusAtom = atom<CorpusType | null>(null);

// ... other atoms remain the same ...

// Query Atoms
/**
 * Fetches analyses and extracts for the current document/corpus.
 * - Analyses represent AI-generated annotations
 * - Extracts represent structured data extracted from documents
 * This query provides the base data needed for annotation review and extraction validation.
 */
export const [
  documentAnalysesAndExtractsAtom,
  documentAnalysesAndExtractsStatusAtom,
] = atomsWithQuery<
  GetDocumentAnalysesAndExtractsOutput,
  GetDocumentAnalysesAndExtractsInput
>((get) => {
  const document = get(documentAtom);
  const corpus = get(corpusAtom);
  const displayOnly = get(onlyDisplayTheseAnnotationsAtom);

  // Build variables the same way as in DocumentAnnotator
  const corpus_id = corpus?.id;
  const analysis_vars = {
    documentId: document?.id ?? "",
    ...(corpus_id !== undefined ? { corpusId: corpus_id } : {}),
  } as GetDocumentAnalysesAndExtractsInput;

  return {
    queryKey: ["documentAnalysesAndExtracts", document?.id, corpus?.id],
    client: get(apolloClientAtom),
    query: GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
    variables: analysis_vars,
    skip: Boolean(displayOnly),
    fetchPolicy: "network-only",
  };
});

/**
 * Fetches annotations for a specific analysis.
 * Triggered when user selects an analysis to review its annotations.
 * Used for reviewing and validating AI-generated annotations.
 */
export const [annotationsForAnalysisAtom, annotationsForAnalysisStatusAtom] =
  atomsWithQuery<
    GetAnnotationsForAnalysisOutput,
    GetAnnotationsForAnalysisInput
  >((get) => ({
    queryKey: [
      "annotationsForAnalysis",
      get(selectedAnalysisAtom)?.id,
      get(documentAtom)?.id,
    ],
    client: get(apolloClientAtom),
    query: GET_ANNOTATIONS_FOR_ANALYSIS,
    variables: {
      analysisId: get(selectedAnalysisAtom)?.id ?? "",
      documentId: get(documentAtom)?.id ?? "",
    },
  }));

/**
 * Fetches data cells for a specific extract.
 * Triggered when user selects an extract to review extracted data.
 * Used for reviewing and validating structured data extraction results.
 */
export const [dataCellsForExtractAtom, dataCellsForExtractStatusAtom] =
  atomsWithQuery<GetDatacellsForExtractOutput, GetDatacellsForExtractInput>(
    (get) => ({
      queryKey: ["dataCellsForExtract", get(selectedExtractAtom)?.id],
      client: get(apolloClientAtom),
      query: GET_DATACELLS_FOR_EXTRACT,
      variables: {
        extractId: get(selectedExtractAtom)?.id ?? "",
      },
    })
  );

/**
 * Fetches all annotations and relationships for a document.
 * Includes structural annotations, human annotations, and relationships between annotations.
 * Core query for loading the complete annotation state of a document.
 */
export const [
  documentAnnotationsAndRelationshipsAtom,
  documentAnnotationsAndRelationshipsStatusAtom,
] = atomsWithQuery<
  GetDocumentAnnotationsAndRelationshipsOutput,
  GetDocumentAnnotationsAndRelationshipsInput
>((get) => ({
  queryKey: [
    "documentAnnotations",
    get(documentAtom)?.id,
    get(corpusAtom)?.id,
    get(selectedAnalysisAtom)?.id,
  ],
  client: get(apolloClientAtom),
  query: GET_DOCUMENT_ANNOTATIONS_AND_RELATIONSHIPS,
  variables: {
    documentId: get(documentAtom)?.id ?? "",
    corpusId: get(corpusAtom)?.id ?? "",
    ...(get(selectedAnalysisAtom)?.id
      ? { analysisId: get(selectedAnalysisAtom)?.id }
      : {}),
  },
}));

// Derived atoms for processing
/**
 * Processes raw annotation data from documentAnnotationsAndRelationshipsAtom into structured format.
 * Separates and converts:
 * - Structural annotations (document structure)
 * - Regular annotations (spans, tokens)
 * - Relationships between annotations
 * - Label definitions from corpus
 */
export const processedAnnotationsAtom = atom((get) => {
  const annotationsData = get(documentAnnotationsAndRelationshipsAtom);
  if (
    !annotationsData ||
    annotationsData instanceof Promise ||
    !annotationsData?.document
  )
    return null;

  return {
    structuralAnnotations:
      annotationsData.document.allStructuralAnnotations?.map((ann) =>
        convertToServerAnnotation(ann)
      ) ?? [],
    annotations:
      annotationsData.document.allAnnotations?.map((ann) =>
        convertToServerAnnotation(ann)
      ) ?? [],
    relationships:
      annotationsData.document.allRelationships?.map(
        (rel) =>
          new RelationGroup(
            rel.sourceAnnotations.edges
              .map((edge) => edge?.node?.id)
              .filter((id): id is string => id !== undefined),
            rel.targetAnnotations.edges
              .map((edge) => edge?.node?.id)
              .filter((id): id is string => id !== undefined),
            rel.relationshipLabel,
            rel.id
          )
      ) ?? [],
    labels: annotationsData.corpus?.labelSet?.allAnnotationLabels ?? [],
  };
});

/**
 * Filters annotations based on selected analysis.
 * When an analysis is selected, shows only its annotations.
 * Otherwise shows all annotations.
 */
export const filteredAnnotationsAtom = atom((get) => {
  const processedData = get(processedAnnotationsAtom);
  const selectedAnalysis = get(selectedAnalysisAtom);

  if (!processedData) return [];

  const annotations = processedData.annotations;

  if (selectedAnalysis) {
    return annotations.filter((ann) => ann.id === selectedAnalysis.id);
  }
  return annotations;
});

/**
 * Handles side effects of selecting an analysis:
 * 1. Resets existing annotation states
 * 2. Disables user input during analysis review
 * 3. Clears any selected extract
 * Ensures clean state for reviewing analysis results.
 */
export const analysisSelectionEffectAtom = atom(
  null, // Read value not used
  (get, set, selectedAnalysis: AnalysisType | null) => {
    // Reset states
    set(annotationObjectsAtom, []);
    set(docTypeAnnotationsAtom, []);
    set(docTypeLabelsAtom, []);
    set(spanLabelsAtom, []);
    set(dataCellsAtom, []);

    if (selectedAnalysis) {
      // Disable user input and clear extract selection
      set(allowUserInputAtom, false);
      set(selectedExtractAtom, null);

      // The actual query is handled by annotationsForAnalysisAtom
      // We just need to process its results
    } else {
      set(allowUserInputAtom, true);
    }
  }
);

/**
 * Processes annotations from selected analysis:
 * - Separates span/token annotations from document-level annotations
 * - Converts annotations to correct format
 * - Extracts unique labels for both types
 * Prepares analysis data for display in the annotator.
 */
export const processedAnalysisAnnotationsAtom = atom((get) => {
  const analysisData = get(annotationsForAnalysisAtom);

  if (
    !analysisData ||
    analysisData instanceof Promise ||
    !analysisData.analysis
  ) {
    return null;
  }

  const { fullAnnotationList } = analysisData.analysis;

  if (!fullAnnotationList) {
    return null;
  }

  // Split and process annotations by type
  const rawSpanAnnotations = fullAnnotationList.filter(
    (annot) =>
      annot.annotationLabel.labelType === LabelType.TokenLabel ||
      annot.annotationLabel.labelType === LabelType.SpanLabel
  );

  const rawDocAnnotations = fullAnnotationList.filter(
    (annot) => annot.annotationLabel.labelType === LabelType.DocTypeLabel
  );

  // Process span annotations
  const processedSpanAnnotations = rawSpanAnnotations.map((annotation) =>
    convertToServerAnnotation(annotation)
  );

  // Get unique span labels
  const uniqueSpanLabels = _.uniqBy(
    processedSpanAnnotations.map((a) => a.annotationLabel),
    "id"
  );

  // Process doc annotations
  const processedDocAnnotations = rawDocAnnotations.map((annotation) =>
    convertToDocTypeAnnotation(annotation)
  );

  // Get unique doc labels
  const uniqueDocLabels = _.uniqBy(
    processedDocAnnotations.map((a) => a.annotationLabel),
    "id"
  );

  return {
    spanAnnotations: processedSpanAnnotations,
    spanLabels: uniqueSpanLabels,
    docAnnotations: processedDocAnnotations,
    docLabels: uniqueDocLabels,
  };
});

/**
 * Updates application state with processed analysis annotations:
 * - Sets annotation objects for display
 * - Updates available labels
 * - Updates document-type annotations
 * Ensures UI reflects current analysis state.
 */
export const analysisAnnotationsEffectAtom = atom(null, (get, set) => {
  const processedData = get(processedAnalysisAnnotationsAtom);

  if (processedData) {
    set(annotationObjectsAtom, processedData.spanAnnotations);
    set(spanLabelsAtom, processedData.spanLabels);
    set(docTypeAnnotationsAtom, processedData.docAnnotations);
    set(docTypeLabelsAtom, processedData.docLabels);
  }
});

/**
 * Effect atom that handles UI state changes when analysis selection changes.
 * Automatically updates:
 * 1. Annotation bounding box visibility
 * 2. Label display behavior
 * 3. Selected annotation visibility
 */
export const analysisUIEffectAtom = atom(null, (get, set) => {
  const selectedAnalysis = get(selectedAnalysisAtom);

  if (selectedAnalysis) {
    set(showStructuralAnnotationsAtom, true);
    set(showAnnotationLabelsAtom, LabelDisplayBehavior.ON_HOVER);
    set(showSelectedAnnotationOnlyAtom, false);
  }
});

// Update the existing selectedAnalysisWithEffectsAtom to include UI effects
export const selectedAnalysisWithEffectsAtom = atom(
  (get) => get(selectedAnalysisAtom),
  (get, set, analysis: AnalysisType | null) => {
    set(selectedAnalysisAtom, analysis);
    set(analysisSelectionEffectAtom, analysis);
    set(analysisUIEffectAtom);
  }
);

// Add this effect atom to handle document analyses and extracts updates
export const documentAnalysesAndExtractsEffectAtom = atom(null, (get, set) => {
  const queryResult = get(documentAnalysesAndExtractsAtom);
  const displayOnly = get(onlyDisplayTheseAnnotationsAtom);

  // Skip if no data or if displayOnly is set
  if (!queryResult || queryResult instanceof Promise || displayOnly) return;

  const { documentCorpusActions } = queryResult;
  if (documentCorpusActions) {
    const { analysisRows, extracts } = documentCorpusActions;
    set(extractsAtom, extracts || []);
    set(
      analysesAtom,
      analysisRows
        .map((row) => row.analysis)
        .filter((a): a is AnalysisType => a !== null && a !== undefined)
    );
  }
});

// Create a type for document loading status
export interface DocumentLoadingStatus {
  loaded: number;
  total: number;
}

/**
 * Processes annotations when displayOnlyTheseAnnotations is set.
 * Converts annotations to server format and updates relevant state.
 */
export const displayOnlyAnnotationsEffectAtom = atom(
  (get) => get(onlyDisplayTheseAnnotationsAtom),
  (get, set, annotations: ServerAnnotationType[] | undefined) => {
    if (annotations && annotations.length > 0) {
      console.log("Processing displayOnlyTheseAnnotations");

      try {
        // Convert the annotations
        const processedAnnotations = annotations.map((annotation) =>
          convertToServerAnnotation(annotation)
        );
        console.log("Processed Annotations:", processedAnnotations);
        set(annotationObjectsAtom, processedAnnotations);

        // Update span labels
        const uniqueLabels = _.uniqBy(
          processedAnnotations.map((a) => a.annotationLabel),
          "id"
        );
        console.log("Unique Span Labels:", uniqueLabels);
        set(spanLabelsAtom, uniqueLabels);

        // Set the view state to LOADED
        console.log(
          "Setting view state to LOADED after processing annotations"
        );
        set(viewStateAtom, ViewState.LOADED);
      } catch (error) {
        console.error("Error processing displayOnlyTheseAnnotations:", error);
        set(viewStateAtom, ViewState.ERROR);
      }
    }
  }
);

/**
 * Comprehensive document loading effect that:
 * 1. Loads document content (PDF/TXT)
 * 2. Loads annotations if needed (unless displayOnly is set)
 * 3. Processes document structure (for PDFs)
 * 4. Sets up text mapping for annotation positioning
 * Coordinates all data loading needed for document annotation.
 */
export const documentLoadingEffectAtom = atom(null, async (get, set) => {
  const document = get(documentAtom);
  const corpus = get(corpusAtom);
  const zoomLevel = get(zoomLevelAtom);
  const displayOnly = get(onlyDisplayTheseAnnotationsAtom);

  if (!document) return;

  // If displayOnly is set, let the displayOnlyAnnotationsEffectAtom handle it
  if (displayOnly) {
    set(displayOnlyAnnotationsEffectAtom, displayOnly);
    return;
  }

  // Set initial loading state
  set(viewStateAtom, ViewState.LOADING);

  try {
    // Load annotations if needed
    const loadAnnotations = async () => {
      if (corpus?.labelSet && !displayOnly) {
        const annotationsData = await get(
          documentAnnotationsAndRelationshipsAtom
        );
        if (!(annotationsData instanceof Promise)) {
          const processedData = get(processedAnnotationsAtom);
          if (processedData) {
            set(structuralAnnotationsAtom, processedData.structuralAnnotations);
            set(annotationObjectsAtom, processedData.annotations);
            set(relationshipAnnotationsAtom, processedData.relationships);

            // Process labels
            const spanLabels = processedData.labels.filter(
              (label) => label.labelType === LabelType.SpanLabel
            );
            set(spanLabelsAtom, spanLabels);
            set(humanSpanLabelsAtom, spanLabels);

            set(
              relationLabelsAtom,
              processedData.labels.filter(
                (label) => label.labelType === LabelType.RelationshipLabel
              )
            );

            set(
              docTypeLabelsAtom,
              processedData.labels.filter(
                (label) => label.labelType === LabelType.DocTypeLabel
              )
            );
          }
        }
      }
    };

    if (document.fileType === "application/pdf" && document.pdfFile) {
      // Load PDF document
      const loadingTask = pdfjsLib.getDocument(document.pdfFile);
      loadingTask.onProgress = (progress: {
        loaded: number;
        total: number;
      }) => {
        set(documentLoadingStatusAtom, {
          loaded: progress.loaded,
          total: progress.total,
        });
        set(progressAtom, Math.round((progress.loaded / progress.total) * 100));
      };

      const [pdfDoc, pawlsData] = await Promise.all([
        loadingTask.promise,
        getPawlsLayer(document.pawlsParseFile || ""),
        loadAnnotations(),
      ]);

      // Set PDF document
      set(pdfDocumentAtom, pdfDoc);

      // Load pages
      const loadedPages = await Promise.all(
        Array.from({ length: pdfDoc.numPages }, (_, i) => i + 1).map(
          async (pageNum) => {
            const page = await pdfDoc.getPage(pageNum);
            let pageTokens: Token[] = [];

            if (pawlsData.length === 0) {
              console.error("Token layer isn't available for this document");
            } else {
              pageTokens = pawlsData[pageNum - 1].tokens;
            }

            return new PDFPageInfo(page, pageTokens, zoomLevel);
          }
        )
      );

      set(pdfPagesAtom, loadedPages);

      // Process text maps
      const { doc_text, string_index_token_map } =
        createTokenStringSearch(loadedPages);
      set(pageTextMapsAtom, string_index_token_map);
      set(rawTextAtom, doc_text);
    } else if (document.fileType === "application/txt") {
      const [rawText] = await Promise.all([
        getDocumentRawText(document.txtExtractFile || ""),
        loadAnnotations(),
      ]);

      set(rawTextAtom, rawText);
    }

    // Set loaded state
    set(viewStateAtom, ViewState.LOADED);
  } catch (error) {
    console.error("Error loading document:", error);
    set(viewStateAtom, ViewState.ERROR);
  }
});

/**
 * Triggers document loading when:
 * 1. Modal is opened
 * 2. Document is selected
 * 3. Corpus changes
 * Ensures document data is loaded at appropriate times.
 */
export const documentLoadTriggerEffectAtom = atom(null, (get, set) => {
  const document = get(documentAtom);
  const corpus = get(corpusAtom);
  const isOpen = get(modalOpenAtom); // You'll need to add this atom

  if (isOpen && document) {
    set(documentLoadingEffectAtom);
  }
});

/**
 * Calculates document permissions based on the opened document's raw permissions.
 * Converts raw permission strings into typed PermissionTypes array.
 */
export const documentPermissionsAtom = atom<PermissionTypes[]>((get) => {
  const document = get(documentAtom);
  const rawPermissions = document?.myPermissions;

  if (document && rawPermissions !== undefined) {
    return getPermissions(rawPermissions);
  }
  return [];
});

/**
 * Calculates corpus permissions based on the opened corpus's raw permissions.
 * Defaults to ["READ"] if no corpus is selected.
 * Converts raw permission strings into typed PermissionTypes array.
 */
export const corpusPermissionsAtom = atom<PermissionTypes[]>((get) => {
  const corpus = get(corpusAtom);
  const rawPermissions = corpus?.myPermissions ?? ["READ"];

  if (corpus && rawPermissions !== undefined) {
    return getPermissions(rawPermissions);
  }
  return getPermissions(["READ"]);
});

/**
 * Effect atom that triggers initial load of analyses and extracts.
 * Equivalent to the component's mount effect.
 */
export const initialAnalysesLoadEffectAtom = atom(null, (get, set) => {
  const client = get(apolloClientAtom);
  const document = get(documentAtom);
  const corpus = get(corpusAtom);
  const displayOnly = get(onlyDisplayTheseAnnotationsAtom);

  if (client && document && !displayOnly) {
    // Force a refetch of the analyses and extracts
    client.refetchQueries({
      include: ["documentAnalysesAndExtracts"],
      updateCache(cache) {
        cache.evict({
          fieldName: "documentCorpusActions",
          args: {
            documentId: document.id,
            corpusId: corpus?.id,
          },
        });
      },
    });
  }
});

/**
 * Processes data cells and their annotations when an extract is selected.
 * Handles:
 * 1. Setting data cells and columns
 * 2. Processing annotations from data cells
 * 3. Updating span labels
 */
export const processedDataCellsAtom = atom((get) => {
  const dataCellsData = get(dataCellsForExtractAtom);
  if (
    !dataCellsData ||
    dataCellsData instanceof Promise ||
    !dataCellsData.extract
  )
    return null;

  const { extract } = dataCellsData;

  // Process annotations from datacells
  const processedAnnotations = (extract.fullDatacellList || [])
    .flatMap((datacell) => datacell.fullSourceList || [])
    .map((annotation) => convertToServerAnnotation(annotation));

  // Get unique labels
  const uniqueLabels = _.uniqBy(
    processedAnnotations.map((a) => a.annotationLabel),
    "id"
  );

  return {
    dataCells: extract.fullDatacellList || [],
    columns: extract.fieldset.fullColumnList || [],
    annotations: processedAnnotations,
    spanLabels: uniqueLabels,
  };
});

/**
 * Effect atom that automatically reacts to changes in selectedExtractAtom.
 * Handles:
 * 1. Resets states when extract changes
 * 2. Fetches and processes data cells for selected extract
 * 3. Updates UI controls and annotation states
 */
export const selectedExtractEffectAtom = atom(
  (get) => get(selectedExtractAtom), // Read the selected extract
  (get, set) => {
    const selectedExtract = get(selectedExtractAtom);
    const processedData = get(processedDataCellsAtom);

    // Reset states
    set(annotationObjectsAtom, []);
    set(docTypeAnnotationsAtom, []);
    set(docTypeLabelsAtom, []);
    set(spanLabelsAtom, []);
    set(dataCellsAtom, []);

    if (selectedExtract) {
      // Disable user input and ensure analysis is deselected
      set(allowUserInputAtom, false);
      set(selectedAnalysisAtom, null);

      if (processedData) {
        // Set the processed data
        set(dataCellsAtom, processedData.dataCells);
        set(columnsAtom, processedData.columns);
        set(annotationObjectsAtom, processedData.annotations);
        set(spanLabelsAtom, processedData.spanLabels);
      }
    } else {
      set(allowUserInputAtom, true);
      // Handle deselection refresh if needed
      const selectedAnalysis = get(selectedAnalysisAtom);
      if (!selectedAnalysis) {
        set(refreshAnalysesAndExtractsEffectAtom);
      }
    }
  }
);

/**
 * Combined atom for extract selection that handles both state and side effects
 */
export const selectedExtractWithEffectsAtom = atom(
  (get) => get(selectedExtractAtom),
  (get, set, extract: ExtractType | null) => {
    const previousExtract = get(selectedExtractAtom);
    set(selectedExtractAtom, extract);

    if (extract) {
      // Handle selection
      set(selectedExtractEffectAtom);
    } else if (previousExtract && !extract) {
      // Handle deselection
      const selectedAnalysis = get(selectedAnalysisAtom);
      if (!selectedAnalysis) {
        // Only refresh if no analysis is selected
        set(refreshAnalysesAndExtractsEffectAtom);
      }
    }
  }
);

/**
 * Effect atom that handles refreshing analyses and extracts.
 * Triggers a refetch of the data and updates the relevant atoms.
 */
export const refreshAnalysesAndExtractsEffectAtom = atom(null, (get, set) => {
  const queryResult = get(documentAnalysesAndExtractsAtom);
  const displayOnly = get(onlyDisplayTheseAnnotationsAtom);

  // Skip if no data or if displayOnly is set
  if (!queryResult || queryResult instanceof Promise || displayOnly) return;

  const { documentCorpusActions } = queryResult;
  if (documentCorpusActions) {
    const { analysisRows, extracts } = documentCorpusActions;
    set(extractsAtom, extracts || []);
    set(
      analysesAtom,
      analysisRows
        .map((row) => row.analysis)
        .filter((a): a is AnalysisType => a !== null && a !== undefined)
    );
  }
});

/**
 * Effect atom that resets user input when edit mode changes.
 * Ensures user input is disabled when switching modes.
 */
export const editModeEffectAtom = atom(
  (get) => get(editModeAtom),
  (get, set) => {
    set(allowUserInputAtom, false);
  }
);

/**
 * Effect atom that updates document type when document changes.
 * Stores the file type from the opened document in state.
 */
export const documentTypeEffectAtom = atom(
  (get) => get(documentAtom),
  (get, set) => {
    const document = get(documentAtom);
    set(documentTypeAtom, document?.fileType ?? "");
  }
);

/**
 * Effect atom that updates view state when PDF document and its dependencies are loaded.
 * Triggers state change to LOADED when:
 * 1. Document is a PDF
 * 2. PDF document is loaded
 * 3. Page text maps are available
 * 4. Pages are loaded
 */
export const pdfLoadingEffectAtom = atom(null, (get, set) => {
  const document = get(documentAtom);
  const pdfDoc = get(pdfDocumentAtom);
  const pageTextMaps = get(pageTextMapsAtom);
  const pages = get(pdfPagesAtom);

  if (document?.fileType === "application/pdf") {
    if (pdfDoc && pageTextMaps && pages.length > 0) {
      console.log("React to PDF document loading properly", pdfDoc);
      set(viewStateAtom, ViewState.LOADED);
    }
  }
});

/**
 * Derived atom that combines loading states from various data sources.
 * Returns true if any data is currently loading.
 */
export const dataLoadingAtom = atom((get) => {
  // Get status atoms from atomsWithQuery results
  const dataCellsStatus = get(dataCellsForExtractStatusAtom);
  const analysesStatus = get(documentAnalysesAndExtractsStatusAtom);
  const annotationsStatus = get(documentAnnotationsAndRelationshipsStatusAtom);

  return (
    dataCellsStatus.loading ||
    analysesStatus.loading ||
    annotationsStatus.loading
  );
});
