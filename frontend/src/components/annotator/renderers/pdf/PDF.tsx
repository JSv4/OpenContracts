import styled from "styled-components";
import { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import _ from "lodash";
import { PermissionTypes } from "../../../types";
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

export const PDF = ({ read_only }: { read_only: boolean }) => {
  const { pdfDoc: doc } = usePdfDoc();
  const { pages } = usePages();
  const setViewStateError = useSetViewStateError();

  if (!doc) {
    // Instead of throwing an error, render nothing or a fallback UI
    console.warn("PDF component rendered without a valid document.");
    return null; // Or return a fallback UI
  }

  if (!pages) {
    // Similarly, handle missing pages gracefully
    console.warn("PDF component rendered without pages.");
    return <div>No pages available.</div>;
  }

  return (
    <>
      {Object.values(pages).map((p) => {
        return (
          <PDFPage
            key={p.page.pageNumber}
            read_only={read_only}
            pageInfo={p}
            onError={setViewStateError}
          />
        );
      })}
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
`;

export const PageCanvas = styled.canvas`
  // Add box shadow and border for better visibility
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(0, 0, 0, 0.1);
  // Ensure canvas maintains aspect ratio
  max-width: 100%;
  height: auto;
`;
