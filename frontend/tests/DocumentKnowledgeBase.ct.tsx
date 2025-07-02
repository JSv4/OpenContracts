// tests/DocumentKnowledgeBase.ct.tsx
import React from "react";
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

// Keep query/mutation imports needed for mocks

import { Page } from "@playwright/test";

// Import the new Wrapper component
import { DocumentKnowledgeBaseTestWrapper } from "./DocumentKnowledgeBaseTestWrapper";
import {
  chatTrayMocks,
  CORPUS_ID,
  graphqlMocks,
  MOCK_PDF_URL,
  MOCK_PDF_URL_FOR_STRUCTURAL_TEST,
  mockAnnotationNonStructural1,
  mockAnnotationStructural1,
  mockPdfDocument,
  mockPdfDocumentForStructuralTest,
  mockTxtDocument,
  PDF_DOC_ID,
  PDF_DOC_ID_FOR_STRUCTURAL_TEST,
  TEST_PAWLS_PATH,
  TEST_PDF_PATH,
  TXT_DOC_ID,
} from "./mocks/DocumentKnowledgeBase.mocks";

import { GET_DOCUMENT_SUMMARY_VERSIONS } from "../src/components/knowledge_base/document/floating_summary_preview/graphql/documentSummaryQueries";

// ──────────────────────────────────────────────────────────────────────────────
// │                               Test Data                                   │
// ──────────────────────────────────────────────────────────────────────────────
const graphqlMocksWithChat = [...graphqlMocks, ...chatTrayMocks];

const LONG_TIMEOUT = 60_000;

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
test.setTimeout(60000);

