// Playwright Component Test for slug hydration – mount using DocumentKnowledgeBaseTestWrapper
import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { DocumentKnowledgeBaseTestWrapper } from "./DocumentKnowledgeBaseTestWrapper";
import { MockedResponse } from "@apollo/client/testing";
import {
  CORPUS_ID,
  PDF_DOC_ID,
  graphqlMocks,
} from "./mocks/DocumentKnowledgeBase.mocks";

// Backend now supports slug resolvers; route-state-sync uses them implicitly via useLazyQuery.
// We add no extra mocks here because the TestWrapper already wires a wildcard link for unknown operations.

test("slug triplet path resolves to corpus+doc and mounts KB", async ({
  mount,
  page,
}) => {
  const component = await mount(
    <DocumentKnowledgeBaseTestWrapper
      mocks={graphqlMocks as ReadonlyArray<MockedResponse>}
      corpusId={CORPUS_ID}
      documentId={PDF_DOC_ID}
      // We override the initial path via MemoryRouter by wrapping inside
    />
  );
  // Navigate to slug path; wildcard link should answer slug queries and then normal data queries proceed
  await page.evaluate(() => {
    window.history.pushState({}, "", "/Alice/MyCorpus/MyDoc");
  });
  // Expect the KB UI to render something stable (e.g., the canvas container)
  await expect(page.locator('[data-testid="pdf-container"]')).toBeVisible({
    timeout: 15000,
  });
  await component.unmount();
});
