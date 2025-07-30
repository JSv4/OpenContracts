import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MetadataTestWrapper } from "./MetadataTestWrapper";
import { CorpusMetadataSettings } from "../src/components/corpuses/CorpusMetadataSettings";
import {
  GET_CORPUS_METADATA_COLUMNS,
  CREATE_METADATA_COLUMN,
} from "../src/graphql/metadataOperations";
import { GraphQLError } from "graphql";

test.describe("Metadata Error Handling", () => {
  const corpusId = "test-corpus";

  test("modal stays open when mutation fails", async ({ mount, page }) => {
    const errorMocks = [
      {
        request: {
          query: GET_CORPUS_METADATA_COLUMNS,
          variables: { corpusId },
        },
        result: {
          data: {
            corpusMetadataColumns: [],
          },
        },
      },
      {
        request: {
          query: CREATE_METADATA_COLUMN,
          variables: {
            corpusId: "test-corpus",
            name: "Test Field",
            dataType: "STRING",
            validationConfig: { required: false },
            defaultValue: "",
            helpText: undefined,
            displayOrder: 0,
          },
        },
        result: {
          errors: [new GraphQLError("Mutation failed")],
        },
      },
    ];

    await mount(
      <MetadataTestWrapper mocks={errorMocks}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Wait for component to load
    await expect(page.getByText("No metadata fields defined")).toBeVisible();

    // Open modal
    await page.locator('//*[@id="root"]/div/div[2]/button').click();
    await expect(page.getByText("Create Metadata Field")).toBeVisible();

    // Fill form
    await page.getByLabel("Field Name").fill("Test Field");
    await page.getByRole("button", { name: "Create Field" }).click();

    // Wait a moment for the mutation to complete
    await page.waitForTimeout(500);

    // Modal should stay open after error (key behavior to test)
    await expect(page.getByText("Create Metadata Field")).toBeVisible();

    // Field name should still be populated (form not cleared on error)
    await expect(page.getByLabel("Field Name")).toHaveValue("Test Field");
  });

  test("loading state displays correctly", async ({ mount, page }) => {
    // Mock that delays to show loading state
    const loadingMock = {
      request: {
        query: GET_CORPUS_METADATA_COLUMNS,
        variables: { corpusId },
      },
      delay: 2000,
      result: {
        data: {
          corpusMetadataColumns: [],
        },
      },
    };

    await mount(
      <MetadataTestWrapper mocks={[loadingMock]}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Should show loading state
    await expect(page.getByTestId("metadata-loading")).toBeVisible();

    // Eventually shows content
    await expect(page.getByText("No metadata fields defined")).toBeVisible({
      timeout: 3000,
    });
  });

  test("form validation prevents submission", async ({ mount, page }) => {
    const baseMocks = [
      {
        request: {
          query: GET_CORPUS_METADATA_COLUMNS,
          variables: { corpusId },
        },
        result: {
          data: {
            corpusMetadataColumns: [],
          },
        },
      },
    ];

    await mount(
      <MetadataTestWrapper mocks={baseMocks}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Open modal
    await page.locator('//*[@id="root"]/div/div[2]/button').click();

    // Try to save without filling required field
    await page.getByRole("button", { name: "Create Field" }).click();

    // Modal should still be open
    await expect(page.getByText("Create Metadata Field")).toBeVisible();

    // Should show validation error
    await expect(page.getByText("Field name is required")).toBeVisible();
  });

  test("network error shows retry option", async ({ mount, page }) => {
    const networkErrorMock = {
      request: {
        query: GET_CORPUS_METADATA_COLUMNS,
        variables: { corpusId },
      },
      error: new Error("Network error"),
    };

    await mount(
      <MetadataTestWrapper mocks={[networkErrorMock]}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Should show error message
    await expect(page.getByText(/failed to load metadata/i)).toBeVisible();

    // Should show retry button
    await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
  });

  test("can retry after error", async ({ mount, page }) => {
    let attemptCount = 0;

    const firstAttemptMock = {
      request: {
        query: GET_CORPUS_METADATA_COLUMNS,
        variables: { corpusId },
      },
      error: new Error("Network error"),
    };

    const secondAttemptMock = {
      request: {
        query: GET_CORPUS_METADATA_COLUMNS,
        variables: { corpusId },
      },
      result: {
        data: {
          corpusMetadataColumns: [],
        },
      },
    };

    await mount(
      <MetadataTestWrapper mocks={[firstAttemptMock, secondAttemptMock]}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // First attempt fails
    await expect(page.getByText(/failed to load metadata/i)).toBeVisible();

    // Click retry
    await page.getByRole("button", { name: /retry/i }).click();

    // Should succeed on retry
    await expect(page.getByText("No metadata fields defined")).toBeVisible();
  });
});
