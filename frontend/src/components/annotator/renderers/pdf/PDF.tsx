import styled from "styled-components";
import { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { PDFPage } from "./PDFPage";
import {
  usePages,
  usePdfDoc,
  useSetViewStateError,
  scrollContainerRefAtom,
} from "../../context/DocumentAtom";
import { ServerTokenAnnotation } from "../../types/annotations";
import { useAtomValue } from "jotai";
import {
  useZoomLevel,
  useAnnotationSelection,
} from "../../context/UISettingsAtom";
import { usePdfAnnotations } from "../../hooks/AnnotationHooks";

export class PDFPageRenderer {
  private currentRenderTask?: ReturnType<PDFPageProxy["render"]>;
  constructor(
    readonly page: PDFPageProxy,
    readonly canvas: HTMLCanvasElement,
    readonly onError: (e: Error) => void
  ) {}

  cancelCurrentRender() {
    try {
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
          // this.onError(e);
          console.warn("Issue cancelling render", e);
        }
      );
      this.currentRenderTask.cancel();
    } catch {}
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

interface PDFProps {
  read_only: boolean;
  containerWidth?: number | null;
  createAnnotationHandler: (annotation: ServerTokenAnnotation) => Promise<void>;
}

export const PDF: React.FC<PDFProps> = ({
  read_only,
  containerWidth,
  createAnnotationHandler,
}) => {
  const { pages } = usePages();
  const setViewStateError = useSetViewStateError();
  const { zoomLevel } = useZoomLevel();
  const { selectedAnnotations } = useAnnotationSelection();
  const { pdfAnnotations } = usePdfAnnotations();
  const scrollContainerRef = useAtomValue(scrollContainerRefAtom);

  /* ---------- build index & heights ---------------------------------- */
  const pageInfos = useMemo(
    () =>
      Object.values(pages).sort(
        (a, b) => a.page.pageNumber - b.page.pageNumber
      ),
    [pages]
  );

  const pageHeights = useMemo(
    () =>
      pageInfos.map(
        (p) => p.page.getViewport({ scale: zoomLevel }).height + 32
      ), // +margin
    [pageInfos, zoomLevel]
  );

  /* prefix sums for quick offset lookup */
  const cumulative = useMemo(() => {
    const out: number[] = [0];
    for (let i = 0; i < pageHeights.length; i++) {
      out.push(out[i] + pageHeights[i]);
    }
    return out; // length = pageCount + 1
  }, [pageHeights]);

  /* ------------------------------------------------------------------ */
  /* utility: pick the element that actually scrolls ------------------- */
  const getScrollElement = (): HTMLElement | Window => {
    const el = scrollContainerRef?.current;
    if (el && el.scrollHeight > el.clientHeight) return el;
    // fallback – the page itself scrolls
    return window;
  };

  /* ---------- visible window tracking -------------------------------- */
  const [range, setRange] = useState<[number, number]>([0, 0]); // [startIdx, endIdx]

  const calcRange = useCallback(() => {
    const el = getScrollElement();
    const scroll =
      el instanceof Window
        ? window.scrollY || document.documentElement.scrollTop
        : el.scrollTop;
    const viewH = el instanceof Window ? window.innerHeight : el.clientHeight;

    // binary search for first page whose bottom >= scrollTop
    let lo = 0,
      hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (cumulative[mid + 1] < scroll) lo = mid + 1;
      else hi = mid;
    }
    const first = lo;

    // find last page whose top <= scrollTop + viewH
    lo = first;
    hi = cumulative.length - 2;
    const limit = scroll + viewH;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (cumulative[mid] <= limit) lo = mid;
      else hi = mid - 1;
    }
    const last = lo;

    const overscan = 2;
    setRange([
      Math.max(0, first - overscan),
      Math.min(pageInfos.length - 1, last + overscan),
    ]);
  }, [scrollContainerRef, cumulative, pageInfos.length]);

  /* attach / detach scroll listener(s) */
  useEffect(() => {
    const elWindow = window;
    const elContainer = scrollContainerRef?.current;
    calcRange(); // initial
    const onScroll = () => requestAnimationFrame(calcRange);
    elWindow.addEventListener("scroll", onScroll, { passive: true });
    elContainer?.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      elWindow.removeEventListener("scroll", onScroll);
      elContainer?.removeEventListener("scroll", onScroll);
    };
  }, [scrollContainerRef, calcRange]);

  /* update window when zoom changes */
  useEffect(calcRange, [zoomLevel, calcRange]);

  /* ---------- jump-to-annotation ------------------------------------- */
  useEffect(() => {
    if (selectedAnnotations.length === 0) return;
    const id = selectedAnnotations[0];
    const annot = pdfAnnotations.annotations.find((a) => a.id === id);
    if (!annot) return;

    const el = getScrollElement();

    /* both HTMLElement and Window implement scrollTo ------------------ */
    el.scrollTo({
      top: cumulative[annot.page],
      behavior: "smooth",
    });

    // Ensure the virtual-window recalculates even if no 'scroll' event fires
    requestAnimationFrame(calcRange);
  }, [
    selectedAnnotations,
    pdfAnnotations,
    cumulative,
    scrollContainerRef,
    calcRange,
  ]);

  /* ---------- render -------------------------------------------------- */
  if (pageInfos.length === 0) return null;

  return (
    <div style={{ position: "relative" }}>
      {pageInfos.map((pInfo, idx) => {
        const top = cumulative[idx];
        const height = pageHeights[idx];
        const visible = idx >= range[0] && idx <= range[1];

        return (
          <div
            key={pInfo.page.pageNumber}
            style={{
              position: "absolute",
              top,
              height,
              width: "100%",
            }}
          >
            {visible && (
              <PDFPage
                pageInfo={pInfo}
                read_only={read_only}
                onError={setViewStateError}
                containerWidth={containerWidth}
                createAnnotationHandler={createAnnotationHandler}
              />
            )}
          </div>
        );
      })}
      {/* spacer so the scroll container has correct total height */}
      <div style={{ height: cumulative[cumulative.length - 1] }} />
    </div>
  );
};

export const PageAnnotationsContainer = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  width: 100%;
  margin: 1rem 0;

  @media (max-width: 768px) {
    margin: 0.5rem 0;
    min-width: fit-content;
    /* Ensure container expands to fit content but allows scrolling */
    width: auto;
    justify-content: flex-start;
  }
`;

export const PageCanvas = styled.canvas`
  // Remove max-width so the canvas can exceed its parent's width
  // max-width: 100%;
  // height: auto;

  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(0, 0, 0, 0.1);
`;
