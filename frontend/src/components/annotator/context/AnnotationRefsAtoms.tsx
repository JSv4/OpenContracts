import { atom } from "jotai";

type RefType = "selection" | "search" | "page";

interface AnnotationRefs {
  selectionElementRefs: Record<string, HTMLElement | null>;
  searchResultElementRefs: Record<string, HTMLElement | null>;
  pageElementRefs: Record<number, React.MutableRefObject<HTMLElement | null>>;
}

/**
 * Base atoms for storing annotation references
 */
const selectionElementRefsAtom = atom<Record<string, HTMLElement | null>>({});
const searchResultElementRefsAtom = atom<Record<string, HTMLElement | null>>(
  {}
);
const pageElementRefsAtom = atom<
  Record<number, React.MutableRefObject<HTMLElement | null>>
>({});

/**
 * Derived atom for registering refs
 */
export const registerRefAtom = atom(
  null,
  (
    get,
    set,
    params: {
      type: RefType;
      id: string | number;
      ref: React.MutableRefObject<HTMLElement | null>;
    }
  ) => {
    const { type, id, ref } = params;

    switch (type) {
      case "selection":
        set(selectionElementRefsAtom, {
          ...get(selectionElementRefsAtom),
          [id.toString()]: ref.current,
        });
        break;
      case "search":
        set(searchResultElementRefsAtom, {
          ...get(searchResultElementRefsAtom),
          [id.toString()]: ref.current,
        });
        break;
      case "page":
        set(pageElementRefsAtom, {
          ...get(pageElementRefsAtom),
          [id as number]: ref,
        });
        break;
    }
  }
);

/**
 * Derived atom for unregistering refs
 */
export const unregisterRefAtom = atom(
  null,
  (get, set, params: { type: RefType; id: string | number }) => {
    const { type, id } = params;

    switch (type) {
      case "selection": {
        const newRefs = { ...get(selectionElementRefsAtom) };
        delete newRefs[id.toString()];
        set(selectionElementRefsAtom, newRefs);
        break;
      }
      case "search": {
        const newRefs = { ...get(searchResultElementRefsAtom) };
        delete newRefs[id.toString()];
        set(searchResultElementRefsAtom, newRefs);
        break;
      }
      case "page": {
        const newRefs = { ...get(pageElementRefsAtom) };
        delete newRefs[id as number];
        set(pageElementRefsAtom, newRefs);
        break;
      }
    }
  }
);

/**
 * Combined read-only atom for accessing all refs
 */
export const annotationRefsAtom = atom((get) => ({
  selectionElementRefs: get(selectionElementRefsAtom),
  searchResultElementRefs: get(searchResultElementRefsAtom),
  pageElementRefs: get(pageElementRefsAtom),
}));
