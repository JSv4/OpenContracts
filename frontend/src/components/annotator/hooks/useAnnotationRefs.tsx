import { useAtomValue, useSetAtom } from "jotai";
import {
  annotationRefsAtom,
  registerRefAtom,
  unregisterRefAtom,
} from "../context/AnnotationRefsAtoms";
import { PDFPageRenderer } from "../renderers/pdf/PDF";
import { useCallback } from "react";

type RefType =
  | "selection"
  | "search"
  | "annotation"
  | "scrollContainer"
  | "pdfPageCanvas"
  | "pdfPageRenderer"
  | "pdfPageContainer"
  | "chatSource";

/**
 * Hook for managing annotation references
 * @returns Object containing ref collections and methods to register/unregister refs
 */
export const useAnnotationRefs = () => {
  const refs = useAtomValue(annotationRefsAtom);
  const registerAtom = useSetAtom(registerRefAtom);
  const unregisterAtom = useSetAtom(unregisterRefAtom);

  /**
   * Registers a reference based on its type and ID
   * @param type - The type of the reference
   * @param ref - The mutable ref object pointing to the HTMLElement or other
   * @param id - The unique identifier for the reference (optional)
   */
  const registerRef = useCallback(
    (
      type: RefType,
      ref: React.MutableRefObject<
        HTMLElement | HTMLCanvasElement | PDFPageRenderer | null
      >,
      id?: string | number
    ) => {
      registerAtom({ type, id, ref });
    },
    [registerAtom]
  );

  /**
   * Unregisters a reference based on its type and ID
   * @param type - The type of the reference
   * @param id - The unique identifier for the reference (optional)
   */
  const unregisterRef = useCallback(
    (type: RefType, id?: string | number) => {
      unregisterAtom({ type, id });
    },
    [unregisterAtom]
  );

  return {
    scrollContainerRef: { current: refs.scrollContainerRef },
    PDFPageCanvasRef: { current: refs.PDFPageCanvasRef },
    PDFPageRendererRef: { current: refs.PDFPageRendererRef },
    PDFPageContainerRefs: { current: refs.PDFPageContainerRefs },
    annotationElementRefs: { current: refs.annotationElementRefs },
    textSearchElementRefs: { current: refs.textSearchElementRefs },
    chatSourceElementRefs: { current: refs.chatSourceElementRefs },
    registerRef,
    unregisterRef,
  };
};
