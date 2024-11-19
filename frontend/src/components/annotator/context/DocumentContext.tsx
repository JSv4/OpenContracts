import React, { createContext, useContext, useMemo, useState } from "react";
import { getPermissions } from "../../../utils/transform";
import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { PDFPageInfo } from "../types/pdf";
import { BoundingBox } from "../types/annotations";
import { ViewState } from "../types/enums";
import { PermissionTypes, TokenId } from "../../types";
import { CorpusType, DocumentType } from "../../../types/graphql-api";

interface DocumentContextValue {
  // Core document data
  selectedDocument: DocumentType;
  selectedCorpus: CorpusType | null | undefined;
  fileType: string;
  docText: string;

  // PDF specific data
  pdfDoc: PDFDocumentProxy | undefined;
  pages: PDFPageInfo[];
  pageTextMaps: Record<number, TokenId> | undefined;

  // Document state
  isLoading: boolean;
  viewState: ViewState;

  // Permissions
  permissions: PermissionTypes[];
  canUpdateDocument: boolean;
  canDeleteDocument: boolean;
  hasDocumentPermission: (permission: PermissionTypes) => boolean;

  // Page and scroll management
  pageSelectionQueue: Record<number, BoundingBox[]>;
  scrollContainerRef: React.RefObject<HTMLDivElement> | undefined;
  setScrollContainerRef: (
    ref: React.RefObject<HTMLDivElement> | undefined
  ) => void;
  pdfPageInfoObjs: Record<number, PDFPageInfo>;
  setPdfPageInfoObjs: (pageInfos: Record<number, PDFPageInfo>) => void;
}

const DocumentContext = createContext<DocumentContextValue | null>(null);

interface DocumentProviderProps {
  children: React.ReactNode;
  selectedDocument: DocumentType;
  selectedCorpus: CorpusType | null | undefined;
  docText: string;
  pdfDoc: PDFDocumentProxy | undefined;
  pageTextMaps: Record<number, TokenId> | undefined;
  isLoading?: boolean;
  pages: PDFPageInfo[];
  viewState: ViewState;
}

export function DocumentProvider({
  children,
  selectedDocument,
  selectedCorpus,
  docText,
  pdfDoc,
  pageTextMaps,
  isLoading = false,
  pages,
  viewState,
}: DocumentProviderProps) {
  // Add internal state management
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
      selectedDocument,
      selectedCorpus,
      fileType: selectedDocument.fileType || "",
      docText,
      pdfDoc,
      pages,
      pageTextMaps,
      isLoading,
      viewState,
      permissions,
      canUpdateDocument: permissions.includes(PermissionTypes.CAN_UPDATE),
      canDeleteDocument: permissions.includes(PermissionTypes.CAN_REMOVE),
      hasDocumentPermission: (permission: PermissionTypes) =>
        permissions.includes(permission),
      pageSelectionQueue,
      scrollContainerRef,
      setScrollContainerRef,
      pdfPageInfoObjs,
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

export function useDocumentContext() {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error(
      "useDocumentContext must be used within a DocumentProvider"
    );
  }
  return context;
}
