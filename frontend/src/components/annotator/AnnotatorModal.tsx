import { CorpusProvider } from "./context/CorpusAtom";
import { ViewSettingsPopup } from "../widgets/popups/ViewSettingsPopup";
import { DocumentAnnotator } from "./DocumentAnnotator";
import { Modal } from "semantic-ui-react";
import {
  editMode,
  onlyDisplayTheseAnnotations,
  selectedAnalysis,
  showAnnotationBoundingBoxes,
  showAnnotationLabels,
  showSelectedAnnotationOnly,
  showStructuralAnnotations,
  viewStateVar,
} from "../../graphql/cache";
import { Token, ViewState, label_display_options } from "../types";
import {
  CorpusType,
  DocumentType,
  LabelDisplayBehavior,
  LabelType,
} from "../../types/graphql-api";
import { useLazyQuery, useReactiveVar } from "@apollo/client";
import { useEffect } from "react";
import { PDFDocumentLoadingTask } from "pdfjs-dist";
import { useUISettings } from "./hooks/useUISettings";
import {
  GET_DOCUMENT_ANNOTATIONS_AND_RELATIONSHIPS,
  GetDocumentAnnotationsAndRelationshipsInput,
  GetDocumentAnnotationsAndRelationshipsOutput,
} from "../../graphql/queries";
import { getDocumentRawText, getPawlsLayer } from "./api/rest";
import { toast } from "react-toastify";
import { createTokenStringSearch } from "./utils";
import { convertToServerAnnotation } from "../../utils/transform";
import { PdfAnnotations, RelationGroup } from "./types/annotations";
import {
  usePdfDoc,
  usePages,
  usePageTextMaps,
  useDocumentType,
  useDocText,
} from "./context/DocumentAtom";
import {
  useSpanLabels,
  useHumanSpanLabels,
  useRelationLabels,
  useDocTypeLabels,
} from "./context/CorpusAtom";
import { useAtom } from "jotai";
import {
  pdfAnnotationsAtom,
  structuralAnnotationsAtom,
  docTypeAnnotationsAtom,
} from "./context/AnnotationAtoms";
import { PDFPageInfo } from "./types/pdf";

// Loading pdf js libraries without cdn is a right PITA... cobbled together a working
// approach via these guides:
// https://stackoverflow.com/questions/63553008/looking-for-help-to-make-npm-pdfjs-dist-work-with-webpack-and-django
// https://github.com/mozilla/pdf.js/issues/12379
// https://github.com/mozilla/pdf.js/blob/f40bbe838e3c09b84e6f69df667a453c55de25f8/examples/webpack/main.js
const pdfjsLib = require("pdfjs-dist");

