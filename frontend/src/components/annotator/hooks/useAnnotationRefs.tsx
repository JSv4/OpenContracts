import { useCallback, useRef } from "react";

type RefType = "selection" | "search" | "page";

/**
 * Hook to manage annotation references for selections, search results, and pages
 */
export function useAnnotationRefs() {
  const selectionElementRefs = useRef<Record<string, HTMLElement | null>>({});
  const searchResultElementRefs = useRef<Record<string, HTMLElement | null>>(
    {}
  );
  const pageElementRefs = useRef<
    Record<number, React.MutableRefObject<HTMLElement | null>>
  >({});

  const registerRef = useCallback(
    (
      type: RefType,
      id: string | number,
      ref: React.MutableRefObject<HTMLElement | null>
    ) => {
      switch (type) {
        case "selection":
          selectionElementRefs.current[id.toString()] = ref.current;
          break;
        case "search":
          searchResultElementRefs.current[id.toString()] = ref.current;
          break;
        case "page":
          pageElementRefs.current[id as number] = ref;
          break;
      }
    },
    []
  );

  const unregisterRef = useCallback((type: RefType, id: string | number) => {
    switch (type) {
      case "selection":
        delete selectionElementRefs.current[id.toString()];
        break;
      case "search":
        delete searchResultElementRefs.current[id.toString()];
        break;
      case "page":
        delete pageElementRefs.current[id as number];
        break;
    }
  }, []);

  return {
    selectionElementRefs,
    searchResultElementRefs,
    pageElementRefs,
    registerRef,
    unregisterRef,
  };
}
