import { useEffect, useMemo, useCallback } from "react";
import { useQuery, useLazyQuery } from "@apollo/client";
import { toast } from "react-toastify";
import _ from "lodash";
import { useAtom, useAtomValue } from "jotai";

import {
  AnalysisType,
  ExtractType,
  LabelType,
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
  analysisRowsAtom,
  dataCellsAtom,
  columnsAtom,
  analysesAtom,
  extractsAtom,
  selectedAnalysisAtom,
  selectedExtractAtom,
  allowUserInputAtom,
  showAnnotationBoundingBoxesAtom,
  showAnnotationLabelsAtom,
  showSelectedAnnotationOnlyAtom,
} from "../context/AnalysisAtoms";
import { useInitialAnnotations, usePdfAnnotations } from "./AnnotationHooks";
import { useCorpusState } from "../context/CorpusAtom";
import {
  useQueryLoadingStates,
  useQueryErrors,
} from "../context/UISettingsAtom";
import {
  convertToServerAnnotation,
  convertToDocTypeAnnotation,
} from "../../../utils/transform";
import {
  ServerTokenAnnotation,
  ServerSpanAnnotation,
} from "../types/annotations";
import {
  selectedDocumentAtom,
  selectedCorpusAtom,
} from "../context/DocumentAtom";

/**
 * Custom hook to manage analysis and extract data using Jotai atoms.
 * @returns An object containing analysis and extract data and related functions.
 */
