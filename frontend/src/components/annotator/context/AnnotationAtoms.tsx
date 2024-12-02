import { atom } from "jotai";
import {
  PdfAnnotations,
  ServerTokenAnnotation,
  ServerSpanAnnotation,
  DocTypeAnnotation,
} from "../types/annotations";

/**
 * Atom to manage PdfAnnotations state.
 */
export const pdfAnnotationsAtom = atom<PdfAnnotations>(
  new PdfAnnotations([], [], [])
);

/**
 * Atom to manage structural annotations.
 */
export const structuralAnnotationsAtom = atom<ServerTokenAnnotation[]>([]);

/**
 * Atom to manage all annotation objects.
 */
export const annotationObjsAtom = atom<
  (ServerTokenAnnotation | ServerSpanAnnotation)[]
>([]);

/**
 * Atom to manage document type annotations.
 */
export const docTypeAnnotationsAtom = atom<DocTypeAnnotation[]>([]);

/**
 * Atom to store the initial annotations when the document is first loaded.
 */
export const initialAnnotationsAtom = atom<
  (ServerTokenAnnotation | ServerSpanAnnotation)[]
>([]);
