import { createContext, useContext } from "react";
import { DocumentType, CorpusType } from "../../../types/graphql-api";
import { PermissionTypes } from "../../types";
import { getPermissions } from "../../../utils/transform";
import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import { TokenId } from "../../types";
import { PDFPageInfo } from "../types/pdf";
import { BoundingBox } from "../types/annotations";

interface DocumentContextType {
  selectedDocument: DocumentType;
  selectedCorpus: CorpusType | null | undefined;
  fileType: string;
  permissions: PermissionTypes[];
  canUpdateDocument: boolean;
  canDeleteDocument: boolean;
  hasDocumentPermission: (permission: PermissionTypes) => boolean;
  docText: string;
  pdfDoc: PDFDocumentProxy | undefined;
  pageTextMaps: Record<number, TokenId> | undefined;
  isLoading: boolean;
  pages: PDFPageInfo[];
  pageSelectionQueue: Record<number, BoundingBox[]>;
  scrollContainerRef: React.RefObject<HTMLDivElement> | undefined;
  setScrollContainerRef: (
    ref: React.RefObject<HTMLDivElement> | undefined
  ) => void;
  pdfPageInfoObjs: Record<number, PDFPageInfo>;
  setPdfPageInfoObjs: (pageInfos: Record<number, PDFPageInfo>) => void;
}

export const DocumentContext = createContext<DocumentContextType | null>(null);

export const useDocumentContext = () => {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error(
      "useDocumentContext must be used within a DocumentProvider"
    );
  }
  return context;
};

export const createDocumentContextValue = (
  selectedDocument: DocumentType,
  selectedCorpus: CorpusType | null | undefined,
  docText: string,
  pdfDoc: PDFDocumentProxy | undefined,
  pageTextMaps: Record<number, TokenId> | undefined,
  isLoading: boolean = false,
  pages: PDFPageInfo[],
  pageSelectionQueue: Record<number, BoundingBox[]>,
  scrollContainerRef: React.RefObject<HTMLDivElement> | undefined,
  setScrollContainerRef: (
    ref: React.RefObject<HTMLDivElement> | undefined
  ) => void,
  pdfPageInfoObjs: Record<number, PDFPageInfo>,
  setPdfPageInfoObjs: (pageInfos: Record<number, PDFPageInfo>) => void
): DocumentContextType => {
  let permissions: PermissionTypes[] = [];
  let rawPermissions = selectedDocument
    ? selectedDocument.myPermissions
    : ["READ"];

  if (selectedDocument && rawPermissions !== undefined) {
    permissions = getPermissions(rawPermissions);
  }

  return {
    selectedDocument,
    selectedCorpus,
    fileType: selectedDocument.fileType || "",
    permissions,
    canUpdateDocument: permissions.includes(PermissionTypes.CAN_UPDATE),
    canDeleteDocument: permissions.includes(PermissionTypes.CAN_REMOVE),
    hasDocumentPermission: (permission: PermissionTypes) =>
      permissions.includes(permission),
    docText,
    pdfDoc,
    pageTextMaps,
    isLoading,
    pages,
    pageSelectionQueue,
    scrollContainerRef,
    setScrollContainerRef,
    pdfPageInfoObjs,
    setPdfPageInfoObjs,
  };
};