export const useAnalysisManager = () => {
  // Get document and corpus from atoms instead of props
  const selectedDocument = useAtomValue(selectedDocumentAtom);
  const selectedCorpus = useAtomValue(selectedCorpusAtom);

  // Use atoms for state management
  const [analysisRows, setAnalysisRows] = useAtom(analysisRowsAtom);
  const [dataCells, setDataCells] = useAtom(dataCellsAtom);
  const [columns, setColumns] = useAtom(columnsAtom);
  const [analyses, setAnalyses] = useAtom(analysesAtom);
  const [extracts, setExtracts] = useAtom(extractsAtom);

  const [selected_analysis, setSelectedAnalysis] =
    useAtom(selectedAnalysisAtom);
  const [selected_extract, setSelectedExtract] = useAtom(selectedExtractAtom);

  const [, setAllowUserInput] = useAtom(allowUserInputAtom);
  const [, setShowAnnotationBoundingBoxes] = useAtom(
    showAnnotationBoundingBoxesAtom
  );
  const [, setShowAnnotationLabels] = useAtom(showAnnotationLabelsAtom);
  const [, setShowSelectedAnnotationOnly] = useAtom(
    showSelectedAnnotationOnlyAtom
  );

  const {
    addMultipleAnnotations,
    replaceDocTypeAnnotations,
    replaceAnnotations,
  } = usePdfAnnotations();
  const { setSpanLabels, setDocTypeLabels } = useCorpusState();

  const { setQueryLoadingStates } = useQueryLoadingStates();
  const { setQueryErrors } = useQueryErrors();

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
      documentId: selectedDocument?.id ?? "",
      ...(selectedCorpus?.id ? { corpusId: selectedCorpus.id } : {}),
    },
    skip: !selectedDocument?.id,
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

  // Access initial annotations
  const { initialAnnotations } = useInitialAnnotations();

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

  // Fetch analyses and extracts only when we have a valid document
  useEffect(() => {
    console.log("selectedDocument", selectedDocument);
    if (selectedDocument?.id) {
      fetchDocumentAnalysesAndExtracts();
    }
  }, [selectedDocument?.id]);

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
      console.log(
        "selected_analysis changed in AnalysisHooks",
        selected_analysis
      );
      setAllowUserInput(false);
      setSelectedExtract(null);

      // Clear existing annotations and datacell data
      replaceAnnotations([]);
      replaceDocTypeAnnotations([]);
      setDataCells([]);

      fetchAnnotationsForAnalysis({
        variables: {
          analysisId: selected_analysis.id,
          documentId: selectedDocument?.id ?? "",
        },
      });
    } else {
      setAllowUserInput(true);

      // Restore initial annotations
      replaceAnnotations(initialAnnotations);
    }
  }, [selected_analysis?.id, selectedDocument?.id, selectedCorpus?.id]);

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
      // Clear existing annotations and datacell data
      replaceAnnotations([]);
      replaceDocTypeAnnotations([]);
      setDataCells([]);

      // Process span annotations
      const rawSpanAnnotations =
        annotationsData.analysis.fullAnnotationList.filter(
          (annot) =>
            annot.annotationLabel.labelType === LabelType.TokenLabel ||
            annot.annotationLabel.labelType === LabelType.SpanLabel
        );

      // Process span annotations
      const processedSpanAnnotations = rawSpanAnnotations.map((annotation) =>
        convertToServerAnnotation(annotation)
      ) as (ServerTokenAnnotation | ServerSpanAnnotation)[];

      // Replace processed span annotations
      replaceAnnotations(processedSpanAnnotations);

      // Update span labels
      const uniqueSpanLabels = _.uniqBy(
        processedSpanAnnotations.map((a) => a.annotationLabel),
        "id"
      );
      setSpanLabels(uniqueSpanLabels);

      // Process doc type annotations
      const rawDocAnnotations =
        annotationsData.analysis.fullAnnotationList.filter(
          (annot) => annot.annotationLabel.labelType === LabelType.DocTypeLabel
        );

      const processedDocAnnotations = rawDocAnnotations.map((annotation) =>
        convertToDocTypeAnnotation(annotation)
      );

      // Replace doc type annotations
      replaceDocTypeAnnotations(processedDocAnnotations);

      // Update doc type labels
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
      console.log(
        "selected_extract changed in AnalysisHooks",
        selected_extract
      );
      setAllowUserInput(false);
      setSelectedAnalysis(null);

      // Clear existing annotations and datacell data
      replaceAnnotations([]);
      replaceDocTypeAnnotations([]);
      setDataCells([]);

      fetchDataCellsForExtract({
        variables: {
          extractId: selected_extract.id,
        },
      });
    } else {
      setAllowUserInput(true);

      // Restore initial annotations
      replaceAnnotations(initialAnnotations);
    }
  }, [selected_extract, selectedDocument?.id, selectedCorpus?.id]);

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

    if (datacellsData?.extract && selectedDocument?.id) {
      // Clear existing datacell data and annotations
      setDataCells([]);
      replaceAnnotations([]);

      // Filter datacells to only include those matching the selected document
      const filteredDatacells = (
        datacellsData.extract.fullDatacellList || []
      ).filter((datacell) => datacell.document?.id === selectedDocument.id);

      // Set new datacell data and columns
      setDataCells(filteredDatacells);
      setColumns(datacellsData.extract.fieldset.fullColumnList || []);

      // Process annotations from filtered datacells
      const processedAnnotations = filteredDatacells
        .flatMap((datacell) => datacell.fullSourceList || [])
        .map((annotation) => convertToServerAnnotation(annotation));

      // Replace annotations with processed annotations
      replaceAnnotations(processedAnnotations);
    }
  }, [datacellsLoading, datacellsError, datacellsData, selectedDocument?.id]);

  /**
   * Handles selection of an analysis.
   *
   * @param analysis The analysis to select.
   */
  const onSelectAnalysis = useCallback(
    (analysis: AnalysisType | null) => {
      // When a new analysis is loaded, reset the view behaviors
      setShowAnnotationBoundingBoxes(true);
      setShowAnnotationLabels(LabelDisplayBehavior.ON_HOVER);
      setShowSelectedAnnotationOnly(false);
      setSelectedAnalysis(analysis);
      setSelectedExtract(null);
    },
    [
      setShowAnnotationBoundingBoxes,
      setShowAnnotationLabels,
      setShowSelectedAnnotationOnly,
      setSelectedAnalysis,
      setSelectedExtract,
    ]
  );

  /**
   * Handles selection of an extract.
   *
   * @param extract The extract to select.
   */
  const onSelectExtract = (extract: ExtractType | null) => {
    setSelectedExtract(extract);
    setSelectedAnalysis(null);
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
    setDataCells,
  };
};

/**
 * Hook to manage selection state for analyses and extracts.
 * @returns Object containing selection states and setter functions
 */
export function useAnalysisSelection() {
  const [selectedAnalysis, setSelectedAnalysis] = useAtom(selectedAnalysisAtom);
  const [selectedExtract, setSelectedExtract] = useAtom(selectedExtractAtom);

  return useMemo(
    () => ({
      selectedAnalysis,
      setSelectedAnalysis,
      selectedExtract,
      setSelectedExtract,
      // Helper to clear both selections
      clearSelections: () => {
        setSelectedAnalysis(null);
        setSelectedExtract(null);
      },
    }),
    [selectedAnalysis, setSelectedAnalysis, selectedExtract, setSelectedExtract]
  );
}
