import { useState, useEffect } from "react";
import { useQuery, useLazyQuery, useReactiveVar } from "@apollo/client";
import {
  AnalysisRowType,
  AnalysisType,
  DatacellType,
  ColumnType,
  ExtractType,
  DocumentType,
  CorpusType,
  AnnotationLabelType,
  LabelType as AnnotationLabelTypeEnum,
  LabelDisplayBehavior,
} from "../../../types/graphql-api";
import {
  GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
  GetDocumentAnalysesAndExtractsOutput,
  GetDocumentAnalysesAndExtractsInput,
  GET_ANNOTATIONS_FOR_ANALYSIS,
  GetAnnotationsForAnalysisOutput,
  GetAnnotationsForAnalysisInput,
  GET_DATACELLS_FOR_EXTRACT,
  GetDatacellsForExtractOutput,
  GetDatacellsForExtractInput,
} from "../../../graphql/queries";
import {
  selectedAnalysis,
  selectedExtract,
  allowUserInput,
  showAnnotationBoundingBoxes,
  showAnnotationLabels,
  showSelectedAnnotationOnly,
} from "../../../graphql/cache";
import { useAnnotationManager } from "./useAnnotationManager";
import {
  convertToServerAnnotation,
  convertToDocTypeAnnotation,
} from "../../../utils/transform";
import {
  ServerTokenAnnotation,
  ServerSpanAnnotation,
} from "../types/annotations";
import { toast } from "react-toastify";
import { useCorpusContext } from "../context/CorpusContext";
import { useUISettings } from "./useUISettings";
import _ from "lodash";

/**
 * Custom hook to manage analysis and extract data.
 *
 * @param opened_document The currently opened document.
 * @param opened_corpus   The currently opened corpus.
 * @returns An object containing analysis and extract data and related functions.
 */
