import React, {
  useRef,
  useState,
  useEffect,
  useMemo,
  useLayoutEffect,
  useCallback,
} from "react";
import { useAtom } from "jotai";
import { AnnotationLabelType } from "../../../../types/graphql-api";
import {
  getPageBoundsFromCanvas,
  normalizeBounds,
} from "../../../../utils/transform";
import {
  PageProps,
  BoundingBox,
  PermissionTypes,
  TextSearchTokenResult,
  SinglePageAnnotationJson,
} from "../../../types";
import { PDFPageRenderer, PageAnnotationsContainer, PageCanvas } from "./PDF";
import { Selection } from "../../display/components/Selection";
import { SearchResult } from "../../display/components/SearchResult";
import { SelectionBoundary } from "../../display/components/SelectionBoundary";
import { SelectionTokenGroup } from "../../display/components/SelectionTokenGroup";
import { ServerTokenAnnotation } from "../../types/annotations";
import { useAnnotationSearch } from "../../hooks/useAnnotationSearch";
import {
  useCreateAnnotation,
  usePdfAnnotations,
} from "../../hooks/AnnotationHooks";
import {
  scrollContainerRefAtom,
  pdfPageInfoObjsAtom,
  useSelectedDocument,
  useSelectedCorpus,
  usePageSelectionQueue,
} from "../../context/DocumentAtom";
import {
  useAnnotationControls,
  useAnnotationDisplay,
  useZoomLevel,
  useAnnotationSelection,
} from "../../context/UISettingsAtom";
import { useAnnotationRefs } from "../../hooks/useAnnotationRefs";

/**
 * PDFPage Component
 *
 * Renders a single PDF page with annotations, selections, and search results.
 *
 * @param {PageProps} props - Properties for the PDF page.
 * @returns {JSX.Element} The rendered PDF page component.
 */
