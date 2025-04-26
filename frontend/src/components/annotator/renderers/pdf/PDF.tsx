import styled from "styled-components";
import { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import _ from "lodash";
import { PDFPage } from "./PDFPage";
import {
  usePages,
  usePdfDoc,
  useSetViewStateError,
} from "../../context/DocumentAtom";

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

type PDFProps = {
  read_only: boolean;
  containerWidth?: number | null;
};

export const PDF = ({ read_only, containerWidth }: PDFProps) => {
  const { pdfDoc } = usePdfDoc();
  const { pages } = usePages();
  const setViewStateError = useSetViewStateError();

  if (!pdfDoc) {
    // fallback if doc not loaded
    return null;
  }
  if (!pages) {
    // fallback if pages not defined
    return <div>No pages available.</div>;
  }

  return (
    <>
      {Object.values(pages).map((p) => (
        <PDFPage
          key={p.page.pageNumber}
          pageInfo={p}
          read_only={read_only}
          onError={setViewStateError}
          containerWidth={containerWidth}
        />
      ))}
    </>
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