// Setting worker path to worker bundle.
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.js`;

/**
 * AnnotatorModal component responsible for rendering the annotation modal.
 * It uses atoms from CorpusAtom.tsx to manage global state.
 */
const AnnotatorModal = ({
  open,
  opened_document,
  opened_corpus,
  read_only,
  show_selected_annotation_only,
  show_annotation_bounding_boxes,
  show_annotation_labels,
  onClose,
}: {
  open: boolean;
  opened_document: DocumentType;
  opened_corpus: CorpusType;
  read_only: boolean;
  show_selected_annotation_only: boolean;
  show_annotation_bounding_boxes: boolean;
  show_annotation_labels: LabelDisplayBehavior;
  onClose: () => void;
}) => {
  const { setProgress, progress, zoomLevel } = useUISettings();

  // Using Jotai atoms for managing annotations
  const [pdfAnnotations, setPdfAnnotations] = useAtom(pdfAnnotationsAtom);
  const [structuralAnnotations, setStructuralAnnotations] = useAtom(
    structuralAnnotationsAtom
  );
  const [docTypeAnnotations, setDocTypeAnnotations] = useAtom(
    docTypeAnnotationsAtom
  );

  const show_structural_annotations = useReactiveVar(showStructuralAnnotations);
  const label_display_behavior = useReactiveVar(showAnnotationLabels);
  // Global state variables to jump to and/or load certain annotations on load
  const displayOnlyTheseAnnotations = useReactiveVar(
    onlyDisplayTheseAnnotations
  );
  const edit_mode = useReactiveVar(editMode);
  const selected_analysis = useReactiveVar(selectedAnalysis);

  const { pdfDoc, setPdfDoc } = usePdfDoc();
  const { pages, setPages } = usePages();
  const { pageTextMaps, setPageTextMaps } = usePageTextMaps();
  const { setDocumentType } = useDocumentType();
  const { setDocText } = useDocText();

  // Use atoms for labels from CorpusAtom
  const { spanLabels, setSpanLabels } = useSpanLabels();
  const { humanSpanLabels, setHumanSpanLabels } = useHumanSpanLabels();
  const { relationLabels, setRelationLabels } = useRelationLabels();
  const { docTypeLabels, setDocTypeLabels } = useDocTypeLabels();

  const [
    getDocumentAnnotationsAndRelationships,
    { data: humanAnnotationsAndRelationshipsData, loading: humanDataLoading },
  ] = useLazyQuery<
    GetDocumentAnnotationsAndRelationshipsOutput,
    GetDocumentAnnotationsAndRelationshipsInput
  >(GET_DOCUMENT_ANNOTATIONS_AND_RELATIONSHIPS);

  // Load annotations when in ANNOTATE mode and necessary conditions are met
  useEffect(() => {
    if (
      edit_mode === "ANNOTATE" &&
      opened_corpus?.labelSet &&
      opened_document &&
      !displayOnlyTheseAnnotations
    ) {
      getDocumentAnnotationsAndRelationships({
        variables: {
          documentId: opened_document.id,
          corpusId: opened_corpus.id,
          ...(selected_analysis
            ? { analysisId: selected_analysis.id }
            : { analysisId: "__none__" }),
        },
      });
    }
  }, [edit_mode, opened_corpus, opened_document, displayOnlyTheseAnnotations]);

  // Process annotations when data is loaded
  useEffect(() => {
    if (humanAnnotationsAndRelationshipsData) {
      processAnnotationsData(humanAnnotationsAndRelationshipsData);
    }
  }, [humanAnnotationsAndRelationshipsData]);

  // Store document type
  useEffect(() => {
    setDocumentType(opened_document.fileType ? opened_document.fileType : "");
  }, [opened_document]);

  // Handle opening of the annotator modal
  useEffect(() => {
    if (open && opened_document) {
      console.log(
        "React to DocumentAnnotator opening or document change",
        opened_document
      );

      viewStateVar(ViewState.LOADING);

      const loadAnnotations = () => {
        if (opened_corpus?.labelSet && !displayOnlyTheseAnnotations) {
          return getDocumentAnnotationsAndRelationships({
            variables: {
              documentId: opened_document.id,
              corpusId: opened_corpus.id,
              ...(selected_analysis
                ? { analysisId: selected_analysis.id }
                : { analysisId: "__none__" }),
            },
          });
        }
        return Promise.resolve(null);
      };

      if (
        opened_document.fileType === "application/pdf" &&
        opened_document.pdfFile
      ) {
        const loadingTask: PDFDocumentLoadingTask = pdfjsLib.getDocument(
          opened_document.pdfFile
        );
        loadingTask.onProgress = (p: { loaded: number; total: number }) => {
          setProgress(Math.round((p.loaded / p.total) * 100));
        };

        Promise.all([
          loadingTask.promise,
          getPawlsLayer(opened_document.pawlsParseFile || ""),
          loadAnnotations(),
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
            setPageTextMaps({
              ...string_index_token_map,
              ...pageTextMaps,
            });
            setDocText(doc_text);
            // Loaded state set by useEffect for state change in doc state store.
          })
          .catch((err) => {
            console.error("Error loading PDF document:", err);
            viewStateVar(ViewState.ERROR);
          });
      } else if (opened_document.fileType === "application/txt") {
        console.log("React to TXT document");

        Promise.all([
          getDocumentRawText(opened_document.txtExtractFile || ""),
          loadAnnotations(),
        ])
          .then(([txt]) => {
            setDocText(txt);
            viewStateVar(ViewState.LOADED);
          })
          .catch((err) => {
            console.error("Error loading TXT document:", err);
            viewStateVar(ViewState.ERROR);
          });
      }
    }
  }, [open, opened_document, opened_corpus, displayOnlyTheseAnnotations]);

  /**
   * Processes the annotations data and updates the annotation atoms.
   * @param data Data containing annotations and relationships.
   */
  const processAnnotationsData = (
    data: GetDocumentAnnotationsAndRelationshipsOutput
  ) => {
    console.log("Processing annotations data:", data);
    if (data?.document) {
      const processedAnnotations =
        data.document.allAnnotations?.map((annotation) =>
          convertToServerAnnotation(annotation)
        ) ?? [];

      // Update pdfAnnotations atom
      setPdfAnnotations(
        (prev) =>
          new PdfAnnotations(
            processedAnnotations,
            prev.relations,
            prev.docTypes,
            true
          )
      );

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
            rel.id
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
        const filteredSpanLabels = allLabels.filter(
          (label) => label.labelType === LabelType.SpanLabel
        );
        const filteredRelationLabels = allLabels.filter(
          (label) => label.labelType === LabelType.RelationshipLabel
        );
        const filteredDocTypeLabels = allLabels.filter(
          (label) => label.labelType === LabelType.DocTypeLabel
        );

        setSpanLabels(filteredSpanLabels);
        setHumanSpanLabels(filteredSpanLabels);
        setRelationLabels(filteredRelationLabels);
        setDocTypeLabels(filteredDocTypeLabels);
      }
    }
  };

  // Update view state when PDF document is loaded
  useEffect(() => {
    if (opened_document.fileType === "application/pdf") {
      if (pdfDoc && pageTextMaps && pages.length > 0) {
        console.log("React to PDF document loading properly", pdfDoc);
        viewStateVar(ViewState.LOADED);
      }
    }
  }, [pageTextMaps, pages, pdfDoc]);

  return (
    <Modal
      className="AnnotatorModal"
      closeIcon
      open={open}
      onClose={onClose}
      size="fullscreen"
    >
      <Modal.Content
        className="AnnotatorModalContent"
        style={{ padding: "0px", height: "90vh", overflow: "hidden" }}
      >
        <ViewSettingsPopup
          show_selected_annotation_only={show_selected_annotation_only}
          showSelectedAnnotationOnly={showSelectedAnnotationOnly}
          showStructuralLabels={
            show_structural_annotations ? show_structural_annotations : false
          }
          toggleShowStructuralLabels={() =>
            showStructuralAnnotations(!show_structural_annotations)
          }
          show_annotation_bounding_boxes={show_annotation_bounding_boxes}
          showAnnotationBoundingBoxes={showAnnotationBoundingBoxes}
          label_display_behavior={label_display_behavior}
          showAnnotationLabels={showAnnotationLabels}
          label_display_options={label_display_options}
        />
        <CorpusProvider
          selectedCorpus={opened_corpus}
          spanLabels={spanLabels}
          humanSpanLabels={humanSpanLabels}
          relationLabels={relationLabels}
          docTypeLabels={docTypeLabels}
          isLoading={humanDataLoading}
        >
          <DocumentAnnotator
            open={open}
            opened_document={opened_document}
            opened_corpus={opened_corpus}
            read_only={read_only}
            show_selected_annotation_only={show_selected_annotation_only}
            show_annotation_bounding_boxes={show_annotation_bounding_boxes}
            show_annotation_labels={show_annotation_labels}
            onClose={onClose}
          />
        </CorpusProvider>
      </Modal.Content>
    </Modal>
  );
};

export default AnnotatorModal;
