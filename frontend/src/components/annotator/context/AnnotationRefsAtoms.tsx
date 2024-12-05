import { atom } from "jotai";
import { PDFPageRenderer } from "../renderers/pdf/PDF";

type RefType =
  | "selection"
  | "search"
  | "annotation"
  | "scrollContainer"
  | "pdfPageCanvas"
  | "pdfPageRenderer"
  | "pdfPageContainer";

/**
 * Atom for the scroll container reference
 */
export const scrollContainerRefAtom = atom<HTMLDivElement | null>(null);

/**
 * Atom for the PDF page canvas reference
 */
export const PDFPageCanvasRefAtom = atom<HTMLCanvasElement | null>(null);

/**
 * Atom for the PDF page renderer reference
 */
export const PDFPageRendererRefAtom = atom<PDFPageRenderer | null>(null);

/**
 * Atom for the PDF page container references indexed by page number
 */
const PDFPageContainerRefsAtom = atom<Record<number, HTMLDivElement | null>>(
  {}
);

/**
 * Atom for annotation element references
 */
const annotationElementRefsAtom = atom<Record<string, HTMLElement | null>>({});

/**
 * Atom for text search element references
 */
const textSearchElementRefsAtom = atom<Record<string, HTMLElement | null>>({});

/**
 * Atom for registering refs
 */
export const registerRefAtom = atom(
  null,
  (
    get,
    set,
    params: {
      type: RefType;
      ref: React.MutableRefObject<any>;
      id?: string | number;
    }
  ) => {
    const { type, id, ref } = params;

    switch (type) {
      case "scrollContainer":
        set(scrollContainerRefAtom, ref.current);
        break;
      case "pdfPageCanvas":
        set(PDFPageCanvasRefAtom, ref.current);
        break;
      case "pdfPageRenderer":
        set(PDFPageRendererRefAtom, ref.current);
        break;
      case "pdfPageContainer":
        set(PDFPageContainerRefsAtom, {
          ...get(PDFPageContainerRefsAtom),
          [id as number]: ref.current,
        });
        break;
      case "annotation":
        set(annotationElementRefsAtom, {
          ...get(annotationElementRefsAtom),
          [id!.toString()]: ref.current,
        });
        break;
      case "search":
        set(textSearchElementRefsAtom, {
          ...get(textSearchElementRefsAtom),
          [id!.toString()]: ref.current,
        });
        break;
      default:
        console.warn(`Unhandled RefType: ${type}`);
    }
  }
);

/**
 * Atom for unregistering refs
 */
export const unregisterRefAtom = atom(
  null,
  (
    get,
    set,
    params: {
      type: RefType;
      id?: string | number;
    }
  ) => {
    const { type, id } = params;

    switch (type) {
      case "scrollContainer":
        set(scrollContainerRefAtom, null);
        break;
      case "pdfPageCanvas":
        set(PDFPageCanvasRefAtom, null);
        break;
      case "pdfPageRenderer":
        set(PDFPageRendererRefAtom, null);
        break;
      case "pdfPageContainer": {
        const newRefs = { ...get(PDFPageContainerRefsAtom) };
        delete newRefs[id as number];
        set(PDFPageContainerRefsAtom, newRefs);
        break;
      }
      case "annotation": {
        const newRefs = { ...get(annotationElementRefsAtom) };
        delete newRefs[id!.toString()];
        set(annotationElementRefsAtom, newRefs);
        break;
      }
      case "search": {
        const newRefs = { ...get(textSearchElementRefsAtom) };
        delete newRefs[id!.toString()];
        set(textSearchElementRefsAtom, newRefs);
        break;
      }
      default:
        console.warn(`Unhandled RefType: ${type}`);
    }
  }
);

/**
 * Combined read-only atom for accessing all refs
 */
export const annotationRefsAtom = atom((get) => ({
  scrollContainerRef: get(scrollContainerRefAtom),
  PDFPageCanvasRef: get(PDFPageCanvasRefAtom),
  PDFPageRendererRef: get(PDFPageRendererRefAtom),
  PDFPageContainerRefs: get(PDFPageContainerRefsAtom),
  annotationElementRefs: get(annotationElementRefsAtom),
  textSearchElementRefs: get(textSearchElementRefsAtom),
}));
