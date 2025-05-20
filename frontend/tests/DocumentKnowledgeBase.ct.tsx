// tests/DocumentKnowledgeBase.ct.tsx
import React from "react";
import path from "path";
import fs from "fs";

/**
 * IMPORTANT TESTING NOTE:
 * Uses a Wrapper component (DocumentKnowledgeBaseTestWrapper.tsx) to encapsulate
 * the MockedProvider and its complex cache setup. This avoids a Playwright component
 * testing serialization issue that causes stack overflows when the cache object
 * is defined directly in the .spec file.
 * See: https://github.com/microsoft/playwright/issues/14681
 */

import { test, expect } from "@playwright/experimental-ct-react";

// Remove Apollo Client imports from here - they are now in the wrapper
// import { MockedProvider, type MockedResponse } from "@apollo/client/testing";
// import { InMemoryCache } from "@apollo/client";
// import { mergeArrayByIdFieldPolicy } from "../src/graphql/cache";
// import { relayStylePagination } from "@apollo/client/utilities";

// Keep query/mutation imports needed for mocks
import { type MockedResponse } from "@apollo/client/testing";
import {
  GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS,
  GET_CONVERSATIONS,
  GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
  GET_CHAT_MESSAGES,
} from "../src/graphql/queries";

// Keep type imports
import type {
  RawDocumentType,
  RawServerAnnotationType,
  ServerAnnotationType,
} from "../src/types/graphql-api";
import { Page } from "@playwright/test";
import { LabelType } from "../src/components/annotator/types/enums";

// Import the new Wrapper component
import { DocumentKnowledgeBaseTestWrapper } from "./DocumentKnowledgeBaseTestWrapper";
// Required for mock annotation permissions
import { PermissionTypes } from "../src/components/types";

// ──────────────────────────────────────────────────────────────────────────────
// │                               Test Data                                   │
// ──────────────────────────────────────────────────────────────────────────────

const PDF_DOC_ID = "pdf-doc-1";
const TXT_DOC_ID = "txt-doc-1";
const CORPUS_ID = "corpus-1";
const MOCK_PDF_URL = `/mock-pdf/${PDF_DOC_ID}/test.pdf`;

// New Document ID for structural annotation test
const PDF_DOC_ID_FOR_STRUCTURAL_TEST = "pdf-doc-structural-test";
const MOCK_PDF_URL_FOR_STRUCTURAL_TEST = `/mock-pdf/${PDF_DOC_ID_FOR_STRUCTURAL_TEST}/test.pdf`;

const TEST_PDF_PATH = path.resolve(
  __dirname,
  "../../frontend/test-assets/test.pdf"
);
const TEST_PAWLS_PATH = path.resolve(
  __dirname,
  "../../frontend/test-assets/test.pawls"
);

console.log("Resolved PAWLS Path:", TEST_PAWLS_PATH);

let mockPawlsDataContent: any;
try {
  const rawContent = fs.readFileSync(TEST_PAWLS_PATH, "utf-8");
  mockPawlsDataContent = JSON.parse(rawContent);
  console.log(`[MOCK PREP] Successfully read and parsed ${TEST_PAWLS_PATH}`);
} catch (err) {
  console.error(
    `[MOCK PREP ERROR] Failed to read or parse ${TEST_PAWLS_PATH}:`,
    err
  );
  mockPawlsDataContent = null;
}

const createPageInfo = (
  hasNext = false,
  hasPrev = false,
  start = "",
  end = ""
) => ({
  __typename: "PageInfo",
  hasNextPage: hasNext,
  hasPreviousPage: hasPrev,
  startCursor: start,
  endCursor: end,
});

const mockPdfDocument: RawDocumentType = {
  id: PDF_DOC_ID,
  __typename: "DocumentType",
  title: "Test PDF Document",
  fileType: "application/pdf",
  pdfFile: MOCK_PDF_URL,
  pawlsParseFile: "test.pawls",
  txtExtractFile: null,
  mdSummaryFile: "dummy-summary.md",
  creator: { __typename: "UserType", id: "user-1", email: "test@test.com" },
  created: new Date("2023-10-26T10:00:00.000Z").toISOString(),
  myPermissions: [
    "read_document",
    "create_document",
    "update_document",
    "remove_document",
  ],
  allAnnotations: [],
  allStructuralAnnotations: [],
  allRelationships: [],
  allDocRelationships: [],
  allNotes: [],
};

// Mock Annotations for Structural Test based on provided examples
const mockAnnotationStructural1: RawServerAnnotationType = {
  // Fields present in the provided example
  id: "QW5ub3RhdGlvblR5cGU6MQ==", // Example ID
  page: 0,
  parent: null,
  annotationLabel: {
    __typename: "AnnotationLabelType",
    id: "QW5ub3RhdGlvbkxhYmVsVHlwZTo0MQ==", // Example ID
    text: "page_header",
    color: "grey",
    icon: "expand" as any, // Cast to any if 'expand' is not a valid SemanticICON
    description: "Parser Structural Label",
    labelType: LabelType.TokenLabel, // Assuming "TOKEN_LABEL" maps to this // Example
  },
  annotationType: LabelType.TokenLabel, // Assuming "TOKEN_LABEL" maps to this
  rawText: "Exhibit 10.1",
  json: {
    "0": {
      bounds: {
        top: 52.19200000000001,
        left: 503.919,
        right: 544.95,
        bottom: 59.35000000000002,
        // page is often part of bounds in other systems, but not in example. Add if needed.
      },
      rawText: "Exhibit 10.1",
      tokensJsons: [
        { pageIndex: 0, tokenIndex: 0 },
        { pageIndex: 0, tokenIndex: 1 },
      ],
    },
  },
  isPublic: true,
  myPermissions: [
    "update_annotation",
    "create_annotation",
    "remove_annotation",
    "publish_annotation",
    "read_annotation",
  ],
  structural: true,
  __typename: "AnnotationType",
  // annotation_created was in example, created/modified is in ServerAnnotationType
};

const mockAnnotationNonStructural1: RawServerAnnotationType = {
  // Fields present in the provided example
  id: "QW5ub3RhdasfasdasdfcGU6MQ==", // Example ID
  page: 0,
  parent: null,
  annotationLabel: {
    __typename: "AnnotationLabelType",
    id: "QW5ub3RhdGlvbkxhYmVsVHlwZTo0MQ==", // Example ID
    text: "page_header",
    color: "grey",
    icon: "expand" as any, // Cast to any if 'expand' is not a valid SemanticICON
    description: "Parser Structural Label",
    labelType: LabelType.TokenLabel, // Assuming "TOKEN_LABEL" maps to this // Example
  },
  annotationType: LabelType.TokenLabel, // Assuming "TOKEN_LABEL" maps to this
  rawText: "Exhibit 10.1",
  json: {
    "0": {
      bounds: {
        top: 52.19200000000001,
        left: 503.919,
        right: 544.95,
        bottom: 59.35000000000002,
        // page is often part of bounds in other systems, but not in example. Add if needed.
      },
      rawText: "Exhibit 10.1",
      tokensJsons: [
        { pageIndex: 0, tokenIndex: 0 },
        { pageIndex: 0, tokenIndex: 1 },
      ],
    },
  },
  myPermissions: [
    "update_annotation",
    "create_annotation",
    "remove_annotation",
    "publish_annotation",
    "read_annotation",
  ],
  isPublic: true,
  structural: false,
  __typename: "AnnotationType",
};

const mockPdfDocumentForStructuralTest: RawDocumentType = {
  id: PDF_DOC_ID,
  __typename: "DocumentType",
  title: "Test PDF Document",
  fileType: "application/pdf",
  pdfFile: MOCK_PDF_URL,
  pawlsParseFile: "test.pawls",
  txtExtractFile: null,
  mdSummaryFile: "dummy-summary.md",
  creator: { __typename: "UserType", id: "user-1", email: "test@test.com" },
  created: new Date("2023-10-26T10:00:00.000Z").toISOString(),
  myPermissions: [
    "read_document",
    "create_document",
    "update_document",
    "remove_document",
  ],
  allAnnotations: [mockAnnotationNonStructural1, mockAnnotationStructural1],
  allStructuralAnnotations: [mockAnnotationStructural1],
  allRelationships: [],
  allDocRelationships: [],
  allNotes: [],
};

const mockTxtDocument: RawDocumentType = {
  ...mockPdfDocument,
  id: TXT_DOC_ID,
  title: "Test TXT Document",
  fileType: "text/plain",
  pdfFile: undefined,
  pawlsParseFile: undefined,
  txtExtractFile: "dummy-txt.txt",
  mdSummaryFile: undefined,
};

