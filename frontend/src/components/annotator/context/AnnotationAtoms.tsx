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

/**
 * Canonical, de-duplicated list of ALL annotations (regular + structural).
 * Re-computed only when either source array changes.
 */
export const allAnnotationsAtom = atom<
  (ServerTokenAnnotation | ServerSpanAnnotation)[]
>((get) => {
  const { annotations } = get(pdfAnnotationsAtom);
  const structural = get(structuralAnnotationsAtom);

  const seen = new Set<string>();
  const out: (ServerTokenAnnotation | ServerSpanAnnotation)[] = [];

  for (const a of [...annotations, ...structural]) {
    if (seen.has(a.id)) continue; // skip duplicates
    seen.add(a.id);
    out.push(a);
  }
  return out;
});

/**
 * Map { pageIndex -> annotations[] } built from the canonical list above.
 */
export const perPageAnnotationsAtom = atom((get) => {
  const all = get(allAnnotationsAtom);

  const map = new Map<
    number,
    (ServerTokenAnnotation | ServerSpanAnnotation)[]
  >();

  for (const a of all) {
    const pageIdx = a.page ?? 0; // annotations store zero-based page index
    if (!map.has(pageIdx)) map.set(pageIdx, []);
    map.get(pageIdx)!.push(a);
  }
  return map;
});