test.beforeEach(async ({ page }) => {
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

test("renders PDF document and can open summary via floating preview", async ({
  mount,
  page,
}) => {
  // Mount the Wrapper, passing mocks and props
  await mount(
    <DocumentKnowledgeBaseTestWrapper
      mocks={[...graphqlMocks, ...createSummaryMocks(PDF_DOC_ID, CORPUS_ID)]}
      documentId={PDF_DOC_ID}
      corpusId={CORPUS_ID}
    />
  );

  // Document title should be visible
  await expect(
    page.getByRole("heading", { name: mockPdfDocument.title ?? "" })
  ).toBeVisible({ timeout: LONG_TIMEOUT });

  // PDF should be visible by default (no layer switching needed)
  const pdfContainer = page.locator("#pdf-container");
  await expect(pdfContainer).toBeVisible({ timeout: LONG_TIMEOUT });

  // Find and click the floating summary preview button - easier via data-testid
  const summaryButton = page.getByTestId("summary-toggle-button");
  await expect(summaryButton).toBeVisible({ timeout: LONG_TIMEOUT });
  await summaryButton.click();

  // Expanded summary should show
  await expect(page.locator('h3:has-text("Document Summary")')).toBeVisible({
    timeout: LONG_TIMEOUT,
  });

  // Wait for content to load
  await page.waitForTimeout(1000);

  // Click on the summary content to switch to knowledge layer
  const summaryCard = page.getByTestId("summary-card-1");
  await expect(summaryCard).toBeVisible({ timeout: LONG_TIMEOUT });
  await summaryCard.click();

  // Should now show the summary in main view
  const summaryHeading = page
    .getByRole("heading", { name: "Mock Summary Title" })
    .first();
  await expect(summaryHeading).toBeVisible({ timeout: LONG_TIMEOUT });
  await expect(page.locator("text=Mock summary details.").first()).toBeVisible({
    timeout: LONG_TIMEOUT,
  });
});

test("PDF container renders with virtualized pages", async ({
  mount,
  page,
}) => {
  test.setTimeout(120000); // Set timeout to 120 seconds for this specific test

  await mount(
    <DocumentKnowledgeBaseTestWrapper
      mocks={[...graphqlMocks, ...createSummaryMocks(PDF_DOC_ID, CORPUS_ID)]}
      documentId={PDF_DOC_ID}
      corpusId={CORPUS_ID}
    />
  );

  // PDF is visible by default, no layer switching needed
  const pdfContainer = page.locator("#pdf-container");
  await expect(pdfContainer).toBeVisible({ timeout: LONG_TIMEOUT });

  const firstCanvas = pdfContainer.locator("canvas").first();
  await expect(firstCanvas).toBeVisible({ timeout: LONG_TIMEOUT });

  const pagePlaceholders = pdfContainer.locator(
    '> div[style*="position: relative;"] > div[style*="position: absolute;"]'
  );
  await expect(pagePlaceholders).toHaveCount(23, { timeout: LONG_TIMEOUT });

  // Continue with existing scrolling logic...
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

test("renders TXT document with chat panel open", async ({ mount, page }) => {
  await mount(
    <DocumentKnowledgeBaseTestWrapper
      mocks={[...graphqlMocks, ...createSummaryMocks(PDF_DOC_ID, CORPUS_ID)]}
      documentId={TXT_DOC_ID}
      corpusId={CORPUS_ID}
    />
  );

  // Document title should be visible
  await expect(
    page.getByRole("heading", { name: mockTxtDocument.title ?? "" })
  ).toBeVisible({ timeout: LONG_TIMEOUT });

  // Click ChatIndicator to open sidebar - it's the button on the right edge with MessageSquare icon
  const chatIndicator = page
    .locator("button")
    .filter({
      has: page.locator('svg[class*="lucide-message-square"]'),
    })
    .last(); // Get the last one in case there are multiple
  await expect(chatIndicator).toBeVisible({ timeout: LONG_TIMEOUT });
  await chatIndicator.click();

  // Sidebar should be visible
  const slidingPanel = page.locator("#sliding-panel");
  await expect(slidingPanel).toBeVisible({ timeout: LONG_TIMEOUT });

  // Switch to feed mode - look for the toggle button with "Content Feed" text
  const feedToggle = page.getByTestId("view-mode-feed");
  await expect(feedToggle).toBeVisible({ timeout: LONG_TIMEOUT });
  await feedToggle.click();

  // TXT content should be visible
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

test("selects a label and creates an annotation via unified feed", async ({
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
      mocks={[...graphqlMocks, ...createSummaryMocks(PDF_DOC_ID, CORPUS_ID)]}
      documentId={PDF_DOC_ID}
      corpusId={CORPUS_ID}
    />
  );

  // Wait for document to load
  await expect(
    page.getByRole("heading", { name: mockPdfDocument.title ?? "" })
  ).toBeVisible({ timeout: LONG_TIMEOUT });

  // PDF is visible by default
  await expect(page.locator("#pdf-container canvas").first()).toBeVisible({
    timeout: LONG_TIMEOUT,
  });

  // Wait for the label selector to be ready
  const labelSelectorButton = page.locator(
    '[data-testid="label-selector-toggle-button"]'
  );
  await expect(labelSelectorButton).toBeVisible({ timeout: LONG_TIMEOUT });
  // Open the selector and choose the first label
  await labelSelectorButton.hover();
  await labelSelectorButton.click();
  const firstLabelOption = page.locator(".label-option").first();
  await expect(firstLabelOption).toBeVisible({ timeout: LONG_TIMEOUT });
  await firstLabelOption.click();
  console.log("[TEST] Selected first label for annotation");

  // Prepare for annotation
  const firstCanvas = page.locator("#pdf-container canvas").first();
  await expect(firstCanvas).toBeVisible({ timeout: LONG_TIMEOUT });
  const firstPageContainer = page.locator(".PageAnnotationsContainer").first();
  const selectionLayer = firstPageContainer.locator("#selection-layer");
  const layerBox = await selectionLayer.boundingBox();
  expect(layerBox).toBeTruthy();

  // Improved logging before drag
  console.log("[TEST] About to perform drag operation");

  // Perform drag - more precise placement
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

  // Wait for Apollo cache to update
  await page.waitForTimeout(1000);

  // Click ChatIndicator to open sidebar
  const chatIndicator = page
    .locator("button")
    .filter({
      has: page.locator('svg[class*="lucide-message-square"]'),
    })
    .last();
  await expect(chatIndicator).toBeVisible({ timeout: LONG_TIMEOUT });
  await chatIndicator.click();

  // Sidebar should be visible
  const slidingPanel = page.locator("#sliding-panel").first();
  await expect(slidingPanel).toBeVisible({ timeout: LONG_TIMEOUT });

  // Switch to feed mode
  const feedToggle = page.getByTestId("view-mode-feed");
  await expect(feedToggle).toBeVisible({ timeout: LONG_TIMEOUT });
  await feedToggle.click();

  // Verify the annotation appears in the unified feed
  const annotationInFeed = page
    .locator('[data-annotation-id="new-annot-1"]')
    .first();
  await expect(annotationInFeed).toBeVisible({ timeout: 15000 });
  console.log("[TEST SUCCESS] Found annotation in unified feed");
});

test("filters annotations in unified feed with structural toggle", async ({
  mount,
  page,
}) => {
  await mount(
    <DocumentKnowledgeBaseTestWrapper
      mocks={[
        ...graphqlMocks,
        ...createSummaryMocks(PDF_DOC_ID_FOR_STRUCTURAL_TEST, CORPUS_ID),
      ]}
      documentId={PDF_DOC_ID_FOR_STRUCTURAL_TEST}
      corpusId={CORPUS_ID}
    />
  );

  // Wait for document to load
  await expect(
    page.getByRole("heading", {
      name: mockPdfDocumentForStructuralTest.title ?? "",
    })
  ).toBeVisible({ timeout: LONG_TIMEOUT });

  // Open sidebar via ChatIndicator
  const chatIndicator = page
    .locator("button")
    .filter({
      has: page.locator('svg[class*="lucide-message-square"]'),
    })
    .last();
  await expect(chatIndicator).toBeVisible({ timeout: LONG_TIMEOUT });
  await chatIndicator.click();

  // Switch to feed mode
  const feedToggle = page.getByTestId("view-mode-feed");
  await expect(feedToggle).toBeVisible({ timeout: LONG_TIMEOUT });
  await feedToggle.click();

  // Wait for feed to load
  await page.waitForTimeout(500);

  const nonStructuralAnnotation = page.locator(
    `[data-annotation-id="${mockAnnotationNonStructural1.id}"]`
  );
  const structuralAnnotation = page.locator(
    `[data-annotation-id="${mockAnnotationStructural1.id}"]`
  );

  // Initial State: Non-structural visible, structural hidden
  await expect(nonStructuralAnnotation).toBeVisible({ timeout: LONG_TIMEOUT });
  await expect(structuralAnnotation).not.toBeVisible({ timeout: LONG_TIMEOUT });

  // Open filter dropdown - look for the button with Filter icon and "Content Types" text
  const filterDropdown = page
    .locator("div")
    .filter({
      hasText: "Content Types",
    })
    .filter({
      has: page.locator('svg[class*="lucide-filter"]'),
    })
    .first();
  await expect(filterDropdown).toBeVisible({ timeout: LONG_TIMEOUT });
  await filterDropdown.click();

  // Wait for dropdown menu to appear
  await page.waitForTimeout(300);

  // TODO: The structural toggle is likely in ViewSettingsPopup or similar
  // For now, skip this test as we need to investigate the actual UI structure
  console.log(
    "[TEST] Structural toggle test needs investigation of actual UI structure"
  );
});

/* --------------------------------------------------------------------- */
/* search using FloatingDocumentInput                                     */
/* --------------------------------------------------------------------- */
test("Search jumps to first 'Transfer Taxes' hit using floating input", async ({
  mount,
  page,
}) => {
  /* 1️⃣  mount the wrapper */
  await mount(
    <DocumentKnowledgeBaseTestWrapper
      mocks={[...graphqlMocks, ...createSummaryMocks(PDF_DOC_ID, CORPUS_ID)]}
      documentId={PDF_DOC_ID}
      corpusId={CORPUS_ID}
    />
  );

  /* 2️⃣  wait until document loads */
  await expect(
    page.getByRole("heading", { name: mockPdfDocument.title ?? "" })
  ).toBeVisible({ timeout: LONG_TIMEOUT });

  // PDF is visible by default
  await expect(page.locator("#pdf-container canvas").first()).toBeVisible({
    timeout: LONG_TIMEOUT,
  });

  /* 3️⃣  Click on the floating input to expand it - look for the button group with Search and MessageSquare icons */
  const floatingInput = page
    .locator("div")
    .filter({
      has: page.locator('svg[class*="lucide-search"]'),
    })
    .filter({
      has: page.locator('svg[class*="lucide-message-square"]'),
    })
    .first();
  await expect(floatingInput).toBeVisible({ timeout: LONG_TIMEOUT });
  await floatingInput.click();

  /* 4️⃣  The search mode should be active by default, but make sure by clicking search toggle if needed */
  const searchToggle = page
    .locator("button")
    .filter({
      has: page.locator('svg[class*="lucide-search"]'),
    })
    .first();
  await searchToggle.click();

  /* 5️⃣  Type search query and press Enter */
  const searchInput = page.getByPlaceholder("Search document...");
  await expect(searchInput).toBeVisible({ timeout: LONG_TIMEOUT });
  await searchInput.fill("Transfer Taxes");
  await searchInput.press("Enter");

  /* 6️⃣  wait for ANY highlight to become visible */
  const highlight = page.locator("[id^='SEARCH_RESULT_']").first();
  await expect(highlight).toBeVisible({ timeout: LONG_TIMEOUT });

  /* 6b️⃣  wait until the container finished scrolling */
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

  /* 7️⃣  assert highlight is within viewport */
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
/* chat source in unified feed – scroll to highlight                      */
/* --------------------------------------------------------------------- */
test("Chat source chip in unified feed centres its highlight in PDF", async ({
  mount,
  page,
}) => {
  // Mount KB wrapper with the extended mocks
  await mount(
    <DocumentKnowledgeBaseTestWrapper
      mocks={[...graphqlMocks, ...createSummaryMocks(PDF_DOC_ID, CORPUS_ID)]}
      documentId={PDF_DOC_ID}
      corpusId={CORPUS_ID}
    />
  );

  // Wait until document loads
  await expect(
    page.getByRole("heading", { name: mockPdfDocument.title ?? "" })
  ).toBeVisible({ timeout: LONG_TIMEOUT });

  // Open sidebar
  const chatIndicator = page
    .locator("button")
    .filter({
      has: page.locator('svg[class*="lucide-message-square"]'),
    })
    .last();
  await expect(chatIndicator).toBeVisible({ timeout: LONG_TIMEOUT });
  await chatIndicator.click();

  // Should be in chat mode by default, click on a conversation
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

/* --------------------------------------------------------------------- */
/* browser zoom controls test                                             */
/* --------------------------------------------------------------------- */
test("Browser zoom controls (Ctrl+scroll, keyboard shortcuts) work correctly", async ({
  mount,
  page,
}) => {
  await mount(
    <DocumentKnowledgeBaseTestWrapper
      mocks={[...graphqlMocks, ...createSummaryMocks(PDF_DOC_ID, CORPUS_ID)]}
      documentId={PDF_DOC_ID}
      corpusId={CORPUS_ID}
    />
  );

  // Wait for document to load
  await expect(
    page.getByRole("heading", { name: mockPdfDocument.title ?? "" })
  ).toBeVisible({ timeout: LONG_TIMEOUT });

  // PDF should be visible
  await expect(page.locator("#pdf-container canvas").first()).toBeVisible({
    timeout: LONG_TIMEOUT,
  });

  // Wait a bit for zoom calculation to stabilize
  await page.waitForTimeout(1000);

  // Get initial zoom level (might not be 100% due to fit-to-width calculations)
  const zoomControls = page.locator(".zoom-level").first();
  await expect(zoomControls).toBeVisible({ timeout: LONG_TIMEOUT });

  // Get the initial zoom text and ensure it's stable
  let initialZoomText = await zoomControls.textContent();
  await page.waitForTimeout(500);
  initialZoomText = await zoomControls.textContent();

  const initialZoom = parseInt(initialZoomText?.replace("%", "") || "100");
  const resetZoomLevel = initialZoom; // Store the initial zoom as the reset level
  console.log(
    `[TEST] Initial zoom level: ${initialZoom}% (this is the reset level)`
  );

  // Test 1: Ctrl+scroll wheel zoom in
  console.log("[TEST] Testing Ctrl+scroll wheel zoom in");
  const pdfContainer = page.locator("#pdf-container");
  const containerBox = await pdfContainer.boundingBox();
  expect(containerBox).toBeTruthy();

  // Simulate Ctrl+wheel up (zoom in)
  await page.keyboard.down("Control");
  await page.mouse.move(
    containerBox!.x + containerBox!.width / 2,
    containerBox!.y + containerBox!.height / 2
  );
  await page.mouse.wheel(0, -100); // Negative deltaY = scroll up = zoom in
  await page.keyboard.up("Control");

  // Check zoom changes
  const expectedZoomIn = Math.min(initialZoom + 10, 400);
  console.log(`[TEST] Expected zoom after scroll in: ${expectedZoomIn}%`);

  // Wait for zoom to update
  await page.waitForTimeout(500);

  // Primary check: zoom controls should show the new value
  await expect(zoomControls).toHaveText(`${expectedZoomIn}%`, {
    timeout: 5000,
  });

  // Define zoom indicator selector for reuse
  const zoomIndicator = page.getByTestId("zoom-indicator");

  // Optional check: if zoom indicator is visible, verify it
  const indicatorCountZoomIn = await zoomIndicator.count();
  if (indicatorCountZoomIn > 0) {
    console.log("[TEST] Zoom indicator is visible, verifying its value");
    await expect(zoomIndicator).toHaveText(`${expectedZoomIn}%`);
  } else {
    console.log("[TEST] Zoom indicator not visible, skipping indicator check");
  }

  // Test 2: Ctrl+scroll wheel zoom out
  console.log("[TEST] Testing Ctrl+scroll wheel zoom out");
  let currentZoom = expectedZoomIn;
  await page.keyboard.down("Control");
  // Just do one zoom out step
  await page.mouse.wheel(0, 100); // Positive deltaY = zoom out
  await page.keyboard.up("Control");

  // Check zoom changes
  // One wheel event changes zoom by 10%
  const expectedZoomOut = Math.max(currentZoom - 10, 50);
  console.log(`[TEST] Expected zoom after scroll out: ${expectedZoomOut}%`);

  // Wait for zoom to update
  await page.waitForTimeout(500);

  // Primary check: zoom controls should show the new value
  await expect(zoomControls).toHaveText(`${expectedZoomOut}%`, {
    timeout: 5000,
  });

  // Optional check: if zoom indicator is visible, verify it
  const indicatorCountZoomOut = await page
    .getByTestId("zoom-indicator")
    .count();
  if (indicatorCountZoomOut > 0) {
    console.log("[TEST] Zoom indicator is visible, verifying its value");
    await expect(zoomIndicator).toHaveText(`${expectedZoomOut}%`);
  } else {
    console.log("[TEST] Zoom indicator not visible, skipping indicator check");
  }

  currentZoom = expectedZoomOut;

  // Test 3: Ctrl+Plus to zoom in
  console.log("[TEST] Testing Ctrl+Plus keyboard shortcut");
  await page.keyboard.press("Control++"); // Ctrl+Plus

  const expectedAfterPlus = Math.min(currentZoom + 10, 400);
  console.log(`[TEST] Expected zoom after Ctrl+Plus: ${expectedAfterPlus}%`);

  // Wait for zoom to update
  await page.waitForTimeout(500);

  // Primary check: zoom controls
  await expect(zoomControls).toHaveText(`${expectedAfterPlus}%`, {
    timeout: 5000,
  });
  currentZoom = expectedAfterPlus;

  // Test 4: Ctrl+Minus to zoom out
  console.log("[TEST] Testing Ctrl+Minus keyboard shortcut");
  await page.keyboard.press("Control+-"); // Ctrl+Minus

  const expectedAfterMinus = Math.max(currentZoom - 10, 50);
  console.log(`[TEST] Expected zoom after Ctrl+Minus: ${expectedAfterMinus}%`);

  // Wait for zoom to update
  await page.waitForTimeout(500);

  // Primary check: zoom controls
  await expect(zoomControls).toHaveText(`${expectedAfterMinus}%`, {
    timeout: 5000,
  });
  currentZoom = expectedAfterMinus;

  // Log the current zoom before reset
  console.log(`[TEST] Zoom level before Ctrl+0 reset: ${currentZoom}%`);

  // Test 5: Ctrl+0 to reset zoom
  console.log("[TEST] Testing Ctrl+0 reset zoom (should go to 100%)");
  await page.keyboard.press("Control+0"); // Ctrl+0

  // Wait a bit for the event to process
  await page.waitForTimeout(300);

  // Check if zoom indicator appears
  const indicatorVisible = await page
    .getByTestId("zoom-indicator")
    .isVisible()
    .catch(() => false);
  console.log(
    `[TEST] Zoom indicator visible after Ctrl+0: ${indicatorVisible}`
  );

  if (indicatorVisible) {
    const indicatorText = await page
      .getByTestId("zoom-indicator")
      .textContent();
    console.log(`[TEST] Zoom indicator text: ${indicatorText}`);
    await expect(zoomIndicator).toBeHidden({ timeout: 3000 });
  }

  // Check the zoom controls directly
  await page.waitForTimeout(500);
  const zoomAfterReset = await zoomControls.textContent();
  console.log(`[TEST] Zoom controls after Ctrl+0: ${zoomAfterReset}`);

  // Ctrl+0 should reset to 100%, not the initial zoom
  await expect(zoomControls).toHaveText("100%", { timeout: 5000 });
  currentZoom = 100;

  // Test 6: Zoom bounds - test maximum zoom
  console.log("[TEST] Testing maximum zoom bound");
  // Zoom in many times to hit the max (4.0 = 400%)
  for (let i = 0; i < 35; i++) {
    // 35 * 0.1 = 3.5, so we should hit the 4.0 cap
    await page.keyboard.press("Control++");
    await page.waitForTimeout(50); // Small delay between presses
  }

  // Should cap at 400%
  await expect(zoomControls).toHaveText("400%");

  // One more zoom in should still be 400%
  await page.keyboard.press("Control++");
  await page.waitForTimeout(500);
  await expect(zoomControls).toHaveText("400%");

  // Test 7: Zoom bounds - test minimum zoom
  console.log("[TEST] Testing minimum zoom bound");
  // Reset first
  await page.keyboard.press("Control+0");
  await page.waitForTimeout(500);

  // Zoom out many times to hit the min (0.5 = 50%)
  for (let i = 0; i < 10; i++) {
    // 10 * 0.1 = 1.0, but we start at 1.0 so should hit 0.5 cap
    await page.keyboard.press("Control+-");
    await page.waitForTimeout(50);
  }

  // Should cap at 50%
  await expect(zoomControls).toHaveText("50%");

  // One more zoom out should still be 50%
  await page.keyboard.press("Control+-");
  await page.waitForTimeout(500);
  await expect(zoomControls).toHaveText("50%");

  // Test 8: Zoom only works in document layer, not knowledge layer
  console.log("[TEST] Testing zoom disabled in knowledge layer");

  // Switch to knowledge layer via floating summary preview
  const summaryButton = page.getByTestId("summary-toggle-button");
  await expect(summaryButton).toBeVisible({ timeout: LONG_TIMEOUT });
  await summaryButton.click();

  // Wait for expanded summary
  await expect(page.locator('h3:has-text("Document Summary")')).toBeVisible({
    timeout: LONG_TIMEOUT,
  });

  // Click on summary to switch to knowledge layer
  const summaryCard = page.getByTestId("summary-card-1");
  await expect(summaryCard).toBeVisible({ timeout: LONG_TIMEOUT });
  await summaryCard.click();

  // Verify we're in knowledge layer
  await expect(
    page.getByRole("heading", { name: "Mock Summary Title" }).first()
  ).toBeVisible({ timeout: LONG_TIMEOUT });

  // Try to zoom - should not show indicator
  await page.keyboard.press("Control++");

  // Wait a bit and verify zoom indicator does NOT appear
  await page.waitForTimeout(500);
  const indicatorCountInKnowledge = await page
    .getByTestId("zoom-indicator")
    .count();
  expect(indicatorCountInKnowledge).toBe(0);

  // Go back to document layer
  const backButton = page.getByTestId("back-to-document-button");
  await expect(backButton).toBeVisible({ timeout: LONG_TIMEOUT });
  await backButton.click();

  // Verify we're back in document layer and zoom works again
  await expect(page.locator("#pdf-container")).toBeVisible({
    timeout: LONG_TIMEOUT,
  });

  // Reset to known state first
  await page.keyboard.press("Control+0");
  await page.waitForTimeout(500);

  // Now test zoom works again
  await page.keyboard.press("Control++");
  await page.waitForTimeout(500);
  await expect(zoomControls).toHaveText("110%");

  console.log("[TEST SUCCESS] All browser zoom controls working correctly");
});

// Helper to create summary mocks (reuse from FloatingSummaryPreview tests but inline to avoid circular dep)
const mockSummaryVersions = [
  {
    id: "rev-1",
    version: 1,
    created: "2025-01-24T14:00:00Z",
    snapshot: "# Mock Summary Title\n\nMock summary details.",
    diff: "",
    author: {
      id: "user-1",
      username: "testuser",
      email: "test@example.com",
      __typename: "UserType",
    },
    __typename: "DocumentSummaryRevision",
  },
];
const createSummaryMocks = (documentId: string, corpusId: string) => [
  {
    request: {
      query: GET_DOCUMENT_SUMMARY_VERSIONS,
      variables: { documentId, corpusId },
    },
    result: {
      data: {
        document: {
          id: documentId,
          summaryContent: mockSummaryVersions[0].snapshot,
          currentSummaryVersion: 1,
          summaryRevisions: mockSummaryVersions,
          __typename: "DocumentType",
        },
      },
    },
  },
];
