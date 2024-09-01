import { useContext } from "react";
import styled from "styled-components";
import { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import _ from "lodash";
import { PDFStore } from "../context";
import { LabelDisplayBehavior } from "../../../graphql/types";
import { PermissionTypes } from "../../types";
import { Page } from "./Page";

export class PDFPageRenderer {
  private currentRenderTask?: ReturnType<PDFPageProxy["render"]>;
  private isRendering: boolean = false;

  constructor(
    readonly page: PDFPageProxy,
    readonly canvas: HTMLCanvasElement,
    readonly onError: (e: Error) => void
  ) {}

  cancelCurrentRender() {
    if (this.currentRenderTask) {
      this.currentRenderTask.promise.then(
        () => {
          this.isRendering = false;
        },
        (err: any) => {
          this.isRendering = false;
          if (
            err instanceof Error &&
            err.message.indexOf("Rendering cancelled") !== -1
          ) {
            return;
          }
          const e = err instanceof Error ? err : new Error(err);
          this.onError(e);
        }
      );
      this.currentRenderTask.cancel();
    }
  }

  async render(scale: number) {
    if (this.isRendering) {
      await this.cancelCurrentRender();
    }

    this.isRendering = true;
    const viewport = this.page.getViewport({ scale });

    this.canvas.height = viewport.height;
    this.canvas.width = viewport.width;

    const canvasContext = this.canvas.getContext("2d");
    if (canvasContext === null) {
      throw new Error("No canvas context");
    }

    try {
      this.currentRenderTask = this.page.render({ canvasContext, viewport });
      await this.currentRenderTask.promise;
    } finally {
      this.isRendering = false;
    }
  }

  async rescaleAndRender(scale: number) {
    await this.cancelCurrentRender();
    return this.render(scale);
  }
}

export const PDF = ({
  shiftDown,
  doc_permissions,
  corpus_permissions,
  read_only,
  show_selected_annotation_only,
  show_annotation_bounding_boxes,
  show_annotation_labels,
  setJumpedToAnnotationOnLoad,
}: {
  shiftDown?: boolean;
  doc_permissions: PermissionTypes[];
  corpus_permissions: PermissionTypes[];
  read_only: boolean;
  show_selected_annotation_only: boolean;
  show_annotation_bounding_boxes: boolean;
  show_annotation_labels: LabelDisplayBehavior;
  setJumpedToAnnotationOnLoad: (annot_id: string) => null | void;
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
            read_only={read_only}
            doc_permissions={doc_permissions}
            corpus_permissions={corpus_permissions}
            pageInfo={p}
            onError={pdfStore.onError}
            show_selected_annotation_only={show_selected_annotation_only}
            show_annotation_bounding_boxes={show_annotation_bounding_boxes}
            show_annotation_labels={show_annotation_labels}
            setJumpedToAnnotationOnLoad={setJumpedToAnnotationOnLoad}
          />
        );
      })}
    </>
  );
};

export const PageAnnotationsContainer = styled.div(
  ({ theme }) => `
    position: relative;
    box-shadow: 2px 2px 4px 0 rgba(0, 0, 0, 0.2);
    margin: 0 0 .5rem;
    
    &:last-child {
        margin-bottom: 0;
    }
`
);

export const PageCanvas = styled.canvas(
  ({ width }: { width?: number }) => `
  display: block;
  ${width ? "width: " + width + "px;" : ""}
  height: auto;
`
);
