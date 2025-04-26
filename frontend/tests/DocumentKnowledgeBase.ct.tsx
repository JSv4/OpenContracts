// tests/DocumentKnowledgeBase.ct.tsx
import React from "react";
import path from "path";
import fs from "fs";

import { test, expect } from "@playwright/experimental-ct-react";

import { MockedProvider, type MockedResponse } from "@apollo/client/testing";
import {
  GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS,
  GET_DOCUMENT_KNOWLEDGE_BASE,
  GET_CONVERSATIONS,
  GET_DOCUMENT_ANALYSES_AND_EXTRACTS,
} from "../src/graphql/queries";
import DocumentKnowledgeBase from "../src/components/knowledge_base/document/DocumentKnowledgeBase";
import type { DocumentType } from "../src/types/graphql-api";
import { PermissionTypes } from "../src/components/types";
import type { Token } from "../src/components/types";
import { Page } from "@playwright/test";
import { LabelType } from "../src/components/annotator/types/enums";

// ──────────────────────────────────────────────────────────────────────────────
// │                               Test Data                                   │
// ──────────────────────────────────────────────────────────────────────────────

const PDF_DOC_ID = "pdf-doc-1";
const TXT_DOC_ID = "txt-doc-1";
const CORPUS_ID = "corpus-1";
const MOCK_PDF_URL = `/mock-pdf/${PDF_DOC_ID}/test.pdf`;

/** Absolute path to the test PDF in your repo */
const TEST_PDF_PATH = path.resolve(
  __dirname,
  "../../frontend/test-assets/test.pdf"
);

const createMockToken = (id: number, text: string): Token => ({
  text,
  x: 10 + id * 5,
  y: 10,
  height: 10,
  width: text.length * 5,
});

const mockPdfDocument: DocumentType = {
  id: PDF_DOC_ID,
  __typename: "DocumentType",
  title: "Test PDF Document",
  fileType: "application/pdf",
  pdfFile: MOCK_PDF_URL,
  pawlsParseFile: "dummy-pawls.json",
  txtExtractFile: undefined,
  mdSummaryFile: "dummy-summary.md",
  creator: { __typename: "UserType", id: "user-1", email: "test@test.com" },
  created: new Date("2023-10-26T10:00:00.000Z").toISOString(),
  myPermissions: [PermissionTypes.CAN_READ, PermissionTypes.CAN_UPDATE],
  allAnnotations: [],
  allStructuralAnnotations: [],
  allRelationships: [],
  allDocRelationships: [],
  allNotes: [],
};

