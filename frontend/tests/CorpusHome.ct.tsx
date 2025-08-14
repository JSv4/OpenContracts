import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MockedResponse } from "@apollo/client/testing";
import { CorpusType } from "../src/types/graphql-api";
import { CorpusHomeTestWrapper } from "./CorpusHomeTestWrapper";
import {
  GET_CORPUS_STATS,
  GET_CORPUS_WITH_HISTORY,
} from "../src/graphql/queries";
import { PermissionTypes } from "../src/components/types";

/* --------------------------------------------------------------------------
 * Mock data & helpers
 * -------------------------------------------------------------------------- */
const dummyCorpus: CorpusType = {
  id: "CORPUS_1",
  title: "Playwright Test Corpus",
  isPublic: false,
  description: "Dummy corpus for component-testing CorpusHome.",
  created: new Date().toISOString(),
  modified: new Date().toISOString(),
  creator: {
    id: "USER_1",
    email: "tester@example.com",
    __typename: "UserType",
  },
  labelSet: null,
  allowComments: true,
  preferredEmbedder: null,
  myPermissions: [
    "update_corpus",
    "read_corpus",
  ] as unknown as PermissionTypes[],
  analyses: {
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    },
    edges: [],
  },
  annotations: {
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    },
    edges: [],
  },
  documents: {
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    },
    edges: [],
  },
  __typename: "CorpusType",
};

const mocks: MockedResponse[] = [
  {
    request: {
      query: GET_CORPUS_STATS,
      variables: { corpusId: dummyCorpus.id },
    },
    result: {
      data: {
        corpusStats: {
          totalDocs: 3,
          totalAnnotations: 5,
          totalAnalyses: 0,
          totalExtracts: 0,
          __typename: "CorpusStatsType",
        },
      },
    },
  },
  {
    request: {
      query: GET_CORPUS_WITH_HISTORY,
      variables: { id: dummyCorpus.id },
    },
    result: {
      data: {
        corpus: {
          id: dummyCorpus.id,
          slug: "test-corpus",
          title: dummyCorpus.title,
          description: dummyCorpus.description,
          mdDescription: null,
          created: dummyCorpus.created,
          modified: dummyCorpus.modified,
          isPublic: dummyCorpus.isPublic,
          myPermissions: dummyCorpus.myPermissions,
          creator: dummyCorpus.creator,
          labelSet: dummyCorpus.labelSet,
          descriptionRevisions: [],
          __typename: "CorpusType",
        },
      },
    },
  },
];

/**
 * Mount helper – wraps CorpusHome in MockedProvider with minimal cache.
 */
function mountCorpusHome(mount: any) {
  return mount(<CorpusHomeTestWrapper mocks={mocks} corpus={dummyCorpus} />);
}

/* --------------------------------------------------------------------------
 * Tests
 * -------------------------------------------------------------------------- */

test.use({ viewport: { width: 1200, height: 800 } });

test("renders corpus header, stats and description controls", async ({
  mount,
  page,
}) => {
  await mountCorpusHome(mount);

  /* ------------------------------------------------------------------
   * Header (title, privacy badge, stats)
   * ------------------------------------------------------------------ */
  const topBar = page.locator("#corpus-home-top-bar");
  await expect(topBar).toBeVisible();

  // Title is rendered
  await expect(
    topBar.locator("h1", { hasText: dummyCorpus.title })
  ).toBeVisible();

  // Privacy badge reflects corpus.isPublic
  const privacyText = dummyCorpus.isPublic ? "Public" : "Private";
  await expect(topBar.locator(`text=${privacyText}`)).toBeVisible();

  // Stat labels are present (values mocked via GET_CORPUS_STATS)
  const statLabels = ["Docs", "Notes", "Analyses", "Extracts"];
  for (const label of statLabels) {
    await expect(topBar.locator(`text=${label}`)).toBeVisible();
  }

  // Wait for mocked stats values to appear
  await expect(topBar.locator("text=3")).toBeVisible(); // Docs
  await expect(topBar.locator("text=5")).toBeVisible(); // Notes

  /* ------------------------------------------------------------------
   * Description card
   * ------------------------------------------------------------------ */
  const descriptionCard = page.locator("#corpus-home-description-card");
  await expect(descriptionCard).toBeVisible();

  // Section heading
  await expect(descriptionCard.locator("text=About this Corpus")).toBeVisible();

  // Description text
  await expect(
    descriptionCard.locator(
      "text=Dummy corpus for component-testing CorpusHome."
    )
  ).toBeVisible();

  /* ------------------------------------------------------------------
   * Action buttons (Version History + Edit Description)
   * ------------------------------------------------------------------ */
  await expect(
    page.getByRole("button", { name: "Version History" })
  ).toBeVisible();

  // Either "Edit Description" or "Add Description" should be available depending on permissions
  await expect(
    page.getByRole("button", { name: /(?:Edit|Add) Description/i })
  ).toBeVisible();
});
