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
/* chat message tray – scroll to 'Source 1' highlight                            */
/* --------------------------------------------------------------------- */
test("Chat source chip centres its highlight in the PDF viewer", async ({
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
