import { createContext } from "react";
import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

import { BoundingBox } from "../../types";
import { AnnotationLabelType } from "../../../types/graphql-api";
import { RenderedSpanAnnotation } from "../types/annotations";
import { PDFPageInfo } from "../types/pdf";

export type Optional<T> = T | undefined;

// Somehow (still trying to figure this one out), undefined tokens are getting
// passed to getScaledTokenBounds and this is blowing up the entire app. For now,
// test for undefined token and just return this dummy token json.
export const undefined_bounding_box = {
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
};

/**
 * Returns the provided bounds scaled by the provided factor.
 */
export function scaled(bounds: BoundingBox, scale: number): BoundingBox {
  return {
    left: bounds.left * scale,
    top: bounds.top * scale,
    right: bounds.right * scale,
    bottom: bounds.bottom * scale,
  };
}

/**
 * Computes a bound which contains all of the bounds passed as arguments.
 */
export function spanningBound(
  bounds: BoundingBox[],
  padding: number = 3
): BoundingBox {
  // Start with a bounding box for which any bound would be
  // contained within, meaning we immediately update maxBound.
  const maxBound: BoundingBox = {
    left: Number.MAX_VALUE,
    top: Number.MAX_VALUE,
    right: 0,
    bottom: 0,
  };

  bounds.forEach((bound) => {
    maxBound.bottom = Math.max(bound.bottom, maxBound.bottom);
    maxBound.top = Math.min(bound.top, maxBound.top);
    maxBound.left = Math.min(bound.left, maxBound.left);
    maxBound.right = Math.max(bound.right, maxBound.right);
  });

  maxBound.top = maxBound.top - padding;
  maxBound.left = maxBound.left - padding;
  maxBound.right = maxBound.right + padding;
  maxBound.bottom = maxBound.bottom + padding;

  return maxBound;
}

/**
 * Returns the provided bounds in their normalized form. Normalized means that the left
 * coordinate is always less than the right coordinate, and that the top coordinate is always
 * left than the bottom coordinate.
 *
 * This is required because objects in the DOM are positioned and sized by setting their top-left
 * corner, width and height. This means that when a user composes a selection and moves to the left,
 * or up, from where they started might result in a negative width and/or height. We don't normalize
 * these values as we're tracking the mouse as it'd result in the wrong visual effect. Instead we
 * rotate the bounds we render on the appropriate axis. This means we need to account for this
 * later when calculating what tokens the bounds intersect with.
 */
export function normalizeBounds(b: BoundingBox): BoundingBox {
  const normalized = Object.assign({}, b);
  if (b.right < b.left) {
    const l = b.left;
    normalized.left = b.right;
    normalized.right = l;
  }
  if (b.bottom < b.top) {
    const t = b.top;
    normalized.top = b.bottom;
    normalized.bottom = t;
  }
  return normalized;
}

/**
 * Returns true if the provided bounds overlap.
 */
export function doOverlap(a: BoundingBox, b: BoundingBox): boolean {
  if (a.left >= b.right || a.right <= b.left) {
    return false;
  } else if (a.bottom <= b.top || a.top >= b.bottom) {
    return false;
  }
  return true;
}

export function getNewAnnotation(
  page: PDFPageInfo,
  selection: BoundingBox,
  activeLabel: AnnotationLabelType,
  freeform: boolean
): Optional<RenderedSpanAnnotation> {
  let annotation: Optional<RenderedSpanAnnotation>;

  const normalized = normalizeBounds(selection);
  if (freeform) {
    annotation = page.getFreeFormAnnotationForBounds(normalized, activeLabel);
  } else {
    annotation = page.getAnnotationForBounds(normalized, activeLabel);
  }

  return annotation;
}

interface _PDFStore {
  pages?: PDFPageInfo[];
  doc?: PDFDocumentProxy;
  onError: (err: Error) => void;
  zoomLevel: number;
  setZoomLevel: (zl: number) => void;
}

export const PDFStore = createContext<_PDFStore>({
  onError: (_: Error) => {
    throw new Error("Unimplemented");
  },
  setZoomLevel: (zl: number) => {
    throw new Error("setZoomLevel() not implemented");
  },
  zoomLevel: 1,
});
