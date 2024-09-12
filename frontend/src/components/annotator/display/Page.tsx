import React, {
  useRef,
  useState,
  useContext,
  useEffect,
  useMemo,
  useLayoutEffect,
} from "react";
import { AnnotationLabelType } from "../../../graphql/types";
import { getPageBoundsFromCanvas } from "../../../utils/transform";
import { PageProps, BoundingBox, PermissionTypes } from "../../types";
import { AnnotationStore, normalizeBounds, PDFStore } from "../context";
import { PDFPageRenderer, PageAnnotationsContainer, PageCanvas } from "./PDF";
import { Selection, SelectionTokens } from "./Selection";
import { SearchResult } from "./SearchResult";
import { SelectionBoundary } from "./SelectionBoundary";

export const Page = ({
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

  const [scale, setScale] = useState<number>(1);
  const [canvas_width, setCanvasWidth] = useState<number>();
  const [hasPdfPageRendered, setPdfPageRendered] = useState(false);

  const annotationStore = useContext(AnnotationStore);
  const pdfStore = useContext(PDFStore);

  const containerRef = useRef<HTMLDivElement>(null);

  const annotations = annotationStore.pdfAnnotations.annotations;
  // console.log(`${annotations.length} annotations in store`);

  const {
    scrollContainerRef,
    selectedTextSearchMatchIndex,
    selectionElementRefs: selectionRefs,
    searchResultElementRefs,
  } = annotationStore;

  // console.log(`Multipage annotations for page #${pageInfo.page.pageNumber - 1}:`, annotations)
  // Given selected bounds (top, bottom, left, right), determine which tokens fall inside bounds
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
          annotation &&
          annotation.tokens &&
          !annotationStore.freeFormAnnotations
            ? annotation.tokens
            : null;

        return (
          <>
            <SelectionBoundary
              showBoundingBox
              hidden={false}
              color={
                annotationStore?.activeSpanLabel?.color
                  ? annotationStore.activeSpanLabel.color
                  : ""
              }
              bounds={selection}
              selected={false}
            />
            <SelectionTokens pageInfo={pageInfo} tokens={tokens} />
          </>
        );
      },
    [pageInfo, annotationStore]
  );

  // Only run this effect once per page
  useEffect(() => {
    console.log("Reacting to ", pdfStore.zoomLevel);

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

      rendererRef.current.rescaleAndRender(pdfStore.zoomLevel);
      setScale(pdfStore.zoomLevel);
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
            await rendererRef.current.render(pdfStore.zoomLevel);

            if (
              !(pageInfo.page.pageNumber - 1 in annotationStore.pdfPageInfoObjs)
            ) {
              console.log(`\tAdding pageInfo to ${pageInfo.page.pageNumber}`);
              annotationStore.pdfPageInfoObjs[pageInfo.page.pageNumber - 1] =
                pageInfo;
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

            annotationStore.insertPageRef(
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
        if (scrollContainerRef && scrollContainerRef.current !== null) {
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

      rendererRef.current.rescaleAndRender(pdfStore.zoomLevel);
      setScale(pdfStore.zoomLevel);
    }
  }, [pageInfo, onError, hasPdfPageRendered, pdfStore.zoomLevel]);

  useEffect(() => {
    pageInfo.scale = pdfStore.zoomLevel;
  }, [pdfStore.zoomLevel]);

  // Jump to selected annotation
  useLayoutEffect(() => {
    if (annotationStore.selectedAnnotations.length === 1) {
      console.log(
        "Selected",
        annotationStore.selectionElementRefs?.current[
          annotationStore.selectedAnnotations[0]
        ]
      );
      annotationStore.selectionElementRefs?.current[
        annotationStore.selectedAnnotations[0]
      ]?.scrollIntoView();
    }
  }, [annotationStore.selectedAnnotations]);

  useEffect(() => {
    if (hasPdfPageRendered) {
      if (annotationStore.selectedAnnotations.length === 1) {
        console.log(
          "Selected",
          annotationStore.selectionElementRefs?.current[
            annotationStore.selectedAnnotations[0]
          ]
        );
        annotationStore.selectionElementRefs?.current[
          annotationStore.selectedAnnotations[0]
        ]?.scrollIntoView();
      }
    }
  }, [hasPdfPageRendered, annotationStore.selectedAnnotations]);

  const pageQueuedSelections = annotationStore.pageSelectionQueue[
    pageInfo.page.pageNumber - 1
  ]
    ? annotationStore.pageSelectionQueue[pageInfo.page.pageNumber - 1]
    : [];

  ////////////////

  console.log(
    "Page show structural",
    annotationStore.showStructuralLabels,
    pageInfo
  );

  const annots_to_render = useMemo(() => {
    const defined_annotations = annotations.filter(
      (a) => a.json[pageInfo.page.pageNumber - 1] !== undefined
    );

    const filtered_by_structural = !annotationStore.showStructuralLabels
      ? defined_annotations.filter((annot) => !annot.structural)
      : defined_annotations;

    // Apply showOnlySpanLabels filter
    return annotationStore.showOnlySpanLabels &&
      annotationStore.showOnlySpanLabels.length > 0
      ? filtered_by_structural.filter((annot) =>
          annotationStore.showOnlySpanLabels!.some(
            (label) => label.id === annot.annotationLabel.id
          )
        )
      : filtered_by_structural;
  }, [
    annotations,
    pageInfo.page.pageNumber,
    annotationStore.showStructuralLabels,
    annotationStore.showOnlySpanLabels,
  ]);

  const page_annotation_components = useMemo(() => {
    if (!hasPdfPageRendered || !scale || !pageInfo.bounds || !annotations)
      return [];

    return annots_to_render.map((annotation) => (
      <Selection
        key={annotation.id}
        hidden={
          show_selected_annotation_only &&
          !annotationStore.selectedAnnotations.includes(annotation.id)
        }
        showBoundingBox={show_annotation_bounding_boxes}
        scrollIntoView={annotationStore.selectedAnnotations.includes(
          annotation.id
        )}
        labelBehavior={show_annotation_labels}
        selectionRef={selectionRefs}
        pageInfo={pageInfo}
        annotation={annotation}
        setJumpedToAnnotationOnLoad={setJumpedToAnnotationOnLoad}
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
    annotationStore.selectedAnnotations,
  ]);

  return (
    <PageAnnotationsContainer
      className="PageAnnotationsContainer"
      ref={containerRef}
      onMouseDown={(event) => {
        //console.log("Shift click?", event.shiftKey);
        if (containerRef.current === null) {
          throw new Error("No Container");
        }
        // Only allow selections if corpus permissions include update.
        // If there is no selection in the state store... the MouseUp
        // and MouseMove listeners won't trigger either, so all we need
        // is to stop the selection from being created in the state store.
        if (
          !read_only &&
          corpus_permissions.includes(PermissionTypes.CAN_UPDATE)
        ) {
          if (!annotationStore.pageSelection && event.buttons === 1) {
            const { left: containerAbsLeftOffset, top: containerAbsTopOffset } =
              containerRef.current.getBoundingClientRect();
            const left = event.pageX - containerAbsLeftOffset;
            const top = event.pageY - containerAbsTopOffset;
            annotationStore.setSelection({
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
        annotationStore.pageSelection
          ? (event) => {
              if (containerRef.current === null) {
                throw new Error("No Container");
              }
              //console.log("Mouse moving")
              const {
                left: containerAbsLeftOffset,
                top: containerAbsTopOffset,
              } = containerRef.current.getBoundingClientRect();
              if (
                annotationStore.pageSelection &&
                annotationStore.pageSelection.pageNumber ===
                  pageInfo.page.pageNumber - 1
              ) {
                annotationStore.setSelection({
                  pageNumber: pageInfo.page.pageNumber - 1,
                  bounds: {
                    ...annotationStore.pageSelection.bounds,
                    right: event.pageX - containerAbsLeftOffset,
                    bottom: event.pageY - containerAbsTopOffset,
                  },
                });
              }
            }
          : undefined
      }
      onMouseUp={(event) => {
        if (annotationStore.pageSelection) {
          // If page number is already in queue... append to queue at page number key
          if (
            pageInfo.page.pageNumber - 1 in
              annotationStore.pageSelectionQueue &&
            annotationStore.pageSelection.pageNumber ===
              pageInfo.page.pageNumber - 1
          ) {
            annotationStore.setMultiSelections({
              ...annotationStore.pageSelectionQueue,
              [pageInfo.page.pageNumber - 1]: [
                ...annotationStore.pageSelectionQueue[
                  pageInfo.page.pageNumber - 1
                ],
                annotationStore.pageSelection.bounds,
              ],
            });
          }

          // Otherwise, add page number as key and then add bounds to it.
          else {
            annotationStore.setMultiSelections({
              ...annotationStore.pageSelectionQueue,
              [annotationStore.pageSelection.pageNumber]: [
                annotationStore.pageSelection.bounds,
              ],
            });
          }

          // Clear selection active selection as it's now in the queue
          annotationStore.setSelection(undefined);

          // If shift key is not depressed, then trigger annotation creation.
          if (!event.shiftKey) {
            annotationStore.createMultiPageAnnotation();
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
        annotationStore.textSearchMatches
          .filter(
            (match) => match.tokens[pageInfo.page.pageNumber - 1] !== undefined
          )
          .map((match, token_index) => (
            <SearchResult
              total_results={annotationStore.textSearchMatches.length}
              selectionRef={searchResultElementRefs}
              showBoundingBox={true}
              hidden={
                show_selected_annotation_only &&
                token_index !== selectedTextSearchMatchIndex
              }
              pageInfo={pageInfo}
              match={match}
              labelBehavior={show_annotation_labels}
            />
          ))}
      {annotationStore.pageSelection?.pageNumber ===
        pageInfo.page.pageNumber - 1 && annotationStore.activeSpanLabel
        ? ConvertBoundsToSelections(
            annotationStore.pageSelection.bounds,
            annotationStore.activeSpanLabel as AnnotationLabelType
          )
        : null}
      {pageQueuedSelections.length > 0 && annotationStore.activeSpanLabel
        ? pageQueuedSelections.map((selection) =>
            ConvertBoundsToSelections(
              selection,
              annotationStore.activeSpanLabel as AnnotationLabelType
            )
          )
        : null}
    </PageAnnotationsContainer>
  );
};
