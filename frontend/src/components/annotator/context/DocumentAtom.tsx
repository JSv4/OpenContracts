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
import { CorpusType, DocumentType } from "../../../types/graphql-api";
import { getPermissions } from "../../../utils/transform";
import { RefObject, useEffect, useMemo } from "react";

/**
 * Core document data atoms.
 */
export const selectedDocumentAtom = atom<DocumentType | null>(null);
export const selectedCorpusAtom = atom<CorpusType | null | undefined>(null);
export const fileTypeAtom = atom<string>("");
export const docTextAtom = atom<string>("");

/**
 * PDF-specific data atoms.
 */
export const pdfDocAtom = atom<PDFDocumentProxy | undefined>(undefined);
export const pagesAtom = atom<PDFPageInfo[]>([]);
export const pageTokenTextMapsAtom = atom<Record<number, TokenId>>({});
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
export const scrollContainerRefAtom = atom<
  RefObject<HTMLDivElement> | undefined
>(undefined);

/**
 * Text Search Atoms.
 */
export const searchTextAtom = atom<string>("");
export const textSearchMatchesAtom = atom<
  (TextSearchTokenResult | TextSearchSpanResult)[]
>([]);
export const selectedTextSearchMatchIndexAtom = atom<number>(0);

/**
 * Hook to initialize document state atoms with initial values.
 * @param params Initial values for the document state.
 */
export function useInitializeDocumentAtoms(params: {
  selectedDocument: DocumentType;
  selectedCorpus: CorpusType | null | undefined;
  docText: string;
  pageTextMaps: Record<number, TokenId> | undefined;
  isLoading?: boolean;
  viewState?: ViewState;
  pdfDoc: PDFDocumentProxy | undefined;
  pages: PDFPageInfo[];
  documentType: string;
}) {
  const {
    selectedDocument,
    selectedCorpus,
    docText,
    pageTextMaps,
    isLoading = false,
    viewState = ViewState.LOADING,
    pdfDoc,
    pages,
    documentType,
  } = params;

  const setSelectedDocument = useSetAtom(selectedDocumentAtom);
  const setSelectedCorpus = useSetAtom(selectedCorpusAtom);
  const setFileType = useSetAtom(fileTypeAtom);
  const setDocText = useSetAtom(docTextAtom);
  const setPdfDoc = useSetAtom(pdfDocAtom);
  const setPages = useSetAtom(pagesAtom);
  const setPageTextMaps = useSetAtom(pageTokenTextMapsAtom);
  const setDocumentType = useSetAtom(documentTypeAtom);
  const setIsLoading = useSetAtom(isLoadingAtom);
  const setViewState = useSetAtom(viewStateAtom);
  const setRawPermissions = useSetAtom(rawPermissionsAtom);
  const setPageSelection = useSetAtom(pageSelectionAtom);

  useEffect(() => {
    setSelectedDocument(selectedDocument);
    setSelectedCorpus(selectedCorpus);
    setFileType(selectedDocument.fileType || "");
    setDocText(docText);
    setPdfDoc(pdfDoc);
    setPages(pages);
    setPageTextMaps(pageTextMaps || {});
    setDocumentType(documentType);
    setIsLoading(isLoading);
    setViewState(viewState);
    setRawPermissions(selectedDocument?.myPermissions ?? ["READ"]);
    setPageSelection(undefined); // Initialize page selection as undefined
  }, [
    selectedDocument,
    selectedCorpus,
    docText,
    pdfDoc,
    pages,
    pageTextMaps,
    documentType,
    isLoading,
    viewState,
    setSelectedDocument,
    setSelectedCorpus,
    setFileType,
    setDocText,
    setPdfDoc,
    setPages,
    setPageTextMaps,
    setDocumentType,
    setIsLoading,
    setViewState,
    setRawPermissions,
    setPageSelection,
  ]);
}

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

export function useSelectedCorpus() {
  const [selectedCorpus, setSelectedCorpus] = useAtom(selectedCorpusAtom);
  return useMemo(
    () => ({ selectedCorpus, setSelectedCorpus }),
    [selectedCorpus, setSelectedCorpus]
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

export function useSearchText() {
  const [searchText, setSearchText] = useAtom(searchTextAtom);
  return useMemo(
    () => ({ searchText, setSearchText }),
    [searchText, setSearchText]
  );
}

export function useTextSearchMatches() {
  const [textSearchMatches, setTextSearchMatches] = useAtom(
    textSearchMatchesAtom
  );
  return useMemo(
    () => ({ textSearchMatches, setTextSearchMatches }),
    [textSearchMatches, setTextSearchMatches]
  );
}

export function useSelectedTextSearchMatchIndex() {
  const [selectedTextSearchMatchIndex, setSelectedTextSearchMatchIndex] =
    useAtom(selectedTextSearchMatchIndexAtom);
  return useMemo(
    () => ({
      selectedTextSearchMatchIndex,
      setSelectedTextSearchMatchIndex,
    }),
    [selectedTextSearchMatchIndex, setSelectedTextSearchMatchIndex]
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