const mockCorpusData = {
  id: CORPUS_ID,
  __typename: "CorpusType",
  name: "Test Corpus",
  myPermissions: [
    "read_corpus",
    "create_corpus",
    "update_corpus",
    "remove_corpus",
  ],
  labelSet: {
    __typename: "LabelSetType",
    id: "ls-1",
    allAnnotationLabels: [
      {
        __typename: "AnnotationLabelType",
        id: "lbl-span-1",
        text: "Person",
        labelType: LabelType.TokenLabel,
        color: "#FF0000",
        icon: undefined,
        description: "A person entity",
      },
      {
        __typename: "AnnotationLabelType",
        id: "lbl-rel-1",
        text: "Connects",
        labelType: LabelType.RelationshipLabel,
        color: "#00FF00",
        icon: undefined,
        description: "A connection relationship",
      },
      {
        __typename: "AnnotationLabelType",
        id: "lbl-doc-1",
        text: "Contract",
        labelType: LabelType.DocTypeLabel,
        color: "#0000FF",
        icon: undefined,
        description: "A contract document type",
      },
    ],
  },
};

// Define mocks needed by the tests
const graphqlMocks: ReadonlyArray<MockedResponse> = [
  // ... (keep all existing mocks as they are) ...
  // --- Add mock for the unexpected initial call with empty documentId ---
  {
    request: {
      query: GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
      variables: { documentId: "", corpusId: CORPUS_ID }, // Match the empty string call
    },
    result: {
      data: {
        documentCorpusActions: {
          __typename: "DocumentCorpusActionsType",
          corpusActions: {
            __typename: "CorpusActionsType",
            extracts: {
              __typename: "ExtractTypeConnection",
              edges: [],
              pageInfo: createPageInfo(),
            },
            analyses: {
              __typename: "AnalysisTypeConnection",
              edges: [],
              pageInfo: createPageInfo(),
            },
          },
          extracts: [],
          analysisRows: [],
        },
      },
    },
  },
  // 1) Original knowledge+annotations query for PDF (First call)
  {
    request: {
      query: GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS,
      variables: {
        documentId: PDF_DOC_ID,
        corpusId: CORPUS_ID,
        analysisId: undefined,
      },
    },
    result: { data: { document: mockPdfDocument, corpus: mockCorpusData } },
  },
  // --- Add the PDF knowledge+annotations query AGAIN for the refetch ---
  {
    request: {
      query: GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS,
      variables: {
        documentId: PDF_DOC_ID,
        corpusId: CORPUS_ID,
        analysisId: undefined, // Assuming refetch doesn't add analysisId initially
      },
    },
    result: { data: { document: mockPdfDocument, corpus: mockCorpusData } }, // Same result
  },
  // 2) Original knowledge+annotations query for TXT
  {
    request: {
      query: GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS,
      variables: {
        documentId: TXT_DOC_ID,
        corpusId: CORPUS_ID,
        analysisId: undefined,
      },
    },
    result: { data: { document: mockTxtDocument, corpus: mockCorpusData } },
  },
  // 3) CORRECTED: Stub for Analyses/Extracts (documentCorpusActions) - PDF
  {
    request: {
      query: GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
      variables: { documentId: PDF_DOC_ID, corpusId: CORPUS_ID },
    },
    result: {
      data: {
        documentCorpusActions: {
          __typename: "DocumentCorpusActionsType",
          corpusActions: [],
          extracts: [],
          analysisRows: [],
        },
      },
    },
  },
  // 3b) Stub for Analyses/Extracts (documentCorpusActions) - TXT
  {
    request: {
      query: GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
      variables: { documentId: TXT_DOC_ID, corpusId: CORPUS_ID },
    },
    result: {
      data: {
        documentCorpusActions: {
          __typename: "DocumentCorpusActionsType",
          corpusActions: [],
          extracts: [],
          analysisRows: [],
        },
      },
    },
  },
  // 4) Stub for GetConversations - PDF
  {
    request: {
      query: GET_CONVERSATIONS,
      variables: {
        documentId: PDF_DOC_ID,
        limit: undefined,
        cursor: undefined,
        title_Contains: undefined,
        createdAt_Gte: undefined,
        createdAt_Lte: undefined,
      },
    },
    result: {
      data: {
        conversations: {
          __typename: "ConversationTypeConnection",
          edges: [],
          pageInfo: createPageInfo(),
        },
      },
    },
  },
  // 4b) Stub for GetConversations - TXT
  {
    request: {
      query: GET_CONVERSATIONS,
      variables: {
        documentId: TXT_DOC_ID,
        limit: undefined,
        cursor: undefined,
        title_Contains: undefined,
        createdAt_Gte: undefined,
        createdAt_Lte: undefined,
      },
    },
    result: {
      data: {
        conversations: {
          __typename: "ConversationTypeConnection",
          edges: [],
          pageInfo: createPageInfo(),
        },
      },
    },
  },
  // Add a mock variant for GET_DOCUMENT_ANALYSES_AND_EXTRACTS with only documentId
  {
    request: {
      query: GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
      variables: { documentId: PDF_DOC_ID }, // Only documentId
    },
    result: {
      // Provide the same minimal successful result structure
      data: {
        documentCorpusActions: {
          __typename: "DocumentCorpusActionsType",
          corpusActions: [],
          extracts: [],
          analysisRows: [],
        },
      },
    },
  },
  // --- Mocks for Structural Annotation Test Document ---
  {
    request: {
      query: GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS,
      variables: {
        documentId: PDF_DOC_ID_FOR_STRUCTURAL_TEST,
        corpusId: CORPUS_ID,
        analysisId: undefined,
      },
    },
    result: {
      data: {
        document: mockPdfDocumentForStructuralTest,
        corpus: mockCorpusData,
      },
    },
  },
  // Duplicate for potential refetch
  {
    request: {
      query: GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS,
      variables: {
        documentId: PDF_DOC_ID_FOR_STRUCTURAL_TEST,
        corpusId: CORPUS_ID,
        analysisId: undefined,
      },
    },
    result: {
      data: {
        document: mockPdfDocumentForStructuralTest,
        corpus: mockCorpusData,
      },
    },
  },
  // Analyses/Extracts for Structural Test Document
  {
    request: {
      query: GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
      variables: {
        documentId: PDF_DOC_ID_FOR_STRUCTURAL_TEST,
        corpusId: CORPUS_ID,
      },
    },
    result: {
      data: {
        documentCorpusActions: {
          __typename: "DocumentCorpusActionsType",
          corpusActions: [],
          extracts: [],
          analysisRows: [],
        },
      },
    },
  },
  // Conversations for Structural Test Document
  {
    request: {
      query: GET_CONVERSATIONS,
      variables: {
        documentId: PDF_DOC_ID_FOR_STRUCTURAL_TEST,
        limit: undefined,
        cursor: undefined,
        title_Contains: undefined,
        createdAt_Gte: undefined,
        createdAt_Lte: undefined,
      },
    },
    result: {
      data: {
        conversations: {
          __typename: "ConversationTypeConnection",
          edges: [],
          pageInfo: createPageInfo(),
        },
      },
    },
  },
];

const CHAT_MESSAGES_PAYLOAD = {
  conversations: {
    edges: [
      {
        node: {
          id: "Q29udmVyc2F0aW9uVHlwZToz",
          title: "Transfer Taxes in Document Analysis",
          createdAt: "2025-05-19T05:23:56.913169+00:00",
          updatedAt: "2025-05-19T05:23:58.482189+00:00",
          creator: {
            id: "VXNlclR5cGU6Mw==",
            email: "scrudato@umich.edu",
            __typename: "UserType",
          },
          chatMessages: {
            totalCount: 2,
            __typename: "MessageTypeConnection",
          },
          isPublic: false,
          myPermissions: [],
          __typename: "ConversationType",
        },
        __typename: "ConversationTypeEdge",
      },
      {
        node: {
          id: "Q29udmVyc2F0aW9uVHlwZToy",
          title: "Transfer Taxes in Document Analysis",
          createdAt: "2025-05-19T05:17:30.973110+00:00",
          updatedAt: "2025-05-19T05:17:32.044191+00:00",
          creator: {
            id: "VXNlclR5cGU6Mw==",
            email: "scrudato@umich.edu",
            __typename: "UserType",
          },
          chatMessages: {
            totalCount: 2,
            __typename: "MessageTypeConnection",
          },
          isPublic: false,
          myPermissions: [],
          __typename: "ConversationType",
        },
        __typename: "ConversationTypeEdge",
      },
      {
        node: {
          id: "Q29udmVyc2F0aW9uVHlwZTox",
          title: "Tax Transfers Document Summary",
          createdAt: "2025-05-19T04:33:00.003664+00:00",
          updatedAt: "2025-05-19T04:33:02.400566+00:00",
          creator: {
            id: "VXNlclR5cGU6Mw==",
            email: "scrudato@umich.edu",
            __typename: "UserType",
          },
          chatMessages: {
            totalCount: 2,
            __typename: "MessageTypeConnection",
          },
          isPublic: false,
          myPermissions: [],
          __typename: "ConversationType",
        },
        __typename: "ConversationTypeEdge",
      },
    ],
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: "YXJyYXljb25uZWN0aW9uOjA=",
      endCursor: "YXJyYXljb25uZWN0aW9uOjI=",
      __typename: "PageInfo",
    },
    __typename: "ConversationTypeConnection",
  },
};

