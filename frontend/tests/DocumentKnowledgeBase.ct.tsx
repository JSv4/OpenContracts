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
import { REQUEST_ADD_ANNOTATION } from "../src/graphql/mutations";

// Keep type imports
import type { RawDocumentType } from "../src/types/graphql-api";
import { PermissionTypes } from "../src/components/types";
import { Page } from "@playwright/test";
import { LabelType } from "../src/components/annotator/types/enums";

// Import the new Wrapper component
import { DocumentKnowledgeBaseTestWrapper } from "./DocumentKnowledgeBaseTestWrapper";

// ──────────────────────────────────────────────────────────────────────────────
// │                               Test Data                                   │
// ──────────────────────────────────────────────────────────────────────────────

const PDF_DOC_ID = "pdf-doc-1";
const TXT_DOC_ID = "txt-doc-1";
const CORPUS_ID = "corpus-1";
const MOCK_PDF_URL = `/mock-pdf/${PDF_DOC_ID}/test.pdf`;

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
        icon: null,
        description: "A person entity",
      },
      {
        __typename: "AnnotationLabelType",
        id: "lbl-rel-1",
        text: "Connects",
        labelType: LabelType.RelationshipLabel,
        color: "#00FF00",
        icon: null,
        description: "A connection relationship",
      },
      {
        __typename: "AnnotationLabelType",
        id: "lbl-doc-1",
        text: "Contract",
        labelType: LabelType.DocTypeLabel,
        color: "#0000FF",
        icon: null,
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
  // Updated mock for REQUEST_ADD_ANNOTATION
  {
    request: {
      query: REQUEST_ADD_ANNOTATION,
      variables: {
        json: expect.any(Object),
        page: expect.any(Number),
        rawText: expect.any(String),
        corpusId: CORPUS_ID,
        documentId: PDF_DOC_ID,
        annotationLabelId: "lbl-span-1",
        annotationType: LabelType.TokenLabel,
      },
    },
    result: (variables: any) => {
      console.log(
        "[MOCK HIT] REQUEST_ADD_ANNOTATION with variables:",
        JSON.stringify(variables, null, 2)
      );

      // *** Add this specific log message ***
      console.log("--- MUTATION MOCK EXECUTED ---");

      // We no longer need the window flag
      // if (typeof window !== 'undefined') {
      //   (window as any).mutationCalled = true;
      //   console.log('[MOCK MUTATION] Setting global flag mutationCalled to true');
      // }

      return {
        data: {
          addAnnotation: {
            __typename: "AddAnnotationPayload",
            ok: true,
            annotation: {
              __typename: "AnnotationType",
              id: "new-annot-1",
              page: variables.page,
              rawText:
                variables.rawText?.substring(0, 50) + "..." || "Mocked Text...",
              bounds: {
                __typename: "BoundingBoxType",
                left: 100,
                top: 100,
                right: 200,
                bottom: 200,
                page: variables.page,
              },
              json: variables.json,
              isPublic: false,
              approved: false,
              rejected: false,
              structural: false,
              annotation_created: new Date().toISOString(),
              annotationType: variables.annotationType,
              myPermissions: [
                PermissionTypes.CAN_UPDATE,
                PermissionTypes.CAN_READ,
              ],
              annotationLabel: {
                __typename: "AnnotationLabelType",
                id: variables.annotationLabelId,
                icon: null,
                description: "A person entity",
                color: "#FF0000",
                text: "Person",
                labelType: LabelType.TokenLabel,
              },
              sourceNodeInRelationships: {
                __typename: "RelationshipTypeConnection",
                edges: [],
              },
              creator: {
                __typename: "UserType",
                id: "user-1",
                email: "test@test.com",
              },
            },
          },
        },
      };
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

test.only("selects a label and creates an annotation by dragging", async ({
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

  // *** ADDED waitForEvent for console message ***
  console.log("[TEST] Waiting for mutation mock execution signal...");
  try {
    await page.waitForEvent("console", {
      predicate: (msg) => msg.text().includes("--- MUTATION MOCK EXECUTED ---"),
      timeout: 15000, // Increased timeout slightly just in case
    });
    console.log("[TEST] Detected console message indicating mock execution.");
  } catch (e) {
    console.error("Timed out waiting for mutation mock execution signal!", e);
    // Take a screenshot to help debug the issue
    await page.screenshot({ path: "mutation-timeout-debug.png" });
    throw e; // Re-throw the error to fail the test clearly
  }

  // Wait for Apollo cache to update (keep this, might need adjustment)
  await page.waitForTimeout(1000); // Slightly longer wait after mock confirms execution

  // 6. Navigate to annotations panel to see results
  await page.getByRole("button", { name: "Annotations" }).click();
  await expect(page.locator(".sidebar__annotations")).toBeVisible({
    timeout: LONG_TIMEOUT,
  });

  // Longer wait time for UI update (keep this, might need adjustment)
  await page.waitForTimeout(2000);

  // Log panel contents for debugging
  console.log("[TEST] Current annotations panel contents:");
  const panelHTML = await page
    .locator(".sidebar__annotations")
    .evaluate((el) => el.innerHTML);
  console.log(panelHTML);

  // Check if mock was hit by checking console logs
  const logs = await page.evaluate(() => {
    return (window as any).mutationCalled || false;
  });
  console.log(`[TEST] Mutation called according to window flag: ${logs}`);

  // 7. Assert Success - try multiple strategies

  // Strategy 1: Look for annotation by ID
  const annotationElement = page
    .locator('[data-annotation-id="new-annot-1"]')
    .first();
  await expect(annotationElement).toBeVisible({ timeout: 10000 }); // Adjusted timeout
  console.log("[TEST SUCCESS] Found annotation with data-annotation-id");
});