export const PDFPage = ({
  pageInfo,
  corpus_permissions,
  read_only,
  show_selected_annotation_only,
  show_annotation_bounding_boxes,
  show_annotation_labels,
  onError,
  setJumpedToAnnotationOnLoad,
}: PageProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PDFPageRenderer | null>(null);
  const { selectedDocument } = useSelectedDocument();
  const textSearch = useAnnotationSearch();
  const { pdfAnnotations } = usePdfAnnotations();
  const createAnnotation = useCreateAnnotation();

  const [scale, setScale] = useState<number>(1);
  const [canvas_width, setCanvasWidth] = useState<number>();
  const [hasPdfPageRendered, setPdfPageRendered] = useState(false);
  const [localPageSelection, setLocalPageSelection] = useState<
    | {
        pageNumber: number;
        bounds: BoundingBox;
      }
    | undefined
  >();
  const [multiSelections, setMultiSelections] = useState<{
    [key: number]: BoundingBox[];
  }>({});

  const { showStructural } = useAnnotationDisplay();
  const { zoomLevel } = useZoomLevel();
  const { selectedAnnotations } = useAnnotationSelection();

  const containerRef = useRef<HTMLDivElement>(null);
  const annotations = pdfAnnotations.annotations;

  const [scrollContainerRef] = useAtom(scrollContainerRefAtom);
  const [pdfPageInfoObjs, setPdfPageInfoObjs] = useAtom(pdfPageInfoObjsAtom);

  const { selectedSearchResultIndex, searchResults } = textSearch;
  const { selectedCorpus } = useSelectedCorpus();

  const annotationControls = useAnnotationControls();

  const { spanLabelsToView, activeSpanLabel } = annotationControls;

  const { pageSelectionQueue } = usePageSelectionQueue();

  const annotationRefs = useAnnotationRefs();

  // Handle multi-page annotation creation
  const handleCreateMultiPageAnnotation = useCallback(async () => {
    if (
      !activeSpanLabel ||
      !multiSelections ||
      Object.keys(multiSelections).length === 0
    ) {
      return;
    }

    // Create annotation from multi-selections
    const pages = Object.keys(multiSelections).map(Number);

    // Convert bounds to proper SinglePageAnnotationJson format
    const annotations: Record<number, SinglePageAnnotationJson> = {};
    let combinedRawText = "";

    for (const pageNum of pages) {
      const pageAnnotation = pageInfo.getPageAnnotationJson(
        multiSelections[pageNum]
      );
      if (pageAnnotation) {
        annotations[pageNum] = pageAnnotation;
        combinedRawText += " " + pageAnnotation.rawText;
      }
    }

    // Create annotation object
    const annotation = new ServerTokenAnnotation(
      pages[0], // First page as the anchor
      activeSpanLabel,
      combinedRawText.trim(),
      false,
      annotations,
      [],
      false,
      false,
      false
    );

    await createAnnotation(annotation);
    setMultiSelections({});
  }, [activeSpanLabel, multiSelections, createAnnotation, pageInfo]);

  /**
   * Converts bounding box selections to JSX elements.
   */
  const ConvertBoundsToSelections = useMemo(
    () =>
      (
        selection: BoundingBox,
        activeLabel: AnnotationLabelType
      ): JSX.Element => {
        const annotation = pageInfo.getAnnotationForBounds(
          normalizeBounds(selection),
          activeLabel
        );

        const tokens =
          annotation && annotation.tokens ? annotation.tokens : null;

        return (
          <>
            <SelectionBoundary
              showBoundingBox
              hidden={false}
              color={activeSpanLabel?.color ? activeSpanLabel.color : ""}
              bounds={selection}
              selected={false}
            />
            <SelectionTokenGroup pageInfo={pageInfo} tokens={tokens} />
          </>
        );
      },
    [pageInfo, activeSpanLabel]
  );

  /**
   * Handles resizing of the PDF page canvas.
   */
  useEffect(() => {
    const handleResize = () => {
      console.log("\t\tHandle Resize!");

      if (canvasRef.current === null) {
        onError(new Error("No canvas element!"));
        return;
      }

      if (rendererRef.current === null) {
        onError(new Error("Page renderer hasn't loaded!"));
        return;
      }

      pageInfo.bounds = getPageBoundsFromCanvas(canvasRef.current);

      rendererRef.current.rescaleAndRender(zoomLevel);
      setScale(zoomLevel);
    };

    if (!hasPdfPageRendered && canvasRef.current && containerRef.current) {
      console.log("Try to initialize page", pageInfo);
      const initializePage = async () => {
        try {
          if (containerRef.current && canvasRef.current) {
            console.log("\tSetup the renderer...");
            canvasRef.current.width = 800;
            pageInfo.bounds = getPageBoundsFromCanvas(canvasRef.current);
            rendererRef.current = new PDFPageRenderer(
              pageInfo.page,
              canvasRef.current,
              onError
            );

            console.log("\tAwait render...");
            await rendererRef.current.render(zoomLevel);

            if (!(pageInfo.page.pageNumber - 1 in pdfPageInfoObjs)) {
              console.log(`\tAdding pageInfo to ${pageInfo.page.pageNumber}`);
              setPdfPageInfoObjs({
                ...pdfPageInfoObjs,
                [pageInfo.page.pageNumber - 1]: pageInfo,
              });
            }

            if (scrollContainerRef && scrollContainerRef.current) {
              console.log(
                `\tAdding resize handler to page ${pageInfo.page.pageNumber}`
              );
              scrollContainerRef.current.addEventListener(
                "resize",
                handleResize
              );
            }

            annotationRefs.registerRef(
              "page",
              pageInfo.page.pageNumber - 1,
              canvasRef
            );

            setPdfPageRendered(true);
          }
        } catch (error) {
          onError(error instanceof Error ? error : new Error(String(error)));
        }
      };
      initializePage();

      return () => {
        annotationRefs.unregisterRef("page", pageInfo.page.pageNumber - 1);
        if (scrollContainerRef && scrollContainerRef.current) {
          scrollContainerRef.current.removeEventListener(
            "resize",
            handleResize
          );
        }
      };
    } else if (
      hasPdfPageRendered &&
      canvasRef.current &&
      containerRef.current
    ) {
      console.log("Page has rendered and Zoom level changed");

      if (canvasRef.current === null) {
        onError(new Error("No canvas element!"));
        return;
      }

      if (rendererRef.current === null) {
        onError(new Error("Page renderer hasn't loaded!"));
        return;
      }

      pageInfo.bounds = getPageBoundsFromCanvas(canvasRef.current);

      rendererRef.current.rescaleAndRender(zoomLevel);
      setScale(zoomLevel);
    }
  }, [
    pageInfo,
    onError,
    hasPdfPageRendered,
    zoomLevel,
    scrollContainerRef,
    pdfPageInfoObjs,
    setPdfPageInfoObjs,
    annotationRefs,
  ]);

  useEffect(() => {
    pageInfo.scale = zoomLevel;
  }, [zoomLevel, pageInfo]);

  /**
   * Scrolls to the selected annotation when there is exactly one selected.
   */
  useLayoutEffect(() => {
    if (selectedAnnotations.length === 1) {
      const selectedId = selectedAnnotations[0];
      annotationRefs.selectionElementRefs.current[selectedId]?.scrollIntoView();
    }
  }, [selectedAnnotations, annotationRefs.selectionElementRefs]);

  useEffect(() => {
    if (hasPdfPageRendered && selectedAnnotations.length === 1) {
      annotationRefs.selectionElementRefs.current[
        selectedAnnotations[0]
      ]?.scrollIntoView();
    }
  }, [
    hasPdfPageRendered,
    selectedAnnotations,
    annotationRefs.selectionElementRefs,
  ]);

  const pageQueuedSelections = pageSelectionQueue[pageInfo.page.pageNumber - 1]
    ? pageSelectionQueue[pageInfo.page.pageNumber - 1]
    : [];

  console.log("Page show structural", showStructural, pageInfo);

  const annots_to_render = useMemo(() => {
    const defined_annotations = annotations
      .filter((annot) => annot instanceof ServerTokenAnnotation)
      .filter(
        (a) =>
          (a as ServerTokenAnnotation).json[pageInfo.page.pageNumber - 1] !==
          undefined
      );

    const filtered_by_structural = !showStructural
      ? defined_annotations.filter((annot) => !annot.structural)
      : defined_annotations;

    // Apply showOnlySpanLabels filter
    return spanLabelsToView && spanLabelsToView.length > 0
      ? filtered_by_structural.filter((annot) =>
          spanLabelsToView!.some(
            (label) => label.id === annot.annotationLabel.id
          )
        )
      : filtered_by_structural;
  }, [annotations, pageInfo.page.pageNumber, showStructural, spanLabelsToView]);

  const page_annotation_components = useMemo(() => {
    if (!hasPdfPageRendered || !scale || !pageInfo.bounds || !annotations)
      return [];

    return annots_to_render.map((annotation) => (
      <Selection
        key={annotation.id}
        hidden={
          show_selected_annotation_only &&
          !selectedAnnotations.includes(annotation.id)
        }
        showBoundingBox={show_annotation_bounding_boxes}
        scrollIntoView={selectedAnnotations.includes(annotation.id)}
        labelBehavior={show_annotation_labels}
        selectionRef={annotationRefs.selectionElementRefs}
        pageInfo={pageInfo}
        annotation={annotation}
        setJumpedToAnnotationOnLoad={setJumpedToAnnotationOnLoad}
        approved={annotation.approved}
        rejected={annotation.rejected}
        allowFeedback={selectedCorpus?.allowComments}
      />
    ));
  }, [
    scale,
    pageInfo.bounds,
    annotations,
    annots_to_render,
    show_selected_annotation_only,
    show_annotation_bounding_boxes,
    show_annotation_labels,
    selectedAnnotations,
  ]);

  return (
    <PageAnnotationsContainer
      className="PageAnnotationsContainer"
      ref={containerRef}
      onMouseDown={(event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        if (containerRef.current === null) {
          throw new Error("No Container");
        }
        if (
          !read_only &&
          corpus_permissions.includes(PermissionTypes.CAN_UPDATE)
        ) {
          if (!localPageSelection && event.buttons === 1) {
            const { left: containerAbsLeftOffset, top: containerAbsTopOffset } =
              containerRef.current.getBoundingClientRect();
            const left = event.pageX - containerAbsLeftOffset;
            const top = event.pageY - containerAbsTopOffset;
            setLocalPageSelection({
              pageNumber: pageInfo.page.pageNumber - 1,
              bounds: {
                left,
                top,
                right: left,
                bottom: top,
              },
            });
          }
        }
      }}
      onMouseMove={
        localPageSelection
          ? (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
              if (containerRef.current === null) {
                throw new Error("No Container");
              }
              const {
                left: containerAbsLeftOffset,
                top: containerAbsTopOffset,
              } = containerRef.current.getBoundingClientRect();
              if (
                localPageSelection &&
                localPageSelection.pageNumber === pageInfo.page.pageNumber - 1
              ) {
                setLocalPageSelection({
                  pageNumber: pageInfo.page.pageNumber - 1,
                  bounds: {
                    ...localPageSelection.bounds,
                    right: event.pageX - containerAbsLeftOffset,
                    bottom: event.pageY - containerAbsTopOffset,
                  },
                });
              }
            }
          : undefined
      }
      onMouseUp={(event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        if (localPageSelection) {
          const pageNum = pageInfo.page.pageNumber - 1;
          setMultiSelections((prev) => ({
            ...prev,
            [pageNum]: [...(prev[pageNum] || []), localPageSelection.bounds],
          }));

          setLocalPageSelection(undefined);

          if (!event.shiftKey) {
            handleCreateMultiPageAnnotation();
          }
        }
      }}
    >
      <PageCanvas
        ref={canvasRef}
        {...(canvas_width ? { width: canvas_width } : {})}
      />

      {page_annotation_components}

      {scale &&
        pageInfo.bounds &&
        searchResults
          .filter((match): match is TextSearchTokenResult => "tokens" in match)
          .filter(
            (match) => match.tokens[pageInfo.page.pageNumber - 1] !== undefined
          )
          .map((match, token_index) => (
            <SearchResult
              key={token_index}
              total_results={searchResults.length}
              selectionRef={annotationRefs.searchResultElementRefs}
              showBoundingBox={true}
              hidden={
                show_selected_annotation_only &&
                token_index !== selectedSearchResultIndex
              }
              pageInfo={pageInfo}
              match={match}
              labelBehavior={show_annotation_labels}
            />
          ))}
      {localPageSelection?.pageNumber === pageInfo.page.pageNumber - 1 &&
      activeSpanLabel
        ? ConvertBoundsToSelections(
            localPageSelection.bounds,
            activeSpanLabel as AnnotationLabelType
          )
        : null}
      {pageQueuedSelections.length > 0 && activeSpanLabel
        ? pageQueuedSelections.map((selection) =>
            ConvertBoundsToSelections(
              selection,
              activeSpanLabel as AnnotationLabelType
            )
          )
        : null}
    </PageAnnotationsContainer>
  );
};
