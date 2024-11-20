import React, { createContext, useContext, useMemo, useState } from "react";
import { getPermissions } from "../../../utils/transform";
import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { PDFPageInfo } from "../types/pdf";
import { BoundingBox } from "../types/annotations";
import { ViewState } from "../types/enums";
import { PermissionTypes, TokenId } from "../../types";
import { CorpusType, DocumentType } from "../../../types/graphql-api";

/**
 * Interface defining the shape of the DocumentContext.
 */
interface DocumentContextValue {
  // Core document data
  getSelectedDocument: () => DocumentType;
  setSelectedDocument: (doc: DocumentType) => void;
  getSelectedCorpus: () => CorpusType | null | undefined;
  setSelectedCorpus: (corpus: CorpusType | null | undefined) => void;
  getFileType: () => string;
  setFileType: (type: string) => void;
  getDocText: () => string;
  setDocText: (text: string) => void;

  // PDF specific data
  getPdfDoc: () => PDFDocumentProxy | undefined;
  getPages: () => PDFPageInfo[];
  getPageTextMaps: () => Record<number, TokenId> | undefined;
  getDocumentType: () => string;
  setDocumentType: (type: string) => void;

  // Document state
  getIsLoading: () => boolean;
  setIsLoading: (loading: boolean) => void;
  getViewState: () => ViewState;
  setViewState: (state: ViewState) => void;

  // Permissions
  getPermissions: () => PermissionTypes[];
  getCanUpdateDocument: () => boolean;
  getCanDeleteDocument: () => boolean;
  hasDocumentPermission: (permission: PermissionTypes) => boolean;

  // Page and scroll management
  getPageSelectionQueue: () => Record<number, BoundingBox[]>;
  setPageSelectionQueue: (queue: Record<number, BoundingBox[]>) => void;
  getScrollContainerRef: () => React.RefObject<HTMLDivElement> | undefined;
  setScrollContainerRef: (
    ref: React.RefObject<HTMLDivElement> | undefined
  ) => void;
  getPdfPageInfoObjs: () => Record<number, PDFPageInfo>;
  setPdfPageInfoObjs: (pageInfos: Record<number, PDFPageInfo>) => void;
}

/**
 * Create the DocumentContext.
 */
const DocumentContext = createContext<DocumentContextValue | null>(null);

interface DocumentProviderProps {
  children: React.ReactNode;
  selectedDocument: DocumentType;
  selectedCorpus: CorpusType | null | undefined;
  docText: string;
  pageTextMaps: Record<number, TokenId> | undefined;
  isLoading?: boolean;
  viewState: ViewState;

  // New props being passed from AnnotatorModal
  pdfDoc: PDFDocumentProxy | undefined;
  pages: PDFPageInfo[];
  documentType: string;
}

/**
 * DocumentProvider component that provides document-related context values.
 */
export function DocumentProvider({
  children,
  selectedDocument,
  selectedCorpus,
  docText,
  pageTextMaps,
  isLoading = false,
  viewState: initialViewState,
  pdfDoc,
  pages,
  documentType,
}: DocumentProviderProps) {
  // State management for dynamic values
  const [viewState, setViewState] = useState<ViewState>(initialViewState);

  // Internal state
  const [pageSelectionQueue, setPageSelectionQueue] = useState<
    Record<number, BoundingBox[]>
  >({});
  const [scrollContainerRef, setScrollContainerRef] =
    useState<React.RefObject<HTMLDivElement>>();
  const [pdfPageInfoObjs, setPdfPageInfoObjs] = useState<
    Record<number, PDFPageInfo>
  >({});

  // Process permissions
  const permissions = useMemo(() => {
    const rawPermissions = selectedDocument?.myPermissions ?? ["READ"];
    return getPermissions(rawPermissions);
  }, [selectedDocument?.myPermissions]);

  const value = useMemo(
    () => ({
      // Core document data
      getSelectedDocument: () => selectedDocument,
      setSelectedDocument: () => {},
      getSelectedCorpus: () => selectedCorpus,
      setSelectedCorpus: () => {},
      getFileType: () => selectedDocument.fileType || "",
      setFileType: () => {},
      getDocText: () => docText,
      setDocText: () => {},

      // PDF specific data provided via props
      getPdfDoc: () => pdfDoc,
      getPages: () => pages,
      getPageTextMaps: () => pageTextMaps,
      getDocumentType: () => documentType,
      setDocumentType: () => {},

      // Document state
      getIsLoading: () => isLoading,
      setIsLoading: () => {},
      getViewState: () => viewState,
      setViewState,

      // Permissions
      getPermissions: () => permissions,
      getCanUpdateDocument: () =>
        permissions.includes(PermissionTypes.CAN_UPDATE),
      getCanDeleteDocument: () =>
        permissions.includes(PermissionTypes.CAN_REMOVE),
      hasDocumentPermission: (permission: PermissionTypes) =>
        permissions.includes(permission),

      // Page and scroll management
      getPageSelectionQueue: () => pageSelectionQueue,
      setPageSelectionQueue,
      getScrollContainerRef: () => scrollContainerRef,
      setScrollContainerRef,
      getPdfPageInfoObjs: () => pdfPageInfoObjs,
      setPdfPageInfoObjs,
    }),
    [
      selectedDocument,
      selectedCorpus,
      docText,
      pdfDoc,
      pages,
      pageTextMaps,
      isLoading,
      viewState,
      permissions,
      documentType,
      pageSelectionQueue,
      scrollContainerRef,
      pdfPageInfoObjs,
    ]
  );

  return (
    <DocumentContext.Provider value={value}>
      {children}
    </DocumentContext.Provider>
  );
}

/**
 * Custom hook to use the DocumentContext.
 * @returns DocumentContextValue
 */
export function useDocumentContext() {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error(
      "useDocumentContext must be used within a DocumentProvider"
    );
  }
  return context;
}
