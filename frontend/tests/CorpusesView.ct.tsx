import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MockedResponse } from "@apollo/client/testing";
import { CorpusesTestWrapper } from "./CorpusesTestWrapper";
import { openedCorpus } from "../src/graphql/cache";
import {
  GET_CORPUSES,
  GET_CORPUS_STATS,
  GET_CORPUS_METADATA,
} from "../src/graphql/queries";
import { PermissionTypes } from "../src/components/types";
import { CorpusType } from "../src/types/graphql-api";

/* -------------------------------------------------------------------------- */
/* Mock Data                                                                   */
/* -------------------------------------------------------------------------- */
const dummyCorpus: CorpusType = {
  id: "CORPUS_PLAYWRIGHT",
  title: "Playwright Dummy Corpus",
  isPublic: false,
  description: "",
  created: new Date().toISOString(),
  modified: new Date().toISOString(),
  creator: { id: "USER1", email: "tester@example.com", __typename: "UserType" },
  labelSet: null,
  allowComments: true,
  preferredEmbedder: null,
  myPermissions: [PermissionTypes.CAN_UPDATE, PermissionTypes.CAN_READ],
  analyses: {
    edges: [],
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
      __typename: "PageInfo",
    },
  },
  annotations: {
    edges: [],
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
      __typename: "PageInfo",
    },
  },
  documents: {
    edges: [],
    pageInfo: {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
      __typename: "PageInfo",
    },
  },
  __typename: "CorpusType",
};

const mocks: MockedResponse[] = [
  {
    request: { query: GET_CORPUSES, variables: {} },
    result: {
      data: {
        corpuses: {
          edges: [{ node: dummyCorpus, __typename: "CorpusTypeEdge" }],
          pageInfo: {
            hasNextPage: false,
            hasPreviousPage: false,
            startCursor: null,
            endCursor: null,
            __typename: "PageInfo",
          },
          __typename: "CorpusTypeConnection",
        },
      },
    },
  },
  {
    request: {
      query: GET_CORPUS_STATS,
      variables: { corpusId: dummyCorpus.id },
    },
    result: {
      data: {
        corpusStats: {
          totalDocs: 2,
          totalAnnotations: 0,
          totalAnalyses: 0,
          totalExtracts: 0,
          __typename: "CorpusStatsType",
        },
      },
    },
  },
  {
    request: {
      query: GET_CORPUS_METADATA,
      variables: { metadataForCorpusId: dummyCorpus.id },
    },
    result: { data: { corpusMetadata: [] } },
  },
];

function mountCorpuses(mount: any) {
  openedCorpus(dummyCorpus);
  return mount(<CorpusesTestWrapper mocks={mocks} />);
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                       */
/* -------------------------------------------------------------------------- */

test("sidebar expands and tab navigation works", async ({ mount, page }) => {
  await mountCorpuses(mount);

  // Click the corpus card to open it first
  await page.locator(".header", { hasText: "Playwright Dummy Corpus" }).click();

  const sidebar = page.locator('[data-testid="navigation-sidebar"]');
  await expect(sidebar).toBeVisible();

  // collapsed width close to 72px
  const collapsedWidth = await sidebar.evaluate(
    (el) => el.getBoundingClientRect().width
  );
  expect(collapsedWidth).toBeLessThan(80);

  // Hover to expand
  await sidebar.hover();
  await page.waitForTimeout(300);
  const expandedWidth = await sidebar.evaluate(
    (el) => el.getBoundingClientRect().width
  );
  expect(expandedWidth).toBeGreaterThan(collapsedWidth);

  // Click Documents tab
  await page.locator('[data-item-id="documents"]').click();
  // Search placeholder for documents appears
  await expect(
    page.getByPlaceholder("Search for document in corpus...")
  ).toBeVisible();

  // Click Annotations tab
  await page.locator('[data-item-id="annotations"]').click();
  await expect(
    page.getByPlaceholder("Search for annotated text in corpus...")
  ).toBeVisible();
});
