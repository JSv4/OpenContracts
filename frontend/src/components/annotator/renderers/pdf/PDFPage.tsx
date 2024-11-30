import { useRef, useState, useEffect, useMemo, useLayoutEffect } from "react";
import { useAtom } from "jotai";
import { AnnotationLabelType } from "../../../../types/graphql-api";
import {
  getPageBoundsFromCanvas,
  normalizeBounds,
} from "../../../../utils/transform";
import { PageProps, BoundingBox, TextSearchTokenResult } from "../../../types";
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
  useSelectedCorpus,
} from "../../context/DocumentAtom";
import {
  useAnnotationControls,
  useAnnotationDisplay,
  useZoomLevel,
  useAnnotationSelection,
} from "../../context/UISettingsAtom";
import { useAnnotationRefs } from "../../hooks/useAnnotationRefs";
import SelectionLayer from "./SelectionLayer";

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
  onError,
  setJumpedToAnnotationOnLoad,
}: PageProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PDFPageRenderer | null>(null);
  const textSearch = useAnnotationSearch();
  const { pdfAnnotations } = usePdfAnnotations();
  const createAnnotation = useCreateAnnotation();

  const [scale, setScale] = useState<number>(1);
  const [canvas_width, setCanvasWidth] = useState<number>();
  const [hasPdfPageRendered, setPdfPageRendered] = useState(false);

  const { showStructural } = useAnnotationDisplay();
  const { zoomLevel } = useZoomLevel();
  const { selectedAnnotations } = useAnnotationSelection();

  const {
    PDFPageContainerRefs,
    annotationElementRefs,
    registerRef,
    unregisterRef,
  } = useAnnotationRefs();
  const pageContainerRef = useRef<HTMLDivElement>(null);

  const annotations = pdfAnnotations.annotations;

  const [scrollContainerRef] = useAtom(scrollContainerRefAtom);
  const [pdfPageInfoObjs, setPdfPageInfoObjs] = useAtom(pdfPageInfoObjsAtom);

  const { selectedSearchResultIndex, searchResults } = textSearch;
  const { selectedCorpus } = useSelectedCorpus();

  const annotationControls = useAnnotationControls();
  const { spanLabelsToView, activeSpanLabel } = annotationControls;

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

    if (!hasPdfPageRendered && canvasRef.current && pageContainerRef.current) {
      console.log("Try to initialize page", pageInfo);
      const initializePage = async () => {
        try {
          if (pageContainerRef.current && canvasRef.current) {
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

            registerRef("page", canvasRef, pageInfo.page.pageNumber - 1);

            setPdfPageRendered(true);
          }
        } catch (error) {
          onError(error instanceof Error ? error : new Error(String(error)));
        }
      };
      initializePage();

      return () => {
        unregisterRef("page", pageInfo.page.pageNumber - 1);
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
      pageContainerRef.current
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
    registerRef,
    unregisterRef,
  ]);

  useEffect(() => {
    pageInfo.scale = zoomLevel;
  }, [zoomLevel, pageInfo]);

  // Register and unregister the page container ref
  useEffect(() => {
    registerRef("pdfPageContainer", pageContainerRef, pageInfo.page.pageNumber);
    return () => {
      unregisterRef("pdfPageContainer", pageInfo.page.pageNumber);
    };
  }, [registerRef, unregisterRef, pageInfo.page.pageNumber]);

  /**
   * Scrolls to the selected annotation when there is exactly one selected.
   */
  useLayoutEffect(() => {
    if (selectedAnnotations.length === 1) {
      const selectedId = selectedAnnotations[0];
      annotationElementRefs.current[selectedId]?.scrollIntoView();
    }
  }, [selectedAnnotations, annotationElementRefs]);

  useEffect(() => {
    if (hasPdfPageRendered && selectedAnnotations.length === 1) {
      annotationElementRefs.current[selectedAnnotations[0]]?.scrollIntoView();
    }
  }, [hasPdfPageRendered, selectedAnnotations, annotationElementRefs]);

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
        selected={selectedAnnotations.includes(annotation.id)}
        scrollIntoView={selectedAnnotations.includes(annotation.id)}
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
    selectedAnnotations,
  ]);

  return (
    <PageAnnotationsContainer
      className="PageAnnotationsContainer"
      ref={pageContainerRef}
      style={{ position: "relative" }}
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
              showBoundingBox={true}
              hidden={token_index !== selectedSearchResultIndex}
              pageInfo={pageInfo}
              match={match}
            />
          ))}
      <SelectionLayer
        pageInfo={pageInfo}
        corpus_permissions={corpus_permissions}
        read_only={read_only}
        activeSpanLabel={activeSpanLabel ?? null}
        createAnnotation={createAnnotation}
        pageNumber={pageInfo.page.pageNumber - 1}
      />
    </PageAnnotationsContainer>
  );
};
