import React, { useState } from "react";
import { TokenId, ViewState } from "../../types";
import { CorpusType, DocumentType } from "../../../types/graphql-api";
import { PDFDocumentProxy } from "pdfjs-dist";
import { DocumentProvider } from "./DocumentContext";
import { PDFPageInfo } from "./PDFStore";

interface DocumentContextWrapperProps {
  children: React.ReactNode;
  openedDocument: DocumentType;
  openedCorpus: CorpusType;
}

/**
 * Wrapper component for DocumentContext that manages document-related state internally
 */
export const DocumentContextWrapper = ({
  children,
  openedDocument,
  openedCorpus,
}: DocumentContextWrapperProps) => {
  // Document content states
  const [docText, setDocText] = useState<string>("");
  const [pageTextMaps, setPageTextMaps] = useState<Record<number, TokenId>>();
  const [documentType, setDocumentType] = useState<string>(
    openedDocument.fileType || ""
  );

  // PDF specific states
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy>();
  const [pages, setPages] = useState<PDFPageInfo[]>([]);

  // Loading states
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [viewState, setViewState] = useState<ViewState>(ViewState.LOADING);

  return (
    <DocumentProvider
      selectedDocument={openedDocument}
      selectedCorpus={openedCorpus}
      docText={docText}
      pageTextMaps={pageTextMaps}
      isLoading={isLoading}
      viewState={viewState}
    >
      {children}
    </DocumentProvider>
  );
};