const mockTxtDocument: DocumentType = {
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
  myPermissions: [PermissionTypes.CAN_READ],
  labelSet: {
    __typename: "LabelSetType",
    id: "ls-1",
    allAnnotationLabels: [
      {
        __typename: "AnnotationLabelType",
        id: "lbl-span-1",
        text: "Person",
        labelType: LabelType.SpanLabel,
        color: "#FF0000",
        icon: null,
      },
      {
        __typename: "AnnotationLabelType",
        id: "lbl-rel-1",
        text: "Connects",
        labelType: LabelType.RelationshipLabel,
        color: "#00FF00",
        icon: null,
      },
      {
        __typename: "AnnotationLabelType",
        id: "lbl-doc-1",
        text: "Contract",
        labelType: LabelType.DocTypeLabel,
        color: "#0000FF",
        icon: null,
      },
    ],
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// │                        All GraphQL Mocks (including new)                   │
// ──────────────────────────────────────────────────────────────────────────────

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

const graphqlMocks: MockedResponse[] = [
  // 1) Original knowledge+annotations query for PDF
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
];

const LONG_TIMEOUT = 20_000;

// ──────────────────────────────────────────────────────────────────────────────
// │                         REST / Asset Mock Helpers                         │
// ──────────────────────────────────────────────────────────────────────────────

async function registerRestMocks(page: Page): Promise<void> {
  await page.route("**/api/pawls/*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          page: { page_id: 0, height: 792, width: 612 },
          tokens: [createMockToken(0, "Mock Pawls Token")],
        },
      ]),
    })
  );

  await page.route("**/api/rawtext/*", (route) =>
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
    try {
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
      console.log(
        `[MOCK] Served PDF file successfully for ${route.request().url()}`
      );
    } catch (err) {
      console.error(
        `[MOCK ERROR] Error reading PDF file: ${TEST_PDF_PATH}`,
        err
      );
      await route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: `Error reading PDF: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    }
  });

  await page.route(/.*pdf\.worker.*\.js(\?.*)?$/, async (route) => {
    console.log(`[MOCK] pdf.worker.js request: ${route.request().url()}`);
    try {
      const workerPath = require.resolve("pdfjs-dist/build/pdf.worker.mjs");
      if (!fs.existsSync(workerPath)) {
        console.error(
          `[MOCK ERROR] pdf.worker.js not found at resolved path: ${workerPath}`
        );
        const fallbackPath = path.join(
          __dirname,
          "../../node_modules/pdfjs-dist/build/pdf.worker.mjs"
        );
        if (!fs.existsSync(fallbackPath)) {
          console.error(
            `[MOCK ERROR] pdf.worker.js not found at fallback path: ${fallbackPath}`
          );
          return route.fulfill({ status: 404, body: "Worker not found" });
        }
        console.log(
          `[MOCK] Using fallback path for pdf.worker.js: ${fallbackPath}`
        );
        const contents = fs.readFileSync(fallbackPath);
        await route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: contents,
        });
      } else {
        console.log(`[MOCK] Found pdf.worker.js at: ${workerPath}`);
        const contents = fs.readFileSync(workerPath);
        await route.fulfill({
          status: 200,
          contentType: "application/javascript",
          body: contents,
          headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
        });
      }
      console.log("[MOCK] Served pdf.worker.js successfully");
    } catch (err) {
      console.error("[MOCK ERROR] Unable to serve pdf.worker.js", err);
      await route.fulfill({ status: 500, body: "Worker load error" });
    }
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// │                               Test Suite                                  │
// ──────────────────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1280, height: 720 } });

test.beforeEach(async ({ page }) => {
  page.on("request", (request) =>
    console.log(`>> ${request.method()} ${request.url()}`)
  );
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
  page.on("requestfailed", (req) => {
    console.warn(
      `[⚠️ FAILED Request] ${req.failure()?.errorText} ${req.url()}`
    );
  });
  page.on("pageerror", (err) => {
    console.error(`[PAGE ERROR] ${err.message}\n${err.stack}`);
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.error(`[CONSOLE ERROR] ${msg.text()}`);
    } else {
      console.log(`[CONSOLE] ${msg.text()}`);
    }
  });

  await registerRestMocks(page);
});

test("renders PDF document title and summary on initial load", async ({
  mount,
  page,
}) => {
  await mount(
    <MockedProvider mocks={graphqlMocks} addTypename={true}>
      <DocumentKnowledgeBase documentId={PDF_DOC_ID} corpusId={CORPUS_ID} />
    </MockedProvider>
  );

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

test("switches to Annotations tab and renders PDF container", async ({
  mount,
  page,
}) => {
  await mount(
    <MockedProvider mocks={graphqlMocks} addTypename={true}>
      <DocumentKnowledgeBase documentId={PDF_DOC_ID} corpusId={CORPUS_ID} />
    </MockedProvider>
  );

  await page.getByRole("button", { name: "Annotations" }).click();

  await page.waitForTimeout(100);

  await expect(page.getByRole("button", { name: "Annotations" })).toHaveClass(
    /active/,
    { timeout: LONG_TIMEOUT }
  );
  await expect(page.locator("#pdf-container")).toBeVisible({
    timeout: LONG_TIMEOUT,
  });
  await expect(
    page.locator("#pdf-container .react-pdf__Page__canvas")
  ).toBeVisible({ timeout: LONG_TIMEOUT });
});

test("renders TXT document and shows plain-text container with content", async ({
  mount,
  page,
}) => {
  await mount(
    <MockedProvider mocks={graphqlMocks} addTypename={true}>
      <DocumentKnowledgeBase documentId={TXT_DOC_ID} corpusId={CORPUS_ID} />
    </MockedProvider>
  );

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
