import { useContext, useRef, useEffect, useState } from "react";
import styled from "styled-components";
import { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import _ from "lodash";

import {
  PDFPageInfo,
  AnnotationStore,
  PDFStore,
  normalizeBounds,
} from "./context";
import { Selection } from "./Selection";
import { SelectionBoundary, SelectionTokens } from "./Selection";
import {
  AnnotationLabelType,
  LabelDisplayBehavior,
  ServerAnnotationType,
} from "../../graphql/types";
import { BoundingBox, PermissionTypes } from "../types";
import { SearchResult } from "./SearchResult";

class PDFPageRenderer {
  private currentRenderTask?: ReturnType<PDFPageProxy["render"]>;
  constructor(
    readonly page: PDFPageProxy,
    readonly canvas: HTMLCanvasElement,
    readonly onError: (e: Error) => void
  ) {}

  cancelCurrentRender() {
    if (this.currentRenderTask === undefined) {
      return;
    }
    this.currentRenderTask.promise.then(
      () => {},
      (err: any) => {
        if (
          err instanceof Error &&
          err.message.indexOf("Rendering cancelled") !== -1
        ) {
          // Swallow the error that's thrown when the render is canceled.
          return;
        }
        const e = err instanceof Error ? err : new Error(err);
        this.onError(e);
      }
    );
    this.currentRenderTask.cancel();
  }

  render(scale: number) {
    const viewport = this.page.getViewport({ scale });

    this.canvas.height = viewport.height;
    this.canvas.width = viewport.width;

    const canvasContext = this.canvas.getContext("2d");
    if (canvasContext === null) {
      throw new Error("No canvas context");
    }
    this.currentRenderTask = this.page.render({ canvasContext, viewport });
    return this.currentRenderTask;
  }

  rescaleAndRender(scale: number) {
    this.cancelCurrentRender();
    return this.render(scale);
  }
}

function getPageBoundsFromCanvas(canvas: HTMLCanvasElement): BoundingBox {
  if (canvas.parentElement === null) {
    throw new Error("No canvas parent");
  }
  const parent = canvas.parentElement;
  const parentStyles = getComputedStyle(canvas.parentElement);

  const leftPadding = parseFloat(parentStyles.paddingLeft || "0");
  const left = parent.offsetLeft + leftPadding;

  const topPadding = parseFloat(parentStyles.paddingTop || "0");
  const top = parent.offsetTop + topPadding;

  const parentWidth =
    parent.clientWidth -
    leftPadding -
    parseFloat(parentStyles.paddingRight || "0");
  const parentHeight =
    parent.clientHeight -
    topPadding -
    parseFloat(parentStyles.paddingBottom || "0");
  return {
    left,
    top,
    right: left + parentWidth,
    bottom: top + parentHeight,
  };
}

interface PageProps {
  pageInfo: PDFPageInfo;
  doc_permissions: PermissionTypes[];
  corpus_permissions: PermissionTypes[];
  scroll_to_annotation_on_open: ServerAnnotationType | null;
  show_selected_annotation_only: boolean;
  show_annotation_bounding_boxes: boolean;
  show_annotation_labels: LabelDisplayBehavior;
  onError: (_err: Error) => void;
}

const Page = ({
  pageInfo,
  doc_permissions,
  corpus_permissions,
  scroll_to_annotation_on_open,
  show_selected_annotation_only,
  show_annotation_bounding_boxes,
  show_annotation_labels,
  onError,
}: PageProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState<boolean>(false);
  const [scale, setScale] = useState<number>(1);

  const annotationStore = useContext(AnnotationStore);

  const containerRef = useRef<HTMLDivElement>(null);

  // console.log("ScrollContinerRef", scrollContainerRef);
  const annotations = annotationStore.pdfAnnotations.annotations;
  const {
    scrollContainerRef,
    selectedTextSearchMatchIndex,
    selectionElementRefs: selectionRefs,
    searchResultElementRefs,
  } = annotationStore;
  // console.log(`Multipage annotations for page #${pageInfo.page.pageNumber - 1}:`, annotations)

  // Given selected bounds (top, bottom, left, right), determine which tokens fall inside bounds
  function ConvertBoundsToSelections(
    selection: BoundingBox,
    activeLabel: AnnotationLabelType
  ): JSX.Element {
    // console.log("ConvertBoundsToSelections - selection", selection)

    const annotation = pageInfo.getAnnotationForBounds(
      normalizeBounds(selection),
      activeLabel
    );

    const tokens =
      annotation && annotation.tokens && !annotationStore.freeFormAnnotations
        ? annotation.tokens
        : null;

    return (
      <>
        <SelectionBoundary
          showBoundingBox
          hidden={false}
          color={
            annotationStore?.activeLabel?.color
              ? annotationStore.activeLabel.color
              : ""
          }
          bounds={selection}
          selected={false}
        />
        <SelectionTokens pageInfo={pageInfo} tokens={tokens} />
      </>
    );
  }

  useEffect(() => {
    try {
      const determinePageVisiblity = () => {
        if (canvasRef.current !== null) {
          const windowTop = 0;
          const windowBottom = window.innerHeight;
          const rect = canvasRef.current.getBoundingClientRect();

          let pageVisibility =
            // Top is in within window
            (windowTop < rect.top && rect.top < windowBottom) ||
            // Bottom is in within window
            (windowTop < rect.bottom && rect.bottom < windowBottom) ||
            // top is negative and bottom is +ve
            (rect.top < windowTop && rect.bottom > windowTop);
          setIsVisible(pageVisibility);
        }
      };

      if (canvasRef.current === null) {
        onError(new Error("No canvas element"));
        return;
      }
      if (scrollContainerRef && scrollContainerRef.current === null) {
        onError(new Error("No scroll container element"));
        return;
      }

      pageInfo.bounds = getPageBoundsFromCanvas(canvasRef.current);
      const renderer = new PDFPageRenderer(
        pageInfo.page,
        canvasRef.current,
        onError
      );

      renderer.render(pageInfo.scale);

      determinePageVisiblity();

      const handleResize = () => {
        if (canvasRef.current === null) {
          onError(new Error("No canvas element"));
          return;
        }
        pageInfo.bounds = getPageBoundsFromCanvas(canvasRef.current);
        renderer.rescaleAndRender(pageInfo.scale);
        setScale(pageInfo.scale);
        determinePageVisiblity();
      };

      // Upon completion of page creation effects, store page info in the AnnotatorStore context. We need this to
      // properly create annotations for multiple pages simultaneously.
      if (!(pageInfo.page.pageNumber - 1 in annotationStore.pdfPageInfoObjs)) {
        annotationStore.pdfPageInfoObjs[pageInfo.page.pageNumber - 1] =
          pageInfo;
      }

      if (scrollContainerRef && scrollContainerRef.current) {
        scrollContainerRef.current.addEventListener("resize", handleResize);
        scrollContainerRef.current.addEventListener(
          "scroll",
          determinePageVisiblity
        );
      }

      annotationStore.insertPageRef(pageInfo.page.pageNumber - 1, canvasRef);

      return () => {
        if (scrollContainerRef && scrollContainerRef.current !== null) {
          scrollContainerRef.current.removeEventListener(
            "resize",
            handleResize
          );
          scrollContainerRef.current.removeEventListener(
            "scroll",
            determinePageVisiblity
          );
        }
      };
    } catch (e: any) {
      console.log("Error determining visibility", e);
      onError(e);
    }

    console.log("Use effect");
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
  }, [pageInfo, onError]); // We deliberately only run this once (on component mount).

  const pageQueuedSelections = annotationStore.pageSelectionQueue[
    pageInfo.page.pageNumber - 1
  ]
    ? annotationStore.pageSelectionQueue[pageInfo.page.pageNumber - 1]
    : [];

  // TODO... create renderedable RenderedSpanAnnotations

  return (
    <PageAnnotationsContainer
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
        if (corpus_permissions.includes(PermissionTypes.CAN_UPDATE)) {
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
      <PageCanvas ref={canvasRef} />
      {
        // We only render the tokens if the page has rendered and we can get page bounds
        scale &&
          pageInfo.bounds &&
          annotations
            .filter((a) => a.json[pageInfo.page.pageNumber - 1] !== undefined)
            .map((annotation) => (
              <Selection
                hidden={
                  show_selected_annotation_only &&
                  !Boolean(
                    annotationStore.selectedAnnotations.includes(annotation.id)
                  )
                }
                showBoundingBox={show_annotation_bounding_boxes}
                scrollIntoView={
                  annotationStore.selectedAnnotations
                    ? annotationStore.selectedAnnotations.includes(
                        annotation.id
                      )
                    : false
                }
                labelBehavior={show_annotation_labels}
                selectionRef={selectionRefs}
                pageInfo={pageInfo}
                annotation={annotation}
                key={annotation.toString()}
              />
            ))
      }
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
        pageInfo.page.pageNumber - 1 && annotationStore.activeLabel
        ? ConvertBoundsToSelections(
            annotationStore.pageSelection.bounds,
            annotationStore.activeLabel as AnnotationLabelType
          )
        : null}
      {pageQueuedSelections.length > 0 && annotationStore.activeLabel
        ? pageQueuedSelections.map((selection) =>
            ConvertBoundsToSelections(
              selection,
              annotationStore.activeLabel as AnnotationLabelType
            )
          )
        : null}
    </PageAnnotationsContainer>
  );
};

export const PDF = ({
  shiftDown,
  doc_permissions,
  corpus_permissions,
  scroll_to_annotation_on_open,
  show_selected_annotation_only,
  show_annotation_bounding_boxes,
  show_annotation_labels,
}: {
  shiftDown?: boolean;
  doc_permissions: PermissionTypes[];
  corpus_permissions: PermissionTypes[];
  scroll_to_annotation_on_open: ServerAnnotationType | null;
  show_selected_annotation_only: boolean;
  show_annotation_bounding_boxes: boolean;
  show_annotation_labels: LabelDisplayBehavior;
}) => {
  const pdfStore = useContext(PDFStore);

  if (!pdfStore.doc) {
    throw new Error("No Document");
  }
  if (!pdfStore.pages) {
    throw new Error("Document without Pages");
  }

  return (
    <>
      {pdfStore.pages.map((p) => {
        return (
          <Page
            key={p.page.pageNumber}
            doc_permissions={doc_permissions}
            corpus_permissions={corpus_permissions}
            pageInfo={p}
            onError={pdfStore.onError}
            scroll_to_annotation_on_open={scroll_to_annotation_on_open}
            show_selected_annotation_only={show_selected_annotation_only}
            show_annotation_bounding_boxes={show_annotation_bounding_boxes}
            show_annotation_labels={show_annotation_labels}
          />
        );
      })}
    </>
  );
};

const PageAnnotationsContainer = styled.div(
  ({ theme }) => `
    position: relative;
    box-shadow: 2px 2px 4px 0 rgba(0, 0, 0, 0.2);
    margin: 0 0 .5rem;

    &:last-child {
        margin-bottom: 0;
    }
`
);

const PageCanvas = styled.canvas`
  display: block;
`;
