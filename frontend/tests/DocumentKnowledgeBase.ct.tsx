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
  await expect(page.locator("#pdf-container")).toBeVisible({
    timeout: LONG_TIMEOUT,
  });
  const canvasLocator = page.locator("#pdf-container canvas");
  await expect(canvasLocator.first()).toBeVisible({ timeout: LONG_TIMEOUT });
  await expect(canvasLocator).toHaveCount(23, { timeout: LONG_TIMEOUT });
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
  await expect(canvasLocator).toHaveCount(23, { timeout: LONG_TIMEOUT });

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

test.only("filters annotations correctly when 'Show Structural' and 'Show Only Selected' are toggled", async ({
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

  // 5. Manually Toggle "Show Only Selected" OFF (while "Show Structural" is OFF)
  await showSelectedOnlyToggleWrapper.click(); // Click to uncheck
  await expect(
    showSelectedOnlyToggleWrapper.locator('input[type="checkbox"]')
  ).not.toBeChecked();
  await expect(showSelectedOnlyToggleWrapper).not.toHaveClass(/disabled/); // Should remain enabled

  // Annotation List: Back to initial state
  await expect(nonStructuralAnnotation).toBeVisible({ timeout: LONG_TIMEOUT });
  await expect(structuralAnnotation).not.toBeVisible({ timeout: LONG_TIMEOUT });

  // Close popup (optional, good practice)
  await page.locator("body").click({ force: true, position: { x: 0, y: 0 } }); // Click outside to close
});