export const useAnalysisManager = (
  opened_document: DocumentType,
  opened_corpus?: CorpusType
) => {
  const [analysisRows, setAnalysisRows] = useState<AnalysisRowType[]>([]);
  const [dataCells, setDataCells] = useState<DatacellType[]>([]);
  const [columns, setColumns] = useState<ColumnType[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisType[]>([]);
  const [extracts, setExtracts] = useState<ExtractType[]>([]);

  const selected_analysis = useReactiveVar(selectedAnalysis);
  const selected_extract = useReactiveVar(selectedExtract);

  const { addMultipleAnnotations, setDocTypeAnnotations } =
    useAnnotationManager();
  const { setSpanLabels, setDocTypeLabels } = useCorpusContext();

  const {
    queryLoadingStates,
    setQueryLoadingStates,
    queryErrors,
    setQueryErrors,
  } = useUISettings();

  const {
    data: analysesData,
    loading: analysesLoading,
    error: analysesError,
    refetch: fetchDocumentAnalysesAndExtracts,
  } = useQuery<
    GetDocumentAnalysesAndExtractsOutput,
    GetDocumentAnalysesAndExtractsInput
  >(GET_DOCUMENT_ANALYSES_AND_EXTRACTS, {
    variables: {
      documentId: opened_document.id,
      ...(opened_corpus?.id ? { corpusId: opened_corpus.id } : {}),
    },
    fetchPolicy: "network-only",
  });

  const [
    fetchAnnotationsForAnalysis,
    {
      loading: annotationsLoading,
      error: annotationsError,
      data: annotationsData,
    },
  ] = useLazyQuery<
    GetAnnotationsForAnalysisOutput,
    GetAnnotationsForAnalysisInput
  >(GET_ANNOTATIONS_FOR_ANALYSIS);

  const [
    fetchDataCellsForExtract,
    { loading: datacellsLoading, error: datacellsError, data: datacellsData },
  ] = useLazyQuery<GetDatacellsForExtractOutput, GetDatacellsForExtractInput>(
    GET_DATACELLS_FOR_EXTRACT
  );

  /**
   * Resets the analysis, data cell, and column states.
   */
  const resetStates = () => {
    setAnalysisRows([]);
    setDataCells([]);
    setColumns([]);
  };

  // Update query loading states and errors for analyses
  useEffect(() => {
    setQueryLoadingStates((prevState) => ({
      ...prevState,
      analyses: analysesLoading,
    }));

    if (analysesError) {
      setQueryErrors((prevErrors) => ({
        ...prevErrors,
        analyses: analysesError,
      }));
      toast.error("Failed to fetch document analyses and extracts");
      console.error(analysesError);
    } else {
      setQueryErrors((prevErrors) => ({
        ...prevErrors,
        analyses: undefined,
      }));
    }
  }, [analysesLoading, analysesError]);

  // Fetch analyses and extracts when the component mounts or the document changes.
  useEffect(() => {
    if (analysesData && analysesData.documentCorpusActions) {
      const { analysisRows, extracts } = analysesData.documentCorpusActions;
      setAnalysisRows(analysisRows);
      setExtracts(extracts);
      setAnalyses(
        analysisRows
          .map((row) => row.analysis)
          .filter((a): a is AnalysisType => a !== null && a !== undefined)
      );
    }
  }, [analysesData]);

  // Fetch analyses and extracts when the hook is initialized.
  useEffect(() => {
    fetchDocumentAnalysesAndExtracts();
  }, []);

  // Reset states when the selected analysis or extract changes.
  useEffect(() => {
    resetStates();
    if (!selected_analysis && !selected_extract) {
      fetchDocumentAnalysesAndExtracts();
    }
  }, [selected_analysis, selected_extract]);

  // Fetch annotations for the selected analysis.
  useEffect(() => {
    if (selected_analysis) {
      allowUserInput(false);
      selectedExtract(null);

      fetchAnnotationsForAnalysis({
        variables: {
          analysisId: selected_analysis.id,
          documentId: opened_document.id,
        },
      });
    } else {
      allowUserInput(true);
    }
  }, [selected_analysis, opened_document.id, opened_corpus?.id]);

  // Update query loading states and errors for annotations
  useEffect(() => {
    setQueryLoadingStates((prevState) => ({
      ...prevState,
      annotations: annotationsLoading,
    }));

    if (annotationsError) {
      setQueryErrors((prevErrors) => ({
        ...prevErrors,
        annotations: annotationsError,
      }));
      toast.error("Failed to fetch annotations for analysis");
      console.error(annotationsError);
    } else {
      setQueryErrors((prevErrors) => ({
        ...prevErrors,
        annotations: undefined,
      }));
    }

    if (
      annotationsData &&
      annotationsData.analysis &&
      annotationsData.analysis.fullAnnotationList
    ) {
      // Filter for span annotations (TokenLabel and SpanLabel)
      const rawSpanAnnotations =
        annotationsData.analysis.fullAnnotationList.filter(
          (annot) =>
            annot.annotationLabel.labelType ===
              AnnotationLabelTypeEnum.TokenLabel ||
            annot.annotationLabel.labelType ===
              AnnotationLabelTypeEnum.SpanLabel
        );

      // Process span annotations
      const processedSpanAnnotations = rawSpanAnnotations.map((annotation) =>
        convertToServerAnnotation(annotation)
      ) as (ServerTokenAnnotation | ServerSpanAnnotation)[];

      // Add processed span annotations via annotation manager
      addMultipleAnnotations(processedSpanAnnotations);

      // Extract unique span labels and update via context
      const uniqueSpanLabels = _.uniqBy(
        processedSpanAnnotations.map((a) => a.annotationLabel),
        "id"
      );
      setSpanLabels(uniqueSpanLabels);

      // Filter for doc type annotations
      const rawDocAnnotations =
        annotationsData.analysis.fullAnnotationList.filter(
          (annot) =>
            annot.annotationLabel.labelType ===
            AnnotationLabelTypeEnum.DocTypeLabel
        );

      // Process doc type annotations
      const processedDocAnnotations = rawDocAnnotations.map((annotation) =>
        convertToDocTypeAnnotation(annotation)
      );

      // Use the annotation manager to set doc type annotations
      setDocTypeAnnotations(processedDocAnnotations);

      // Extract unique doc type labels and update via context
      const uniqueDocLabels = _.uniqBy(
        processedDocAnnotations.map((a) => a.annotationLabel),
        "id"
      );
      setDocTypeLabels(uniqueDocLabels);
    }
  }, [annotationsLoading, annotationsError, annotationsData]);

  // Fetch data cells for the selected extract.
  useEffect(() => {
    if (selected_extract) {
      allowUserInput(false);
      selectedAnalysis(null);

      fetchDataCellsForExtract({
        variables: {
          extractId: selected_extract.id,
        },
      });
    } else {
      allowUserInput(true);
    }
  }, [selected_extract, opened_document.id, opened_corpus?.id]);

  // Update query loading states and errors for datacells
  useEffect(() => {
    setQueryLoadingStates((prevState) => ({
      ...prevState,
      datacells: datacellsLoading,
    }));

    if (datacellsError) {
      setQueryErrors((prevErrors) => ({
        ...prevErrors,
        datacells: datacellsError,
      }));
      toast.error("Failed to fetch data cells for extract");
      console.error(datacellsError);
    } else {
      setQueryErrors((prevErrors) => ({
        ...prevErrors,
        datacells: undefined,
      }));
    }

    if (datacellsData && datacellsData.extract) {
      setDataCells(datacellsData.extract.fullDatacellList || []);
      setColumns(datacellsData.extract.fieldset.fullColumnList || []);

      // Process annotations from datacells
      const processedAnnotations = (
        datacellsData.extract.fullDatacellList || []
      )
        .flatMap((datacell) => datacell.fullSourceList || [])
        .map((annotation) => convertToServerAnnotation(annotation));

      addMultipleAnnotations(processedAnnotations);
    }
  }, [datacellsLoading, datacellsError, datacellsData]);

  /**
   * Handles selection of an analysis.
   *
   * @param analysis The analysis to select.
   */
  const onSelectAnalysis = (analysis: AnalysisType | null) => {
    // When a new analysis is loaded, we want to reset the view
    // behavior as, otherwise, particularly on mobile, it can get
    // take a lot of clicks to enable.
    showAnnotationBoundingBoxes(true);
    showAnnotationLabels(LabelDisplayBehavior.ON_HOVER);
    showSelectedAnnotationOnly(false);
    selectedAnalysis(analysis);
    selectedExtract(null);
  };

  /**
   * Handles selection of an extract.
   *
   * @param extract The extract to select.
   */
  const onSelectExtract = (extract: ExtractType | null) => {
    selectedExtract(extract);
    selectedAnalysis(null);
  };

  return {
    analysisRows,
    dataCells,
    columns,
    analyses,
    extracts,
    fetchDocumentAnalysesAndExtracts,
    resetStates,
    onSelectAnalysis,
    onSelectExtract,
  };
};
