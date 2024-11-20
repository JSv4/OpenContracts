import React, { useState } from "react";
import { TokenId, ViewState } from "../../types";
import { CorpusType, DocumentType } from "../../../types/graphql-api";
import { PDFDocumentProxy } from "pdfjs-dist";
import { PDFPageInfo } from "./PDFStore";
import { DocumentContextWrapper } from "./DocumentContextWrapper";
import { UISettingsContextWrapper } from "./UISettingsContextWrapper";

interface AnnotatorContextWrapperProps {
  children: React.ReactNode;
  openedDocument: DocumentType;
  openedCorpus: CorpusType;
}

/**
 * Wrapper component that manages state for both Document and UI Settings contexts
 */
export const AnnotatorContextWrapper = ({
  children,
  openedDocument,
  openedCorpus,
}: AnnotatorContextWrapperProps) => {
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

  // UI Settings states
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(true);
  const [sidebarWidth, setSidebarWidth] = useState<number>(300);

  return (
    <UISettingsContextWrapper
      sidebarVisible={sidebarVisible}
      onSidebarToggle={() => setSidebarVisible(!sidebarVisible)}
      initialWidth={sidebarWidth}
    >
      <DocumentContextWrapper
        openedDocument={openedDocument}
        openedCorpus={openedCorpus}
        docText={docText}
        pageTextMaps={pageTextMaps}
        isLoading={isLoading}
        viewState={viewState}
      >
        {children}
      </DocumentContextWrapper>
    </UISettingsContextWrapper>
  );
};
