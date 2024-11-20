import { CorpusProvider } from "./context/CorpusContext";
import { ViewSettingsPopup } from "../widgets/popups/ViewSettingsPopup";
import { DocumentAnnotator } from "./DocumentAnnotator";
import { Modal } from "semantic-ui-react";
import {
  editMode,
  onlyDisplayTheseAnnotations,
  selectedAnalysis,
  selectedExtract,
  showAnnotationBoundingBoxes,
  showAnnotationLabels,
  showSelectedAnnotationOnly,
  showStructuralAnnotations,
  viewStateVar,
} from "../../graphql/cache";
import {
  PageTokens,
  Token,
  TokenId,
  ViewState,
  label_display_options,
} from "../types";
import {
  AnnotationLabelType,
  CorpusType,
  DocumentType,
  LabelDisplayBehavior,
  LabelType,
} from "../../types/graphql-api";
import { QueryResult, useLazyQuery, useReactiveVar } from "@apollo/client";
import { useEffect, useState } from "react";
import { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { PDFPageInfo } from "./context/PDFStore";
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
import { useAnnotationManager } from "./hooks/useAnnotationManager";
import { DocumentContextWrapper } from "./context/DocumentContextWrapper";
import { UISettingsContextWrapper } from "./context/UISettingsContextWrapper";
import { PdfAnnotations, RelationGroup } from "./types/annotations";
import { DocumentProvider } from "./context/DocumentContext";

// Loading pdf js libraries without cdn is a right PITA... cobbled together a working
// approach via these guides:
// https://stackoverflow.com/questions/63553008/looking-for-help-to-make-npm-pdfjs-dist-work-with-webpack-and-django
// https://github.com/mozilla/pdf.js/issues/12379
// https://github.com/mozilla/pdf.js/blob/f40bbe838e3c09b84e6f69df667a453c55de25f8/examples/webpack/main.js
const pdfjsLib = require("pdfjs-dist");

// Setting worker path to worker bundle.
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.js`;
// "../../build/webpack/pdf.worker.min.js';";

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
  const annotationManager = useAnnotationManager();

  const show_structural_annotations = useReactiveVar(showStructuralAnnotations);
  const label_display_behavior = useReactiveVar(showAnnotationLabels);
  // Global state variables to jump to and/or load certain annotations on load
  const displayOnlyTheseAnnotations = useReactiveVar(
    onlyDisplayTheseAnnotations
  );
  const edit_mode = useReactiveVar(editMode);
  const selected_analysis = useReactiveVar(selectedAnalysis);
  const selected_extract = useReactiveVar(selectedExtract);

  const [doc, setDocument] = useState<PDFDocumentProxy>();
  const [documentType, setDocumentType] = useState<string>("");
  const [pages, setPages] = useState<PDFPageInfo[]>([]);
  const [pageTextMaps, setPageTextMaps] = useState<Record<number, TokenId>>();
  const [rawText, setRawText] = useState<string>("");

  const [spanLabels, setSpanLabels] = useState<AnnotationLabelType[]>([]);
  const [humanSpanLabels, setHumanSpanLabels] = useState<AnnotationLabelType[]>(
    []
  );
  const [relationLabels, setRelationLabels] = useState<AnnotationLabelType[]>(
    []
  );
  const [docTypeLabels, setDocTypeLabels] = useState<AnnotationLabelType[]>([]);

  const [
    getDocumentAnnotationsAndRelationships,
    { data: humanAnnotationsAndRelationshipsData, loading: humanDataLoading },
  ] = useLazyQuery<
    GetDocumentAnnotationsAndRelationshipsOutput,
    GetDocumentAnnotationsAndRelationshipsInput
  >(GET_DOCUMENT_ANNOTATIONS_AND_RELATIONSHIPS);

  // Calculated control and display variables - in certain situations we want to change behavior based on available data or
  // selected configurations.
  // Depending on the edit mode and some state variables, we may want to load all annotations for the document
  // Particularly of node is when displayOnlyTheseAnnotations is set to something, we don't want to load additional
  // annotations. We are just rendering and displaying the annotations stored in this state variable.
  // TODO - load annotations on a page-by-page basis to cut down on server load.
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
  }, [editMode, opened_corpus, opened_document, displayOnlyTheseAnnotations]);

  // When corpus annotation data is loaded (not analysis or extract data is loaded... react to it)
  useEffect(() => {
    if (humanAnnotationsAndRelationshipsData) {
      // Process annotations
      const processedAnnotations =
        humanAnnotationsAndRelationshipsData.document?.allAnnotations?.map(
          (annotation) => convertToServerAnnotation(annotation)
        ) ?? [];

      // Update both local state and annotation manager
      annotationManager.setPdfAnnotations(
        (prev) =>
          new PdfAnnotations(
            processedAnnotations,
            prev.relations,
            prev.docTypes,
            true
          )
      );

      // Process relationships
      const processedRelationships =
        humanAnnotationsAndRelationshipsData.document?.allRelationships?.map(
          (relationship) =>
            new RelationGroup(
              relationship.sourceAnnotations?.edges
                ?.map((edge) => edge?.node?.id)
                .filter((id): id is string => id != null) ?? [],
              relationship.targetAnnotations?.edges
                ?.map((edge) => edge?.node?.id)
                .filter((id): id is string => id != null) ?? [],
              relationship.relationshipLabel,
              relationship.id
            )
        ) ?? [];

      // Update annotation manager with relationships
      annotationManager.setPdfAnnotations(
        (prev) =>
          new PdfAnnotations(
            prev.annotations,
            processedRelationships,
            prev.docTypes,
            true
          )
      );
    }
  }, [humanAnnotationsAndRelationshipsData]);

  // store doc type in state
  useEffect(() => {
    setDocumentType(opened_document.fileType ? opened_document.fileType : "");
  }, [opened_document]);

  // Using new useAnalysisManager hook
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
          .then(
            ([pdfDoc, pawlsData, annotationsData]: [
              PDFDocumentProxy,
              PageTokens[],
              QueryResult<
                GetDocumentAnnotationsAndRelationshipsOutput,
                GetDocumentAnnotationsAndRelationshipsInput
              > | null
            ]) => {
              console.log("Retrieved annotations data:", annotationsData);

              setDocument(pdfDoc);
              processAnnotationsData(annotationsData);

              const loadPages: Promise<PDFPageInfo>[] = [];
              for (let i = 1; i <= pdfDoc.numPages; i++) {
                loadPages.push(
                  pdfDoc.getPage(i).then((p) => {
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
            }
          )
          .then((pages) => {
            setPages(pages);
            let { doc_text, string_index_token_map } =
              createTokenStringSearch(pages);
            setPageTextMaps({
              ...string_index_token_map,
              ...pageTextMaps,
            });
            setRawText(doc_text);
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
          .then(
            ([txt, annotationsData]: [
              string,
              QueryResult<
                GetDocumentAnnotationsAndRelationshipsOutput,
                GetDocumentAnnotationsAndRelationshipsInput
              > | null
            ]) => {
              console.log("Retrieved annotations data:", annotationsData);

              setRawText(txt);
              processAnnotationsData(annotationsData);
              viewStateVar(ViewState.LOADED);
            }
          )
          .catch((err) => {
            console.error("Error loading TXT document:", err);
            viewStateVar(ViewState.ERROR);
          });
      }
    }
  }, [open, opened_document, opened_corpus, displayOnlyTheseAnnotations]);

  const processAnnotationsData = (
    data: QueryResult<
      GetDocumentAnnotationsAndRelationshipsOutput,
      GetDocumentAnnotationsAndRelationshipsInput
    > | null
  ) => {
    console.log("Processing annotations data:", data);
    if (data?.data?.document) {
      const processedAnnotations =
        data.data.document.allAnnotations?.map((annotation) =>
          convertToServerAnnotation(annotation)
        ) ?? [];

      // Update both the local state and annotation manager

      // Update annotation manager's state
      annotationManager.setPdfAnnotations(
        (prev) =>
          new PdfAnnotations(
            processedAnnotations,
            prev.relations,
            prev.docTypes,
            true
          )
      );

      // Process structural annotations
      if (data.data.document?.allStructuralAnnotations) {
        const structuralAnns = data.data.document.allStructuralAnnotations.map(
          (ann) => convertToServerAnnotation(ann)
        );
        annotationManager.setStructuralAnnotations(structuralAnns);
      }

      // Process relationships
      const processedRelationships = data.data.document.allRelationships?.map(
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

      annotationManager.setPdfAnnotations(
        (prev) =>
          new PdfAnnotations(
            prev.annotations,
            processedRelationships || [],
            prev.docTypes,
            true
          )
      );

      // Update labels in both contexts
      if (data.data.corpus?.labelSet) {
        const allLabels = data.data.corpus.labelSet.allAnnotationLabels ?? [];
        const spanLabels = allLabels.filter(
          (label) => label.labelType === LabelType.SpanLabel
        );
        const relationLabels = allLabels.filter(
          (label) => label.labelType === LabelType.RelationshipLabel
        );
        const docTypeLabels = allLabels.filter(
          (label) => label.labelType === LabelType.DocTypeLabel
        );

        setSpanLabels(spanLabels);
        setHumanSpanLabels(spanLabels);
        setRelationLabels(relationLabels);
        setDocTypeLabels(docTypeLabels);
      }
    }
  };

  // Only trigger state flip to "Loaded" if PDF, pageTextMaps and page info load properly
  useEffect(() => {
    if (opened_document.fileType === "application/pdf") {
      if (doc && pageTextMaps && pages.length > 0) {
        console.log("React to PDF document loading properly", doc);
        viewStateVar(ViewState.LOADED);
      }
    }
  }, [pageTextMaps, pages, doc]);

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
        <UISettingsContextWrapper>
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
            <DocumentProvider
              selectedDocument={opened_document}
              selectedCorpus={opened_corpus}
              docText={rawText}
              pageTextMaps={pageTextMaps}
              isLoading={humanDataLoading}
              viewState={viewStateVar()}
              pdfDoc={doc}
              pages={pages}
              documentType={documentType}
            >
              <DocumentContextWrapper
                openedDocument={opened_document}
                openedCorpus={opened_corpus}
              >
                <DocumentAnnotator
                  open={open}
                  opened_document={opened_document}
                  opened_corpus={opened_corpus}
                  read_only={read_only}
                  show_selected_annotation_only={show_selected_annotation_only}
                  show_annotation_bounding_boxes={
                    show_annotation_bounding_boxes
                  }
                  show_annotation_labels={show_annotation_labels}
                  onClose={onClose}
                />
              </DocumentContextWrapper>
            </DocumentProvider>
          </CorpusProvider>
        </UISettingsContextWrapper>
      </Modal.Content>
    </Modal>
  );
};

export default AnnotatorModal;