const chatTrayMocks = [
  /* conversations list ------------------------------------------------- */
  {
    request: {
      query: GET_CONVERSATIONS,
      variables: {
        documentId: PDF_DOC_ID,
        corpusId: CORPUS_ID,
        limit: undefined,
        cursor: undefined,
        title_Contains: undefined,
        createdAt_Gte: undefined,
        createdAt_Lte: undefined,
      },
    },
    result: {
      data: CHAT_MESSAGES_PAYLOAD,
    },
  },

  /* chat messages for the first conversation -------------------------- */
  /*  variants: without orderBy and with `orderBy: null` (robust match) */
  ...[undefined, null].map((orderBy) => ({
    request: {
      query: GET_CHAT_MESSAGES,
      variables: {
        conversationId: "Q29udmVyc2F0aW9uVHlwZToz", // first conv edge
        orderBy,
      },
    },
    result: {
      data: {
        chatMessages: [
          {
            id: "TWVzc2FnZVR5cGU6NQ==",
            msgType: "HUMAN",
            content: "What does this document say about Transfer Taxes?",
            data: {},
            __typename: "MessageType",
          },
          {
            id: "TWVzc2FnZVR5cGU6Ng==",
            msgType: "LLM",
            content:
              "The document specifies that Transfer Taxes, which include transfer, sales, value added, stamp duty, and similar taxes, are handled as follows:\n\n- **U.S. Government Taxes**: These are to be borne by ETON.\n- **Ex-U.S. Government Taxes**: These are to be borne by Aucta.",
            data: {
              sources: [
                {
                  json: {
                    "11": {
                      bounds: {
                        top: 168.97299999999996,
                        left: 50.05,
                        right: 131.481,
                        bottom: 176.13099999999997,
                      },
                      rawText: "10. TRANSFER TAXES",
                      tokensJsons: [
                        {
                          pageIndex: 11,
                          tokenIndex: 216,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 217,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 218,
                        },
                      ],
                    },
                  },
                  page: 11,
                  label: "section_header",
                  rawText: "10. TRANSFER TAXES",
                  label_id: 43,
                  bounding_box: {
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  },
                  annotation_id: 149,
                },
                {
                  json: {
                    "11": {
                      bounds: {
                        top: 179.07299999999998,
                        left: 50.05,
                        right: 544.95,
                        bottom: 207.02200000000005,
                      },
                      rawText:
                        "All transfer, sales, value added, stamp duty and similar Taxes (' Transfer Taxes ') payable to the U.S. government in connection with the transaction contemplated hereby will be borne by ETON and all Transfer Taxes payable to an ex-U.S. government in connection with the transaction contemplated hereby will be borne by Aucta.",
                      tokensJsons: [
                        {
                          pageIndex: 11,
                          tokenIndex: 219,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 220,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 221,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 222,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 223,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 224,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 225,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 226,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 227,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 228,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 229,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 230,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 231,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 232,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 233,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 234,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 235,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 236,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 237,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 238,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 239,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 240,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 241,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 242,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 243,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 244,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 245,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 246,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 247,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 248,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 249,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 250,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 251,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 252,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 253,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 254,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 255,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 256,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 257,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 258,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 259,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 260,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 261,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 262,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 263,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 264,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 265,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 266,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 267,
                        },
                        {
                          pageIndex: 11,
                          tokenIndex: 268,
                        },
                      ],
                    },
                  },
                  page: 11,
                  label: "text",
                  rawText:
                    "All transfer, sales, value added, stamp duty and similar Taxes (' Transfer Taxes ') payable to the U.S. government in connection with the transaction contemplated hereby will be borne by ETON and all Transfer Taxes payable to an ex-U.S. government in connection with the transaction contemplated hereby will be borne by Aucta.",
                  label_id: 42,
                  bounding_box: {
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  },
                  annotation_id: 150,
                },
                {
                  json: {
                    "4": {
                      bounds: {
                        top: 99.53599999999994,
                        left: 80.35,
                        right: 412.388,
                        bottom: 106.69399999999996,
                      },
                      rawText:
                        "1.40 ' Transfer Taxes ' shall have the meaning ascribed to this term in Section 10 of this Agreement.",
                      tokensJsons: [
                        {
                          pageIndex: 4,
                          tokenIndex: 72,
                        },
                        {
                          pageIndex: 4,
                          tokenIndex: 73,
                        },
                        {
                          pageIndex: 4,
                          tokenIndex: 74,
                        },
                        {
                          pageIndex: 4,
                          tokenIndex: 75,
                        },
                        {
                          pageIndex: 4,
                          tokenIndex: 76,
                        },
                        {
                          pageIndex: 4,
                          tokenIndex: 77,
                        },
                        {
                          pageIndex: 4,
                          tokenIndex: 78,
                        },
                        {
                          pageIndex: 4,
                          tokenIndex: 79,
                        },
                        {
                          pageIndex: 4,
                          tokenIndex: 80,
                        },
                        {
                          pageIndex: 4,
                          tokenIndex: 81,
                        },
                        {
                          pageIndex: 4,
                          tokenIndex: 82,
                        },
                        {
                          pageIndex: 4,
                          tokenIndex: 83,
                        },
                        {
                          pageIndex: 4,
                          tokenIndex: 84,
                        },
                        {
                          pageIndex: 4,
                          tokenIndex: 85,
                        },
                        {
                          pageIndex: 4,
                          tokenIndex: 86,
                        },
                        {
                          pageIndex: 4,
                          tokenIndex: 87,
                        },
                        {
                          pageIndex: 4,
                          tokenIndex: 88,
                        },
                      ],
                    },
                  },
                  page: 4,
                  label: "list_item",
                  rawText:
                    "1.40 ' Transfer Taxes ' shall have the meaning ascribed to this term in Section 10 of this Agreement.",
                  label_id: 44,
                  bounding_box: {
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  },
                  annotation_id: 64,
                },
                {
                  json: {
                    "3": {
                      bounds: {
                        top: 193.59199999999998,
                        left: 50.05,
                        right: 544.95,
                        bottom: 261.942,
                      },
                      rawText:
                        "1.35 ' Taxes ' means taxes, duties, fees, premiums, assessments, imposts, levies and other charges of any kind whatsoever imposed by any Governmental Entity, including all interest, penalties, fines, additions to tax or other additional amounts imposed by any Governmental Entity in respect thereof, and including those levied on, or measured by, or referred to as, income, gross receipts, profits, capital, transfer, land transfer, sales, goods and services, harmonized sales, use, value-added, excise, stamp, withholding, business, franchising, property, development, occupancy, employer health, payroll, employment, health, social services, education and social security taxes, all surtaxes, all customs duties and import and export taxes, countervail and anti-dumping, all license, franchise and registration fees and all employment insurance, health insurance and government pension plan premiums or contributions.",
                      tokensJsons: [
                        {
                          pageIndex: 3,
                          tokenIndex: 205,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 206,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 207,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 208,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 209,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 210,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 211,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 212,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 213,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 214,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 215,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 216,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 217,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 218,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 219,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 220,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 221,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 222,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 223,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 224,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 225,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 226,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 227,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 228,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 229,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 230,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 231,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 232,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 233,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 234,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 235,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 236,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 237,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 238,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 239,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 240,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 241,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 242,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 243,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 244,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 245,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 246,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 247,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 248,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 249,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 250,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 251,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 252,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 253,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 254,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 255,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 256,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 257,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 258,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 259,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 260,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 261,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 262,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 263,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 264,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 265,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 266,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 267,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 268,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 269,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 270,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 271,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 272,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 273,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 274,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 275,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 276,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 277,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 278,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 279,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 280,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 281,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 282,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 283,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 284,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 285,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 286,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 287,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 288,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 289,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 290,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 291,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 292,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 293,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 294,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 295,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 296,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 297,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 298,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 299,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 300,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 301,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 302,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 303,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 304,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 305,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 306,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 307,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 308,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 309,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 310,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 311,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 312,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 313,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 314,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 315,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 316,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 317,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 318,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 319,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 320,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 321,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 322,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 323,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 324,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 325,
                        },
                        {
                          pageIndex: 3,
                          tokenIndex: 326,
                        },
                      ],
                    },
                  },
                  page: 3,
                  label: "list_item",
                  rawText:
                    "1.35 ' Taxes ' means taxes, duties, fees, premiums, assessments, imposts, levies and other charges of any kind whatsoever imposed by any Governmental Entity, including all interest, penalties, fines, additions to tax or other additional amounts imposed by any Governmental Entity in respect thereof, and including those levied on, or measured by, or referred to as, income, gross receipts, profits, capital, transfer, land transfer, sales, goods and services, harmonized sales, use, value-added, excise, stamp, withholding, business, franchising, property, development, occupancy, employer health, payroll, employment, health, social services, education and social security taxes, all surtaxes, all customs duties and import and export taxes, countervail and anti-dumping, all license, franchise and registration fees and all employment insurance, health insurance and government pension plan premiums or contributions.",
                  label_id: 44,
                  bounding_box: {
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  },
                  annotation_id: 56,
                },
                {
                  json: {
                    "8": {
                      bounds: {
                        top: 57.24199999999996,
                        left: 50.05,
                        right: 544.95,
                        bottom: 114.86000000000001,
                      },
                      rawText:
                        "6.6 Taxes. Each Party shall be responsible for and shall pay all Taxes payable on any income earned or received by it during the Term. Where required by law, ETON shall have the right to withhold applicable Taxes from any payments to be made hereunder by ETON to Aucta. Any Tax, duty or other levy paid or required to be withheld by ETON on account of any payments payable to Aucta under this Agreement shall be deducted from the amount of payments due to Aucta. ETON shall secure and promptly send to Aucta proof of such Taxes, duties or other levies withheld and paid by ETON for the benefit of Aucta. Each Party agrees to cooperate with the other Party in claiming exemptions from such deductions or withholdings under any agreement or treaty from time to time in effect.",
                      tokensJsons: [
                        {
                          pageIndex: 8,
                          tokenIndex: 1,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 2,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 3,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 4,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 5,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 6,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 7,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 8,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 9,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 10,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 11,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 12,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 13,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 14,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 15,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 16,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 17,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 18,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 19,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 20,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 21,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 22,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 23,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 24,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 25,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 26,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 27,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 28,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 29,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 30,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 31,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 32,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 33,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 34,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 35,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 36,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 37,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 38,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 39,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 40,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 41,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 42,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 43,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 44,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 45,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 46,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 47,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 48,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 49,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 50,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 51,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 52,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 53,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 54,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 55,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 56,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 57,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 58,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 59,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 60,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 61,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 62,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 63,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 64,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 65,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 66,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 67,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 68,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 69,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 70,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 71,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 72,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 73,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 74,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 75,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 76,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 77,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 78,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 79,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 80,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 81,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 82,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 83,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 84,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 85,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 86,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 87,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 88,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 89,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 90,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 91,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 92,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 93,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 94,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 95,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 96,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 97,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 98,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 99,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 100,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 101,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 102,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 103,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 104,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 105,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 106,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 107,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 108,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 109,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 110,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 111,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 112,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 113,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 114,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 115,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 116,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 117,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 118,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 119,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 120,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 121,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 122,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 123,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 124,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 125,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 126,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 127,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 128,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 129,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 130,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 131,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 132,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 133,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 134,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 135,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 136,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 137,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 138,
                        },
                        {
                          pageIndex: 8,
                          tokenIndex: 139,
                        },
                      ],
                    },
                  },
                  page: 8,
                  label: "text",
                  rawText:
                    "6.6 Taxes. Each Party shall be responsible for and shall pay all Taxes payable on any income earned or received by it during the Term. Where required by law, ETON shall have the right to withhold applicable Taxes from any payments to be made hereunder by ETON to Aucta. Any Tax, duty or other levy paid or required to be withheld by ETON on account of any payments payable to Aucta under this Agreement shall be deducted from the amount of payments due to Aucta. ETON shall secure and promptly send to Aucta proof of such Taxes, duties or other levies withheld and paid by ETON for the benefit of Aucta. Each Party agrees to cooperate with the other Party in claiming exemptions from such deductions or withholdings under any agreement or treaty from time to time in effect.",
                  label_id: 42,
                  bounding_box: {
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  },
                  annotation_id: 121,
                },
                {
                  json: {
                    "20": {
                      bounds: {
                        top: 158.24199999999996,
                        left: 50.05,
                        right: 544.95,
                        bottom: 215.86,
                      },
                      rawText:
                        "15.8 Assignment. The terms and provisions hereof shall inure to the benefit of, and be binding upon the Parties and their respective successors and permitted assigns. The Parties shall not assign, encumber or otherwise transfer this Agreement or any part of it to any Third Party, without the prior written consent of the other Party. Notwithstanding the foregoing, each Party may assign the rights and obligations under this Agreement in whole, without consent of the other Party, to a Third Party or Affiliate in connection with the transfer or sale of all or substantially all of its business or in the event of a merger, consolidation or change in control provided that the assignee assumes in writing and becomes directly obligated to the other Party to perform all of the obligations of assignor under this Agreement.",
                      tokensJsons: [
                        {
                          pageIndex: 20,
                          tokenIndex: 174,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 175,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 176,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 177,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 178,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 179,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 180,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 181,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 182,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 183,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 184,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 185,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 186,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 187,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 188,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 189,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 190,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 191,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 192,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 193,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 194,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 195,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 196,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 197,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 198,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 199,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 200,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 201,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 202,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 203,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 204,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 205,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 206,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 207,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 208,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 209,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 210,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 211,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 212,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 213,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 214,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 215,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 216,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 217,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 218,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 219,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 220,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 221,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 222,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 223,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 224,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 225,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 226,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 227,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 228,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 229,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 230,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 231,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 232,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 233,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 234,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 235,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 236,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 237,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 238,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 239,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 240,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 241,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 242,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 243,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 244,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 245,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 246,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 247,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 248,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 249,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 250,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 251,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 252,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 253,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 254,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 255,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 256,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 257,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 258,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 259,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 260,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 261,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 262,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 263,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 264,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 265,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 266,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 267,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 268,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 269,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 270,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 271,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 272,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 273,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 274,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 275,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 276,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 277,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 278,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 279,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 280,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 281,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 282,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 283,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 284,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 285,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 286,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 287,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 288,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 289,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 290,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 291,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 292,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 293,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 294,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 295,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 296,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 297,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 298,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 299,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 300,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 301,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 302,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 303,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 304,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 305,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 306,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 307,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 308,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 309,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 310,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 311,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 312,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 313,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 314,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 315,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 316,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 317,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 318,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 319,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 320,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 321,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 322,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 323,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 324,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 325,
                        },
                        {
                          pageIndex: 20,
                          tokenIndex: 326,
                        },
                      ],
                    },
                  },
                  page: 20,
                  label: "list_item",
                  rawText:
                    "15.8 Assignment. The terms and provisions hereof shall inure to the benefit of, and be binding upon the Parties and their respective successors and permitted assigns. The Parties shall not assign, encumber or otherwise transfer this Agreement or any part of it to any Third Party, without the prior written consent of the other Party. Notwithstanding the foregoing, each Party may assign the rights and obligations under this Agreement in whole, without consent of the other Party, to a Third Party or Affiliate in connection with the transfer or sale of all or substantially all of its business or in the event of a merger, consolidation or change in control provided that the assignee assumes in writing and becomes directly obligated to the other Party to perform all of the obligations of assignor under this Agreement.",
                  label_id: 44,
                  bounding_box: {
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  },
                  annotation_id: 253,
                },
                {
                  json: {
                    "2": {
                      bounds: {
                        top: 204.95399999999995,
                        left: 50.05,
                        right: 544.95,
                        bottom: 324.43499999999995,
                      },
                      rawText:
                        "1.26 ' Net Sales ' means, with respect to each Product sold in the Territory, the aggregate gross sales amount invoiced by ETON or any sublicensee or other party authorized by ETON to wholesale or distribute the Products on an arms-length basis to Third Parties in the Territory (' Gross Sales '), less (as applicable) the following ETON expenses as accrued and adjusted for amounts actually taken, consistent with ETON'S standard accounting practices in accordance with GAAP: (a) amounts refunded or credited for returned, damaged, outdated, short-dated or defective goods, and bad debts, and (b) all of the following: (i) taxes, duties and other governmental charges related to the production, use or sale of the Products (including, including without limitation the brand manufacturer's tax imposed pursuant to the Patient Protection and Affordable Care Act (Pub. L. No. 111-148) as amended or replaced, but not including taxes assessed against the income derived from such sale)\u037e (ii) trade, quantity and cash discounts, allowances, retroactive price adjustments, credit incentive payments, chargebacks, patient support programs, and rebates (including governmental rebates or other price reductions provided, based on sales by ETON to any Governmental Entity or regulatory authority in respect of state or federal Medicare, Medicaid, government pricing or similar programs\u037e)\u037e and (iii) any costs incurred in connection with or arising out of compliance with any Risk Evaluation and Mitigation Strategies approved by the FDA and (iv) any expenses associated with serialization of the Products. Distribution of Licensed Products for clinical trials or as samples will not be deemed a 'Net Sale' under this definition.",
                      tokensJsons: [
                        {
                          pageIndex: 2,
                          tokenIndex: 207,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 208,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 209,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 210,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 211,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 212,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 213,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 214,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 215,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 216,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 217,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 218,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 219,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 220,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 221,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 222,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 223,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 224,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 225,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 226,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 227,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 228,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 229,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 230,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 231,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 232,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 233,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 234,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 235,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 236,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 237,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 238,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 239,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 240,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 241,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 242,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 243,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 244,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 245,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 246,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 247,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 248,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 249,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 250,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 251,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 252,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 253,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 254,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 255,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 256,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 257,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 258,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 259,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 260,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 261,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 262,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 263,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 264,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 265,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 266,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 267,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 268,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 269,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 270,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 271,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 272,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 273,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 274,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 275,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 276,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 277,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 278,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 279,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 280,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 281,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 282,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 283,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 284,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 285,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 286,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 287,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 288,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 289,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 290,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 291,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 292,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 293,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 294,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 295,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 296,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 297,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 298,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 299,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 300,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 301,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 302,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 303,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 304,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 305,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 306,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 307,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 308,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 309,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 310,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 311,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 312,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 313,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 314,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 315,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 316,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 317,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 318,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 319,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 320,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 321,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 322,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 323,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 324,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 325,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 326,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 327,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 328,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 329,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 330,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 331,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 332,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 333,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 334,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 335,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 336,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 337,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 338,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 339,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 340,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 341,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 342,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 343,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 344,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 345,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 346,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 347,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 348,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 349,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 350,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 351,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 352,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 353,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 354,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 355,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 356,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 357,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 358,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 359,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 360,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 361,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 362,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 363,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 364,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 365,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 366,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 367,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 368,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 369,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 370,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 371,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 372,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 373,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 374,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 375,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 376,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 377,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 378,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 379,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 380,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 381,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 382,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 383,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 384,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 385,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 386,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 387,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 388,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 389,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 390,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 391,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 392,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 393,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 394,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 395,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 396,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 397,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 398,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 399,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 400,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 401,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 402,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 403,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 404,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 405,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 406,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 407,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 408,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 409,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 410,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 411,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 412,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 413,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 414,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 415,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 416,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 417,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 418,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 419,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 420,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 421,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 422,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 423,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 424,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 425,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 426,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 427,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 428,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 429,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 430,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 431,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 432,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 433,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 434,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 435,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 436,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 437,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 438,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 439,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 440,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 441,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 442,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 443,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 444,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 445,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 446,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 447,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 448,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 449,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 450,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 451,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 452,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 453,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 454,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 455,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 456,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 457,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 458,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 459,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 460,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 461,
                        },
                        {
                          pageIndex: 2,
                          tokenIndex: 462,
                        },
                      ],
                    },
                  },
                  page: 2,
                  label: "text",
                  rawText:
                    "1.26 ' Net Sales ' means, with respect to each Product sold in the Territory, the aggregate gross sales amount invoiced by ETON or any sublicensee or other party authorized by ETON to wholesale or distribute the Products on an arms-length basis to Third Parties in the Territory (' Gross Sales '), less (as applicable) the following ETON expenses as accrued and adjusted for amounts actually taken, consistent with ETON'S standard accounting practices in accordance with GAAP: (a) amounts refunded or credited for returned, damaged, outdated, short-dated or defective goods, and bad debts, and (b) all of the following: (i) taxes, duties and other governmental charges related to the production, use or sale of the Products (including, including without limitation the brand manufacturer's tax imposed pursuant to the Patient Protection and Affordable Care Act (Pub. L. No. 111-148) as amended or replaced, but not including taxes assessed against the income derived from such sale)\u037e (ii) trade, quantity and cash discounts, allowances, retroactive price adjustments, credit incentive payments, chargebacks, patient support programs, and rebates (including governmental rebates or other price reductions provided, based on sales by ETON to any Governmental Entity or regulatory authority in respect of state or federal Medicare, Medicaid, government pricing or similar programs\u037e)\u037e and (iii) any costs incurred in connection with or arising out of compliance with any Risk Evaluation and Mitigation Strategies approved by the FDA and (iv) any expenses associated with serialization of the Products. Distribution of Licensed Products for clinical trials or as samples will not be deemed a 'Net Sale' under this definition.",
                  label_id: 42,
                  bounding_box: {
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  },
                  annotation_id: 44,
                },
                {
                  json: {
                    "7": {
                      bounds: {
                        top: 107.74300000000005,
                        left: 61.412,
                        right: 544.95,
                        bottom: 135.06100000000004,
                      },
                      rawText:
                        "6.3.3 If the amount of royalty payment under Section 6.3.1 is less than the amount of royalty payment under Section 6.3.2, then ETON shall pay Aucta the difference between royalty payments in Sections 6.3.1 and 6.3.2 within sixty (60) days of the calendar year end, but in no event shall the difference paid be greater than the minimum amount in Section 6.3.2.",
                      tokensJsons: [
                        {
                          pageIndex: 7,
                          tokenIndex: 67,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 68,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 69,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 70,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 71,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 72,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 73,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 74,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 75,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 76,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 77,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 78,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 79,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 80,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 81,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 82,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 83,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 84,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 85,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 86,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 87,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 88,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 89,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 90,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 91,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 92,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 93,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 94,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 95,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 96,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 97,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 98,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 99,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 100,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 101,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 102,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 103,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 104,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 105,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 106,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 107,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 108,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 109,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 110,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 111,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 112,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 113,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 114,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 115,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 116,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 117,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 118,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 119,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 120,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 121,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 122,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 123,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 124,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 125,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 126,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 127,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 128,
                        },
                      ],
                    },
                  },
                  page: 7,
                  label: "text",
                  rawText:
                    "6.3.3 If the amount of royalty payment under Section 6.3.1 is less than the amount of royalty payment under Section 6.3.2, then ETON shall pay Aucta the difference between royalty payments in Sections 6.3.1 and 6.3.2 within sixty (60) days of the calendar year end, but in no event shall the difference paid be greater than the minimum amount in Section 6.3.2.",
                  label_id: 42,
                  bounding_box: {
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  },
                  annotation_id: 111,
                },
                {
                  json: {
                    "7": {
                      bounds: {
                        top: 87.543,
                        left: 122.013,
                        right: 420.594,
                        bottom: 94.66099999999994,
                      },
                      rawText:
                        "6.3.1 ETON shall pay to Aucta a royalty payment of [ * * * ] of Net Sales of the Products.",
                      tokensJsons: [
                        {
                          pageIndex: 7,
                          tokenIndex: 40,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 41,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 42,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 43,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 44,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 45,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 46,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 47,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 48,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 49,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 50,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 51,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 52,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 53,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 54,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 55,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 56,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 57,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 58,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 59,
                        },
                        {
                          pageIndex: 7,
                          tokenIndex: 60,
                        },
                      ],
                    },
                  },
                  page: 7,
                  label: "text",
                  rawText:
                    "6.3.1 ETON shall pay to Aucta a royalty payment of [ * * * ] of Net Sales of the Products.",
                  label_id: 42,
                  bounding_box: {
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  },
                  annotation_id: 109,
                },
                {
                  json: {
                    "15": {
                      bounds: {
                        top: 87.54200000000003,
                        left: 61.412,
                        right: 544.95,
                        bottom: 104.75999999999999,
                      },
                      rawText:
                        "12.2.1  it has the corporate power and authority to enter into this Agreement and to consummate the transactions contemplated hereby\u037e",
                      tokensJsons: [
                        {
                          pageIndex: 15,
                          tokenIndex: 44,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 45,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 46,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 47,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 48,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 49,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 50,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 51,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 52,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 53,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 54,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 55,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 56,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 57,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 58,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 59,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 60,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 61,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 62,
                        },
                        {
                          pageIndex: 15,
                          tokenIndex: 63,
                        },
                      ],
                    },
                  },
                  page: 15,
                  label: "text",
                  rawText:
                    "12.2.1  it has the corporate power and authority to enter into this Agreement and to consummate the transactions contemplated hereby\u037e",
                  label_id: 42,
                  bounding_box: {
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                  },
                  annotation_id: 187,
                },
              ],
              message_id: 6,
            },
            __typename: "MessageType",
          },
        ],
      },
    },
  })),
  /* chat messages – initial load + a possible refetch ---------------- */
  ...Array.from({ length: 2 }).map(() => ({
    request: {
      query: GET_CHAT_MESSAGES,
      variables: {
        conversationId: "Q29udmVyc2F0aW9uVHlwZToz", // first conv edge
        limit: 10, // ← added field
      },
    },
    result: { data: CHAT_MESSAGES_PAYLOAD },
  })),
];

