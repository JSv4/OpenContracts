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
  myPermissions: [PermissionTypes.CAN_UPDATE, PermissionTypes.CAN_READ],
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
          mdDescription: null,
          __typename: "Corpus",
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

test("search bar expands on hover and collapses on mouse leave", async ({
  mount,
  page,
}) => {
  await mountCorpusHome(mount);

  const container = page.locator('[data-testid="search-container"]');
  await expect(container).toBeVisible();

  // Initially collapsed – quick-actions absent
  await expect(
    container.locator("text=Ask Questions About This Corpus")
  ).toBeHidden();

  // Hover to expand
  await container.hover();
  await expect(
    container.locator("text=Ask Questions About This Corpus")
  ).toBeVisible();

  // Move mouse away to collapse
  await page.mouse.move(0, 0);
  await expect(
    container.locator("text=Ask Questions About This Corpus")
  ).toBeHidden();
});
