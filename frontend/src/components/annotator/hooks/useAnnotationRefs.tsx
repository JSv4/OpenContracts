import { useAtom, useSetAtom } from "jotai";
import {
  annotationRefsAtom,
  registerRefAtom,
  unregisterRefAtom,
} from "../context/AnnotationRefsAtoms";

type RefType = "selection" | "search" | "page";

/**
 * Hook for managing annotation references
 * @returns Object containing ref collections and methods to register/unregister refs
 */
export const useAnnotationRefs = () => {
  const [refs] = useAtom(annotationRefsAtom);
  const registerAtom = useSetAtom(registerRefAtom);
  const unregisterAtom = useSetAtom(unregisterRefAtom);

  const registerRef = (
    type: RefType,
    id: string | number,
    ref: React.MutableRefObject<HTMLElement | null>
  ) => {
    registerAtom({ type, id, ref });
  };

  const unregisterRef = (type: RefType, id: string | number) => {
    unregisterAtom({ type, id });
  };

  return {
    selectionElementRefs: {
      current: refs.selectionElementRefs,
    },
    searchResultElementRefs: {
      current: refs.searchResultElementRefs,
    },
    pageElementRefs: {
      current: refs.pageElementRefs,
    },
    registerRef,
    unregisterRef,
  };
};