const graphqlMocksWithChat = [...graphqlMocks, ...chatTrayMocks];

const LONG_TIMEOUT = 20_000;

async function registerRestMocks(page: Page): Promise<void> {
  // ... (keep existing REST mocks) ...
  await page.route(`**/${mockPdfDocument.pawlsParseFile}`, (route) => {
    console.log(`[MOCK] PAWLS route triggered for: ${route.request().url()}`);
    if (!mockPawlsDataContent) {
      console.error(`[MOCK ERROR] Mock PAWLS data is null or undefined.`);
      route.fulfill({ status: 500, body: "Mock PAWLS data not loaded" });
      return;
    }
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockPawlsDataContent),
    });
    console.log(
      `[MOCK] Served PAWLS JSON successfully for ${route.request().url()}`
    );
  });
  await page.route(`**/${mockTxtDocument.txtExtractFile}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: "Mock plain text content.",
    })
  );
  await page.route(`**/${mockPdfDocument.mdSummaryFile}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/markdown",
      body: "# Mock Summary Title\n\nMock summary details.",
    })
  );
  await page.route(MOCK_PDF_URL, async (route) => {
    console.log(`[MOCK] PDF file request: ${route.request().url()}`);
    if (!fs.existsSync(TEST_PDF_PATH)) {
      console.error(
        `[MOCK ERROR] Test PDF file not found at: ${TEST_PDF_PATH}`
      );
      return route.fulfill({ status: 404, body: "Test PDF not found" });
    }
    const buffer = fs.readFileSync(TEST_PDF_PATH);
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: buffer,
      headers: {
        "Content-Length": String(buffer.length),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  });
  // Add route for the new test PDF URL, can reuse the same physical file
  await page.route(MOCK_PDF_URL_FOR_STRUCTURAL_TEST, async (route) => {
    console.log(
      `[MOCK] PDF file request (structural test): ${route.request().url()}`
    );
    if (!fs.existsSync(TEST_PDF_PATH)) {
      console.error(
        `[MOCK ERROR] Test PDF file not found at: ${TEST_PDF_PATH}`
      );
      return route.fulfill({ status: 404, body: "Test PDF not found" });
    }
    const buffer = fs.readFileSync(TEST_PDF_PATH);
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: buffer,
      headers: {
        "Content-Length": String(buffer.length),
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// │                               Test Suite                                  │
// ──────────────────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1280, height: 720 } });

test.beforeEach(async ({ page }) => {
  // Add instrumentation to track mutation calls - REMOVED FETCH INTERCEPTION
  // await page.addInitScript(() => {
  //   console.log('[PAGE INIT] Adding mutation tracking');
  //   (window as any).mutationCalled = false;

  //   // Track Apollo mutation calls
  //   const originalFetch = window.fetch;
  //   window.fetch = function(...args) {
  //     const [url, options] = args;
  //     if (options && options.body && typeof options.body === 'string' &&
  //         options.body.includes('REQUEST_ADD_ANNOTATION')) {
  //       console.log('[FETCH INTERCEPTED] Apollo mutation call detected');
  //       (window as any).mutationCalled = true;
  //     }
  //     return originalFetch.apply(this, args);
  //   };
  // });

  // --- Remove Mock Static Asset Imports ---
  // The Vite configuration in playwright-ct.config.ts should handle this now
  // await page.route('**/*.png', (route) => {
  //   const requestedUrl = route.request().url();
  //   console.log(`[MOCK ASSET] Intercepted PNG request: ${requestedUrl}`);
  //   route.fulfill({
  //     status: 200,
  //     contentType: 'image/png',
  //     body: '',
  //   });
  // });

  // Keep existing REST mocks
  await registerRestMocks(page);

  // Restore original request logging if desired, or keep the filtered version
  page.on("request", (request) => {
    // if (!request.url().endsWith('.png')) { // No longer need to filter PNGs
    console.log(`>> ${request.method()} ${request.url()}`);
    // }
  });
  page.on("response", async (response) => {
    const url = response.url();
    const status = response.status();
    try {
      if (
        !url.endsWith(".pdf") &&
        !url.includes("pdf.worker") &&
        status < 300
      ) {
        console.log(`<< ${status} ${url}`);
      } else {
        console.log(`<< ${status} ${url}`);
      }
    } catch (e) {
      console.log(`<< ${status} ${url} (Could not read body: ${e})`);
    }
  });
  page.on("requestfailed", (req) =>
    console.warn(`[⚠️ FAILED Request] ${req.failure()?.errorText} ${req.url()}`)
  );
  page.on("pageerror", (err) =>
    console.error(`[PAGE ERROR] ${err.message}\n${err.stack}`)
  );
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error(`[CONSOLE ERROR] ${msg.text()}`);
    } else {
      console.log(`[CONSOLE] ${msg.text()}`);
    }
  });
});

test("renders PDF document title and summary on initial load", async ({
  mount,
  page,
}) => {
  // Mount the Wrapper, passing mocks and props
  await mount(
    <DocumentKnowledgeBaseTestWrapper
      mocks={graphqlMocks}
      documentId={PDF_DOC_ID}
      corpusId={CORPUS_ID}
    />
  );

  // Keep assertions as they were
  await expect(
    page.getByRole("heading", { name: mockPdfDocument.title ?? "" })
  ).toBeVisible({ timeout: LONG_TIMEOUT });

  await page.waitForTimeout(100);

  await expect(page.getByRole("button", { name: "Summary" })).toHaveClass(
    /active/,
    { timeout: LONG_TIMEOUT }
  );
  await expect(
    page.getByRole("heading", { name: "Mock Summary Title" })
  ).toBeVisible({ timeout: LONG_TIMEOUT });
  await expect(page.getByText("Mock summary details.")).toBeVisible({
    timeout: LONG_TIMEOUT,
  });
});

test("switches to Document layer and renders PDF container", async ({
  mount,
  page,
}) => {
  test.setTimeout(120000); // Set timeout to 60 seconds for this specific test

  await mount(
    <DocumentKnowledgeBaseTestWrapper
      mocks={graphqlMocks}
      documentId={PDF_DOC_ID}
      corpusId={CORPUS_ID}
    />
  );

  // Keep test logic
  await page.locator(".layers-button").hover();
  await page
    .locator(".layers-menu")
    .getByRole("button", { name: "Document" })
    .click();

  const pdfContainer = page.locator("#pdf-container");
  await expect(pdfContainer).toBeVisible({ timeout: LONG_TIMEOUT });

  const firstCanvas = pdfContainer.locator("canvas").first();
  await expect(firstCanvas).toBeVisible({ timeout: LONG_TIMEOUT });

  const pagePlaceholders = pdfContainer.locator(
    '> div[style*="position: relative;"] > div[style*="position: absolute;"]'
  );
  await expect(pagePlaceholders).toHaveCount(23, { timeout: LONG_TIMEOUT });

  const renderedPageIndices = new Set<number>();
  const totalPages = 23;

  const scrollableView = await pdfContainer.boundingBox();
  if (!scrollableView) {
    throw new Error("Could not get bounding box for #pdf-container");
  }
  const clientHeight = scrollableView.height;
  const scrollHeight = await pdfContainer.evaluate((node) => node.scrollHeight);

  console.log(
    `[TEST] pdfContainer clientHeight: ${clientHeight}, scrollHeight: ${scrollHeight}`
  );

  let currentScrollTop = 0;
  const scrollIncrement = clientHeight * 0.8; // Scroll by 80% of the container's visible height to ensure overlap

  while (currentScrollTop < scrollHeight - clientHeight) {
    currentScrollTop += scrollIncrement;
    currentScrollTop = Math.min(currentScrollTop, scrollHeight - clientHeight);

    await pdfContainer.evaluate((node, st) => {
      node.scrollTop = st;
    }, currentScrollTop);

    // Active polling for newly rendered canvases
    const maxWaitTimeForStepMs = 5000; // Max time to wait for canvases at this scroll step
    const checkIntervalMs = 300; // Interval to re-check for canvases
    const stepStartTime = Date.now();
    let madeProgressInStep = true; // Assume progress initially or after finding a canvas

    while (Date.now() - stepStartTime < maxWaitTimeForStepMs) {
      if (!madeProgressInStep && Date.now() - stepStartTime > 1000) {
        // If no new canvas found for over 1s in this step, assume stable state for this scroll position
        // console.log(`[TEST] No new canvases for 1s at scrollTop ${currentScrollTop}, proceeding.`);
        break;
      }
      madeProgressInStep = false; // Reset for this check cycle
      let initialRenderedCountInInterval = renderedPageIndices.size;

      for (let j = 0; j < totalPages; j++) {
        if (!renderedPageIndices.has(j)) {
          const placeholder = pagePlaceholders.nth(j);
          // A more precise check would be: (placeholder.offsetTop < currentScrollTop + clientHeight && placeholder.offsetTop + placeholder.offsetHeight > currentScrollTop)
          // For now, we check all non-rendered ones, as PDF.tsx logic will mount them if they are in its calculated range.
          const hasCanvas = (await placeholder.locator("canvas").count()) > 0;
          if (hasCanvas) {
            renderedPageIndices.add(j);
            console.log(
              `[TEST] Rendered canvas for page index ${j} at scrollTop ${currentScrollTop}`
            );
            madeProgressInStep = true;
          }
        }
      }

      if (renderedPageIndices.size === totalPages) break; // All pages found
      if (renderedPageIndices.size > initialRenderedCountInInterval) {
        // If we found new canvases, reset the "no progress" timer by continuing the outer while loop effectively
      } else {
        // No new canvases in this specific check, wait for next interval or timeout
      }
      await page.waitForTimeout(checkIntervalMs);
    }

    if (renderedPageIndices.size === totalPages) {
      console.log(`[TEST] All ${totalPages} pages rendered. Stopping scroll.`);
      break;
    }

    if (currentScrollTop >= scrollHeight - clientHeight) {
      console.log("[TEST] Reached end of scrollable content.");
      // One last check at the very bottom
      await page.waitForTimeout(checkIntervalMs * 2); // A bit longer final wait
      for (let j = 0; j < totalPages; j++) {
        if (!renderedPageIndices.has(j)) {
          const placeholder = pagePlaceholders.nth(j);
          if ((await placeholder.locator("canvas").count()) > 0) {
            renderedPageIndices.add(j);
            console.log(
              `[TEST] Rendered canvas for page index ${j} at final scrollTop`
            );
          }
        }
      }
      break;
    }
  }

  if (renderedPageIndices.size < totalPages) {
    console.warn(
      `[TEST] Still missing ${
        totalPages - renderedPageIndices.size
      } pages. Performing a final check scan.`
    );
    for (let j = 0; j < totalPages; j++) {
      if (!renderedPageIndices.has(j)) {
        const placeholder = pagePlaceholders.nth(j);
        if ((await placeholder.locator("canvas").count()) > 0) {
          renderedPageIndices.add(j);
        } else {
          console.warn(
            `[TEST FINAL SCAN] Page index ${j} did not render a canvas.`
          );
        }
      }
    }
  }

  expect(renderedPageIndices.size).toBe(totalPages);
  console.log(
    `[TEST SUCCESS] Verified that all ${totalPages} pages rendered a canvas at some point during scroll.`
  );
});

test("renders TXT document and shows plain-text container with content", async ({
  mount,
  page,
}) => {
  await mount(
    <DocumentKnowledgeBaseTestWrapper
      mocks={graphqlMocks}
      documentId={TXT_DOC_ID}
      corpusId={CORPUS_ID}
    />
  );

  // Keep test logic
  await expect(
    page.getByRole("heading", { name: mockTxtDocument.title ?? "" })
  ).toBeVisible({ timeout: LONG_TIMEOUT });
  await page.getByRole("button", { name: "Annotations" }).click();
  await expect(page.locator("#pdf-container")).toBeVisible({
    timeout: LONG_TIMEOUT,
  });
  await expect(page.locator("#pdf-container")).toContainText(
    "Mock plain text content.",
    { timeout: LONG_TIMEOUT }
  );
  await expect(
    page.locator("#pdf-container .react-pdf__Page__canvas")
  ).toBeHidden({ timeout: LONG_TIMEOUT });
});

test("selects a label and creates an annotation by dragging", async ({
  mount,
  page,
}) => {
  // Setup more verbose logging for mutation debugging
  page.on("console", (msg) => {
    const text = msg.text();
    if (
      text.includes("REQUEST_ADD_ANNOTATION") ||
      text.includes("annotation") ||
      text.includes("mutation")
    ) {
      console.log(`[TEST DEBUG] ${text}`);
    }
  });

  await mount(
    <DocumentKnowledgeBaseTestWrapper
      mocks={graphqlMocks}
      documentId={PDF_DOC_ID}
      corpusId={CORPUS_ID}
    />
  );

  // Wait for initial summary render (ensures onCompleted started)
  await expect(
    page.getByRole("heading", { name: "Mock Summary Title" })
  ).toBeVisible({ timeout: LONG_TIMEOUT });
  console.log("[TEST] Initial summary loaded...");

  // 1. Switch to Document layer
  await page.locator(".layers-button").hover();
  await page
    .locator(".layers-menu")
    .getByRole("button", { name: "Document" })
    .click();
  console.log("[TEST] Switched to Document layer...");

  // *** ADDED WAIT *AFTER* LAYER SWITCH ***
  // Wait for the label selector to display text derived from the corpus data.
  // This ensures the corpus state update has propagated to the Document layer components.
  const labelSelectorButton = page.locator(
    '[data-testid="label-selector-toggle-button"]'
  );
  await expect(labelSelectorButton).toBeVisible({ timeout: LONG_TIMEOUT }); // Ensure button exists first
  await expect(
    labelSelectorButton.locator(".active-label-display")
  ).toContainText("Person", { timeout: LONG_TIMEOUT });
  console.log(
    "[TEST] Label selector ready (corpus state propagated), proceeding with interaction..."
  );

  // 2. Verify PDF canvases are loaded (can happen after label selector check)
  const canvasLocator = page.locator("#pdf-container canvas");
  await expect(canvasLocator.first()).toBeVisible({ timeout: LONG_TIMEOUT });

  // 3. Verify label selection
  const labelSelectorButtonAfter = page.locator(
    '[data-testid="label-selector-toggle-button"]'
  );
  await expect(labelSelectorButtonAfter).toBeVisible({ timeout: LONG_TIMEOUT });
  await expect(
    labelSelectorButtonAfter.locator(".active-label-display")
  ).toContainText("Person", { timeout: LONG_TIMEOUT });

  // 4. Prepare for annotation
  const firstCanvas = canvasLocator.first();
  await expect(firstCanvas).toBeVisible({ timeout: LONG_TIMEOUT });
  const firstPageContainer = page.locator(".PageAnnotationsContainer").first();
  const selectionLayer = firstPageContainer.locator("#selection-layer");
  const layerBox = await selectionLayer.boundingBox();
  expect(layerBox).toBeTruthy();

  // Improved logging before drag
  console.log("[TEST] About to perform drag operation");

  // 5. Perform drag - more precise placement
  const startX = layerBox!.width * 0.5;
  const startY = layerBox!.height * 0.1;
  const endX = layerBox!.width * 0.5;
  const endY = startY + 100;

  // More deliberate drag operation
  await page.mouse.move(layerBox!.x + startX, layerBox!.y + startY);
  await page.mouse.down();
  await page.waitForTimeout(100); // Brief pause
  await page.mouse.move(
    layerBox!.x + endX,
    layerBox!.y + endY,
    { steps: 10 } // More gradual movement
  );
  await page.waitForTimeout(100); // Brief pause
  await page.mouse.up();
  console.log("Mouse up completed");

  // Give the UI a moment to stabilize after the drop
  await page.waitForTimeout(500);

  // Wait for Apollo cache to update (keep this, might need adjustment)
  await page.waitForTimeout(1000); // Slightly longer wait after mock confirms execution

  // 6. Navigate to annotations panel to see results
  await page.getByRole("button", { name: "Annotations" }).click();
  const annotationsPanel = page.locator(".sidebar__annotations"); // Define panel locator
  await expect(annotationsPanel).toBeVisible({
    timeout: LONG_TIMEOUT,
  });

  // Log panel contents for debugging (optional but helpful)
  console.log("[TEST] Current annotations panel contents:");
  const panelHTML = await annotationsPanel.evaluate((el) => el.innerHTML);
  console.log(panelHTML);

  // Check if mock was hit by checking console logs (optional)
  // const logs = await page.evaluate(() => {
  //   return (window as any).mutationCalled || false;
  // });
  // console.log(`[TEST] Mutation called according to window flag: ${logs}`);

  // 7. Assert Success - Wait specifically for the element within the panel
  const annotationElement = annotationsPanel // Ensure we look *within* the panel
    .locator('[data-annotation-id="new-annot-1"]')
    .first();

  // Wait specifically for the annotation element to be visible
  await expect(annotationElement).toBeVisible({ timeout: 15000 }); // Increased timeout for this specific assertion
  console.log("[TEST SUCCESS] Found annotation with data-annotation-id");
});

test("filters annotations correctly when 'Show Structural' and 'Show Only Selected' are toggled", async ({
  mount,
  page,
}) => {
  await mount(
    <DocumentKnowledgeBaseTestWrapper
      mocks={graphqlMocks}
      documentId={PDF_DOC_ID_FOR_STRUCTURAL_TEST}
      corpusId={CORPUS_ID}
    />
  );

  // Wait for initial summary render to ensure component is ready
  await expect(
    page.getByRole("heading", {
      name: mockPdfDocumentForStructuralTest.title ?? "",
    })
  ).toBeVisible({ timeout: LONG_TIMEOUT });
  await expect(page.getByRole("button", { name: "Summary" })).toHaveClass(
    /active/,
    { timeout: LONG_TIMEOUT }
  );

  // 1. Navigate to Annotations sidebar
  await page.getByRole("button", { name: "Annotations" }).click();
  const annotationsPanel = page.locator(".sidebar__annotations");
  await expect(annotationsPanel).toBeVisible({ timeout: LONG_TIMEOUT });

  const nonStructuralAnnotation = annotationsPanel.locator(
    `[data-annotation-id="${mockAnnotationNonStructural1.id}"]`
  );
  const structuralAnnotation = annotationsPanel.locator(
    `[data-annotation-id="${mockAnnotationStructural1.id}"]`
  );

  // 2. Initial State: Non-structural visible, structural visible
  await expect(nonStructuralAnnotation).toBeVisible({ timeout: LONG_TIMEOUT });
  await expect(structuralAnnotation).not.toBeVisible({ timeout: LONG_TIMEOUT });

  // 3. Interact with ViewSettingsPopup
  const viewSettingsTrigger = page.locator("#view-settings-trigger");
  await viewSettingsTrigger.click();
  const viewSettingsPopup = page.locator("#view-settings-popup-grid"); // More specific to the popup content
  await expect(viewSettingsPopup).toBeVisible({ timeout: LONG_TIMEOUT });

  const showSelectedOnlyToggleWrapper = viewSettingsPopup.locator(
    "div.column:has(i.icon.user.outline) .ui.checkbox"
  );
  const showStructuralToggleWrapper = viewSettingsPopup.locator(
    '[data-testid="toggle-show-structural"].ui.checkbox'
  );

  // Verify initial state of toggles within popup
  await expect(
    showSelectedOnlyToggleWrapper.locator('input[type="checkbox"]')
  ).not.toBeChecked();
  await expect(showSelectedOnlyToggleWrapper).not.toHaveClass(/disabled/); // Should be enabled
  await expect(
    showStructuralToggleWrapper.locator('input[type="checkbox"]')
  ).not.toBeChecked();

  // 3a. Toggle "Show Structural" ON
  await showStructuralToggleWrapper.click();
  await expect(
    showStructuralToggleWrapper.locator('input[type="checkbox"]')
  ).toBeChecked();
  // "Show Only Selected" should become checked and disabled
  await expect(
    showSelectedOnlyToggleWrapper.locator('input[type="checkbox"]')
  ).toBeChecked();
  await expect(showSelectedOnlyToggleWrapper).toHaveClass(/disabled/);

  await expect(structuralAnnotation).toBeVisible({ timeout: LONG_TIMEOUT });
  await expect(nonStructuralAnnotation).toBeVisible({ timeout: LONG_TIMEOUT });

  // 4. Toggle "Show Structural" OFF
  await showStructuralToggleWrapper.click(); // Click again to turn off
  await expect(
    showStructuralToggleWrapper.locator('input[type="checkbox"]')
  ).not.toBeChecked();
  // "Show Only Selected" should remain checked but become enabled
  await expect(
    showSelectedOnlyToggleWrapper.locator('input[type="checkbox"]')
  ).toBeChecked();
  await expect(showSelectedOnlyToggleWrapper).not.toHaveClass(/disabled/);

  // Annotation List: Both still hidden (showSelectedOnly=true, nothing selected)
  await expect(nonStructuralAnnotation).toBeVisible({
    timeout: LONG_TIMEOUT,
  });
  await expect(structuralAnnotation).not.toBeVisible({ timeout: LONG_TIMEOUT });

  // Close popup (optional, good practice)
  await page.locator("body").click({ force: true, position: { x: 0, y: 0 } }); // Click outside to close
});

/* --------------------------------------------------------------------- */
/* search bar – jump to first match                                      */
/* --------------------------------------------------------------------- */
test("DocNavigation search jumps to first 'Transfer Taxes' hit on page 4", async ({
  mount,
  page,
}) => {
  /* 1️⃣  mount the wrapper */
  await mount(
    <DocumentKnowledgeBaseTestWrapper
      mocks={graphqlMocks}
      documentId={PDF_DOC_ID}
      corpusId={CORPUS_ID}
    />
  );

  /* 2️⃣  wait until the Summary tab rendered – component ready */
  await expect(
    page.getByRole("heading", { name: "Mock Summary Title" })
  ).toBeVisible({ timeout: LONG_TIMEOUT });

  /* 3️⃣  switch to Document layer (PDF) */
  await page.locator(".layers-button").hover();
  await page
    .locator(".layers-menu")
    .getByRole("button", { name: "Document" })
    .click();

  /* 4️⃣  open the DocNavigation search panel (desktop = hover) */
  const nav = page.locator("#doc-navigation .search-container");
  await nav.hover();

  /* 5️⃣  fill query + press ENTER */
  const searchInput = nav.getByPlaceholder("Search document...");
  await expect(searchInput).toBeVisible({ timeout: LONG_TIMEOUT });
  await searchInput.fill("Transfer Taxes");
  await searchInput.press("Enter");

  /* 6️⃣  wait for ANY highlight to become visible -------------------- */
  const highlight = page.locator("[id^='SEARCH_RESULT_']").first();
  await expect(highlight).toBeVisible({ timeout: LONG_TIMEOUT });

  /* 6b️⃣  wait until the container finished scrolling so the highlight
         lies fully within the viewport                                */
  await page.waitForFunction(
    ([hl, container]) => {
      if (!hl || !container) return false;
      const h = hl.getBoundingClientRect();
      const c = container.getBoundingClientRect();
      return h.top >= c.top && h.bottom <= c.bottom;
    },
    [
      await highlight.elementHandle(),
      await page.locator("#pdf-container").elementHandle(),
    ],
    { timeout: LONG_TIMEOUT }
  );

  /* 7️⃣  now we can safely assert with bounding-boxes (almost instant) */
  const pdfBox = await page.locator("#pdf-container").boundingBox();
  const hlBox = await highlight.boundingBox();
  expect(pdfBox && hlBox, "bounding boxes must exist").toBeTruthy();
  if (pdfBox && hlBox) {
    const within =
      hlBox.y >= pdfBox.y && hlBox.y + hlBox.height <= pdfBox.y + pdfBox.height;
    expect(within).toBe(true);
  }
});

/* --------------------------------------------------------------------- */
/* chat tray – scroll to 'Source 1' highlight                            */
/* --------------------------------------------------------------------- */
test.only("Chat source chip centres its highlight in the PDF viewer", async ({
  mount,
  page,
}) => {
  // Mount KB wrapper with the extended mocks
  await mount(
    <DocumentKnowledgeBaseTestWrapper
      mocks={graphqlMocksWithChat}
      documentId={PDF_DOC_ID}
      corpusId={CORPUS_ID}
    />
  );

  // Wait until the Summary tab rendered
  await expect(
    page.getByRole("heading", { name: "Mock Summary Title" })
  ).toBeVisible({ timeout: LONG_TIMEOUT });

  // Switch to the PDF layer
  await page.locator(".layers-button").hover();
  await page
    .locator(".layers-menu")
    .getByRole("button", { name: "Document" })
    .click();

  // Wait for the conversation list & click the first card
  const convCard = page
    .locator("text=Transfer Taxes in Document Analysis")
    .first();
  await expect(convCard).toBeVisible({ timeout: LONG_TIMEOUT });
  await convCard.click();

  // Expand sources in assistant message
  const sourceChip = page.locator(".source-preview-container").first();
  await expect(sourceChip).toBeVisible({ timeout: LONG_TIMEOUT });
  await sourceChip.click();

  // Click source child 1 in the expanded sources list
  const sourceChild1 = page.locator(".source-chip").first();
  await expect(sourceChild1).toBeVisible({ timeout: LONG_TIMEOUT });
  await sourceChild1.click();

  // Wait for highlight to be in the DOM & scrolled into view
  const messageId = "TWVzc2FnZVR5cGU6Ng=="; // base-64 id used by the UI
  const highlight = page.locator(
    `[id="CHAT_SOURCE_${messageId}.0"]` // an attribute selector needs no escaping
  );
  await expect(highlight).toBeVisible({ timeout: LONG_TIMEOUT });

  // Verify the highlight is fully visible in the viewport
  await page.waitForFunction(
    ([hl, container]) => {
      if (!hl || !container) return false;
      const h = hl.getBoundingClientRect();
      const c = container.getBoundingClientRect();
      return h.top >= c.top && h.bottom <= c.bottom;
    },
    [
      await highlight.elementHandle(),
      await page.locator("#pdf-container").elementHandle(),
    ],
    { timeout: LONG_TIMEOUT }
  );

  // Final bounding-box assertion
  const pdfBox = await page.locator("#pdf-container").boundingBox();
  const hlBox = await highlight.boundingBox();
  expect(pdfBox && hlBox).toBeTruthy();
  if (pdfBox && hlBox) {
    const within =
      hlBox.y >= pdfBox.y && hlBox.y + hlBox.height <= pdfBox.y + pdfBox.height;
    expect(within).toBe(true);
  }
});
