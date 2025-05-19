import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { PDFPageInfo } from "../types/pdf";
import { BoundingBox } from "../types/annotations";
import { ViewState } from "../types/enums";
import {
  PermissionTypes,
  TextSearchSpanResult,
  TextSearchTokenResult,
  TokenId,
} from "../../types";
import { DocumentType } from "../../../types/graphql-api";
import { getPermissions } from "../../../utils/transform";
import { RefObject, useMemo } from "react";

/**
 * Core document data atoms.
 */
export const selectedDocumentAtom = atom<DocumentType | null>(null);
export const fileTypeAtom = atom<string>("");
export const docTextAtom = atom<string>("");

/**
 * PDF-specific data atoms.
 */
export const pdfDocAtom = atom<PDFDocumentProxy | undefined>(undefined);
export const pageTokenTextMaps = atom<PDFPageInfo[]>([]);
export const pageTokenTextMapsAtom = atom<Record<number, TokenId>>({});
export const pagesAtom = atom<Record<number, PDFPageInfo>>([]);
export const documentTypeAtom = atom<string>("");

/**
 * Document state atoms.
 */
export const isLoadingAtom = atom<boolean>(false);
export const viewStateAtom = atom<ViewState>(ViewState.LOADING);
export const setViewStateErrorAtom = atom(
  null, // read
  (get, set) => {
    set(viewStateAtom, ViewState.ERROR);
  }
);

/**
 * Permissions atoms.
 */
export const rawPermissionsAtom = atom<string[]>(["READ"]);
export const permissionsAtom = atom<PermissionTypes[]>((get) =>
  getPermissions(get(rawPermissionsAtom))
);
export const canUpdateDocumentAtom = atom<boolean>((get) =>
  get(permissionsAtom).includes(PermissionTypes.CAN_UPDATE)
);
export const canDeleteDocumentAtom = atom<boolean>((get) =>
  get(permissionsAtom).includes(PermissionTypes.CAN_REMOVE)
);
export const hasDocumentPermissionAtom = atom<
  (permission: PermissionTypes) => boolean
>(
  (get) => (permission: PermissionTypes) =>
    get(permissionsAtom).includes(permission)
);

/**
 * Page and scroll management atoms.
 */
/**
 * Page selection atom to track the currently selected page and bounds.
 */
export const pageSelectionAtom = atom<
  | {
      pageNumber: number;
      bounds: BoundingBox;
    }
  | undefined
>(undefined);

export const pageSelectionQueueAtom = atom<Record<number, BoundingBox[]>>({});
export const scrollContainerRefAtom = atom<RefObject<HTMLDivElement> | null>(
  null
);
export const pendingScrollAnnotationIdAtom = atom<string | null>(null);
export const pendingScrollSearchResultIdAtom = atom<string | null>(null);
export const pendingScrollChatSourceKeyAtom = atom<string | null>(null);

/**
 * Text Search Atoms.
 */
export const textSearchStateAtom = atom<{
  matches: (TextSearchTokenResult | TextSearchSpanResult)[];
  selectedIndex: number;
}>({
  matches: [],
  selectedIndex: 0,
});

export const searchTextAtom = atom<string>("");

/**
 * Custom hooks to access and manipulate document state atoms.
 */

export function useSelectedDocument() {
  const [selectedDocument, setSelectedDocument] = useAtom(selectedDocumentAtom);
  return useMemo(
    () => ({ selectedDocument, setSelectedDocument }),
    [selectedDocument, setSelectedDocument]
  );
}

export function useFileType() {
  const [fileType, setFileType] = useAtom(fileTypeAtom);
  return useMemo(() => ({ fileType, setFileType }), [fileType, setFileType]);
}

export function useDocText() {
  const [docText, setDocText] = useAtom(docTextAtom);
  return useMemo(() => ({ docText, setDocText }), [docText, setDocText]);
}

export function usePdfDoc() {
  const [pdfDoc, setPdfDoc] = useAtom(pdfDocAtom);
  return useMemo(() => ({ pdfDoc, setPdfDoc }), [pdfDoc, setPdfDoc]);
}

export function usePageTokenTextMaps() {
  const [pageTokenTextMaps, setPageTokenTextMaps] = useAtom(
    pageTokenTextMapsAtom
  );
  return useMemo(
    () => ({ pageTokenTextMaps, setPageTokenTextMaps }),
    [pageTokenTextMaps, setPageTokenTextMaps]
  );
}

export function usePages() {
  const [pages, setPages] = useAtom(pagesAtom);
  return useMemo(() => ({ pages, setPages }), [pages, setPages]);
}

export function useDocumentType() {
  const [documentType, setDocumentType] = useAtom(documentTypeAtom);
  return useMemo(
    () => ({ documentType, setDocumentType }),
    [documentType, setDocumentType]
  );
}

export function useIsLoading() {
  const [isLoading, setIsLoading] = useAtom(isLoadingAtom);
  return useMemo(
    () => ({ isLoading, setIsLoading }),
    [isLoading, setIsLoading]
  );
}

export function useViewState() {
  const [viewState, setViewState] = useAtom(viewStateAtom);
  return useMemo(
    () => ({ viewState, setViewState }),
    [viewState, setViewState]
  );
}

export function usePermissions() {
  const permissions = useAtomValue(permissionsAtom);
  return permissions;
}

