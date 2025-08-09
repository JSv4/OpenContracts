import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MockedResponse } from "@apollo/client/testing";
import RouteStateSyncSlugHarness from "./RouteStateSyncSlugHarness";
import {
  CORPUS_BY_SLUGS,
  DOCUMENT_BY_SLUGS,
  DOCUMENT_IN_CORPUS_BY_SLUGS,
} from "../src/graphql/queries";

// Note: components mounted by Playwright CT must be imported from a module (not defined inline)

test("@slug triplet resolves corpus and document", async ({ mount, page }) => {
  const mocks: ReadonlyArray<MockedResponse> = [
    {
      request: {
        query: CORPUS_BY_SLUGS,
        variables: { userSlug: "JSv4", corpusSlug: "RepoOne" },
      },
      result: {
        data: {
          corpusBySlugs: {
            __typename: "CorpusType",
            id: "corpus-1",
            slug: "RepoOne",
            title: "Repo One",
          },
        },
      },
    },
    {
      request: {
        query: DOCUMENT_IN_CORPUS_BY_SLUGS,
        variables: {
          userSlug: "JSv4",
          corpusSlug: "RepoOne",
          documentSlug: "DocAlpha",
        },
      },
      result: {
        data: {
          documentInCorpusBySlugs: {
            __typename: "DocumentType",
            id: "doc-1",
            slug: "DocAlpha",
            title: "Doc Alpha",
          },
        },
      },
    },
  ];

  const component = await mount(
    <RouteStateSyncSlugHarness
      initialPath="/JSv4/RepoOne/DocAlpha"
      mocks={mocks}
    />
  );
  await expect(page.getByTestId("corpus-id")).toHaveText("corpus-1");
  await expect(page.getByTestId("document-id")).toHaveText("doc-1");
  await component.unmount();
});

test("@slug pair resolves corpus only", async ({ mount, page }) => {
  const mocks: ReadonlyArray<MockedResponse> = [
    {
      request: {
        query: CORPUS_BY_SLUGS,
        variables: { userSlug: "Alice", corpusSlug: "DataRepo" },
      },
      result: {
        data: {
          corpusBySlugs: {
            __typename: "CorpusType",
            id: "corpus-42",
            slug: "DataRepo",
            title: "Data Repo",
          },
        },
      },
    },
  ];

  const component = await mount(
    <RouteStateSyncSlugHarness initialPath="/Alice/DataRepo" mocks={mocks} />
  );
  await expect(page.getByTestId("corpus-id")).toHaveText("corpus-42");
  await expect(page.getByTestId("document-id")).toHaveText("");
  await component.unmount();
});

test("@slug pair resolves document-only", async ({ mount, page }) => {
  const mocks: ReadonlyArray<MockedResponse> = [
    {
      request: {
        query: CORPUS_BY_SLUGS,
        variables: { userSlug: "Bob", corpusSlug: "MaybeCorpus" },
      },
      // Simulate not found corpus so hook falls back to document resolver
      result: { data: { corpusBySlugs: null } },
    },
    {
      request: {
        query: DOCUMENT_BY_SLUGS,
        variables: { userSlug: "Bob", documentSlug: "LooseDoc" },
      },
      result: {
        data: {
          documentBySlugs: {
            __typename: "DocumentType",
            id: "doc-99",
            slug: "LooseDoc",
            title: "Loose Doc",
          },
        },
      },
    },
  ];

  const component = await mount(
    <RouteStateSyncSlugHarness initialPath="/Bob/LooseDoc" mocks={mocks} />
  );
  await expect(page.getByTestId("corpus-id")).toHaveText("");
  await expect(page.getByTestId("document-id")).toHaveText("doc-99");
  await component.unmount();
});
