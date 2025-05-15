import { useAtomValue } from "jotai";
import { perPageAnnotationsAtom } from "../context/AnnotationAtoms";
import {
  ServerTokenAnnotation,
  ServerSpanAnnotation,
} from "../types/annotations";

/**
 * Returns the annotations that belong to `pageIndex` (0-based).
 */
export function usePageAnnotations(
  pageIndex: number
): (ServerTokenAnnotation | ServerSpanAnnotation)[] {
  const map = useAtomValue(perPageAnnotationsAtom);
  return map.get(pageIndex) ?? [];
}