export function useCanUpdateDocument() {
  const canUpdateDocument = useAtomValue(canUpdateDocumentAtom);
  return canUpdateDocument;
}

export function useCanDeleteDocument() {
  const canDeleteDocument = useAtomValue(canDeleteDocumentAtom);
  return canDeleteDocument;
}

export function useHasDocumentPermission() {
  const hasPermission = useAtomValue(hasDocumentPermissionAtom);
  return hasPermission;
}

export function usePageSelectionQueue() {
  const [pageSelectionQueue, setPageSelectionQueue] = useAtom(
    pageSelectionQueueAtom
  );
  return useMemo(
    () => ({ pageSelectionQueue, setPageSelectionQueue }),
    [pageSelectionQueue, setPageSelectionQueue]
  );
}

export function useScrollContainerRef() {
  const [scrollContainerRef, setScrollContainerRef] = useAtom(
    scrollContainerRefAtom
  );
  return useMemo(
    () => ({ scrollContainerRef, setScrollContainerRef }),
    [scrollContainerRef, setScrollContainerRef]
  );
}

export function useTextSearchState() {
  const [textSearchState, setTextSearchState] = useAtom(textSearchStateAtom);
  return useMemo(
    () => ({
      textSearchMatches: textSearchState.matches,
      selectedTextSearchMatchIndex: textSearchState.selectedIndex,
      setTextSearchState,
      setTextSearchMatches: (
        matches: (TextSearchTokenResult | TextSearchSpanResult)[]
      ) => setTextSearchState((prev) => ({ ...prev, matches })),
      setSelectedTextSearchMatchIndex: (selectedIndex: number) =>
        setTextSearchState((prev) => ({ ...prev, selectedIndex })),
    }),
    [textSearchState, setTextSearchState]
  );
}

export function useSearchText() {
  const [searchText, setSearchText] = useAtom(searchTextAtom);
  return useMemo(
    () => ({ searchText, setSearchText }),
    [searchText, setSearchText]
  );
}

/**
 * Hook to handle PDF error state
 * @returns Function to set view state to error
 */
export function useSetViewStateError() {
  const [, setViewStateError] = useAtom(setViewStateErrorAtom);
  return setViewStateError;
}

/**
 * A hook that returns the entire document state, plus methods to perform
 * batch updates and derived permission checks.
 */
export function useDocumentState() {
  const [activeDocument, setActiveDocument] = useAtom(selectedDocumentAtom);

  /**
   * Batch-update the document state to avoid multiple, separate set calls.
   *
   * @param partial partial object to merge into the DocumentState
   */
  function setDocument(partial: Partial<DocumentType>) {
    setActiveDocument((prev) => {
      if (prev === null) {
        return { ...partial } as DocumentType; // Ensure it returns a DocumentType
      }
      return { ...prev, ...partial };
    });
  }

  // Compute permission checks as derived state
  const canUpdateDocument =
    activeDocument?.myPermissions?.includes(PermissionTypes.CAN_UPDATE) ||
    false;
  const canDeleteDocument =
    activeDocument?.myPermissions?.includes(PermissionTypes.CAN_REMOVE) ||
    false;

  /**
   * Helper to check for a given permission type in the document permissions.
   *
   * @param permission a specific PermissionTypes value to be checked
   */
  function hasDocumentPermission(permission: PermissionTypes): boolean {
    return activeDocument?.myPermissions?.includes(permission) || false;
  }

  // Memoize for performance, so consumers don't re-render unnecessarily
  return useMemo(
    () => ({
      // State
      activeDocument,
      setDocument,
      canUpdateDocument,
      canDeleteDocument,
      hasDocumentPermission,
    }),
    [activeDocument, canUpdateDocument, canDeleteDocument]
  );
}

/**
 * Hook to manage document permissions
 * @returns Object containing current permissions and setter functions
 */
export function useDocumentPermissions() {
  const setRawPermissions = useSetAtom(rawPermissionsAtom);
  const currentPermissions = useAtomValue(permissionsAtom);

  return useMemo(
    () => ({
      /** Current processed permissions */
      permissions: currentPermissions,

      /** Permission checks */
      canPublish: currentPermissions.includes(PermissionTypes.CAN_PUBLISH),
      canRemove: currentPermissions.includes(PermissionTypes.CAN_REMOVE),
      canComment: currentPermissions.includes(PermissionTypes.CAN_COMMENT),
      canManagePermissions: currentPermissions.includes(
        PermissionTypes.CAN_PERMISSION
      ),

      /** Set raw permission strings */
      setPermissions: (permissions: string[]) => {
        setRawPermissions(permissions);
      },

      /** Helper to add new permissions */
      addPermissions: (newPermissions: string[]) => {
        setRawPermissions((current) => {
          const uniquePermissions = new Set([...current, ...newPermissions]);
          return Array.from(uniquePermissions);
        });
      },

      /** Helper to remove permissions */
      removePermissions: (permissionsToRemove: string[]) => {
        setRawPermissions((current) =>
          current.filter((p) => !permissionsToRemove.includes(p))
        );
      },

      /** Reset permissions to default (READ only) */
      resetPermissions: () => {
        setRawPermissions(["READ"]);
      },
    }),
    [currentPermissions, setRawPermissions]
  );
}
