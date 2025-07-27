import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MetadataTestWrapper } from "./MetadataTestWrapper";
import { CorpusMetadataSettings } from "../src/components/corpuses/CorpusMetadataSettings";
import { DocumentMetadataGrid } from "../src/components/documents/DocumentMetadataGrid";
import {
  GET_CORPUS_METADATA_COLUMNS,
  CREATE_METADATA_COLUMN,
  SET_METADATA_VALUE,
  GET_DOCUMENT_METADATA_DATACELLS,
} from "../src/graphql/metadataOperations";
import { createMetadataTestScenario } from "./factories/metadataFactories";
import { GraphQLError } from "graphql";

test.describe("Metadata Error Handling", () => {
  const corpusId = "test-corpus";

  test("handles GraphQL errors when creating column", async ({
    mount,
    page,
  }) => {
    const errorMocks = [
      {
        request: {
          query: GET_CORPUS_METADATA_COLUMNS,
          variables: { corpusId },
        },
        result: {
          data: {
            corpus: {
              id: corpusId,
              metadataSchema: null,
              __typename: "CorpusType",
            },
          },
        },
      },
      {
        request: {
          query: CREATE_METADATA_COLUMN,
          variables: expect.any(Object),
        },
        result: {
          errors: [new GraphQLError("Column name already exists")],
        },
      },
    ];

    await mount(
      <MetadataTestWrapper mocks={errorMocks}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Try to add a column
    await page.getByRole("button", { name: /add.*field/i }).click();
    await page.getByLabel("Field Name").fill("Duplicate Name");
    await page.getByRole("button", { name: /save/i }).click();

    // Should show error message
    await expect(page.getByText("Column name already exists")).toBeVisible();

    // Modal should stay open
    await expect(
      page.getByRole("heading", { name: /add metadata field/i })
    ).toBeVisible();
  });

  test("handles network errors gracefully", async ({ mount, page }) => {
    const networkErrorMocks = [
      {
        request: {
          query: GET_CORPUS_METADATA_COLUMNS,
          variables: { corpusId },
        },
        error: new Error("Network error"),
      },
    ];

    await mount(
      <MetadataTestWrapper mocks={networkErrorMocks}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Should show error state
    await expect(page.getByText(/failed to load metadata/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
  });

  test("handles concurrent edits with optimistic updates", async ({
    mount,
    page,
  }) => {
    const { columns, documents } = createMetadataTestScenario();

    // Simulate server returning different value than optimistic update
    const optimisticMock = {
      request: {
        query: SET_METADATA_VALUE,
        variables: {
          datacellId: expect.stringMatching(/cell/),
          value: "Client Value",
        },
      },
      result: {
        data: {
          setMetadataValue: {
            datacell: {
              id: "cell1",
              data: { value: "Server Value" }, // Different from client
              __typename: "DatacellType",
            },
            __typename: "SetMetadataValueMutation",
          },
        },
      },
      delay: 1000, // Simulate latency
    };

    const baseMocks = [
      {
        request: {
          query: GET_CORPUS_METADATA_COLUMNS,
          variables: { corpusId },
        },
        result: {
          data: {
            corpusMetadataColumns: columns,
          },
        },
      },
      optimisticMock,
    ];

    await mount(
      <MetadataTestWrapper mocks={baseMocks}>
        <DocumentMetadataGrid documents={documents} corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Edit a cell
    const cell = page.getByRole("cell", { name: "2024-01-01" }).first();
    await cell.click();

    const input = page.getByRole("textbox");
    await input.fill("Client Value");
    await page.keyboard.press("Enter");

    // Should show optimistic update immediately
    await expect(cell).toContainText("Client Value");

    // After server response, should show server value
    await expect(cell).toContainText("Server Value", { timeout: 2000 });
  });

  test("handles save failures with rollback", async ({ mount, page }) => {
    const { columns, documents } = createMetadataTestScenario();

    const failureMock = {
      request: {
        query: SET_METADATA_VALUE,
        variables: expect.any(Object),
      },
      error: new Error("Failed to save"),
    };

    const baseMocks = [
      {
        request: {
          query: GET_CORPUS_METADATA_COLUMNS,
          variables: { corpusId },
        },
        result: {
          data: {
            corpusMetadataColumns: columns,
          },
        },
      },
      failureMock,
    ];

    await mount(
      <MetadataTestWrapper mocks={baseMocks}>
        <DocumentMetadataGrid documents={documents} corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Wait for grid to load
    await expect(page.getByRole("grid")).toBeVisible();

    // Find the first date cell (which should contain the formatted date)
    const cells = page.getByRole("gridcell");
    const dateCell = cells.nth(1); // Skip document title cell
    await dateCell.click();

    const input = page.getByRole("textbox");
    await input.fill("2024-12-31");
    await page.keyboard.press("Enter");

    // Should show error message
    await expect(page.getByText(/failed to save/i)).toBeVisible();

    // Value should revert (check the cell still exists)
    await expect(dateCell).toBeVisible();
  });

  test("handles permission errors", async ({ mount, page }) => {
    const baseMocks = [
      {
        request: {
          query: GET_CORPUS_METADATA_COLUMNS,
          variables: { corpusId },
        },
        result: {
          data: {
            corpus: {
              id: corpusId,
              metadataSchema: null,
              __typename: "CorpusType",
            },
          },
        },
      },
    ];

    const permissionErrorMocks = [
      ...baseMocks,
      {
        request: {
          query: CREATE_METADATA_COLUMN,
          variables: expect.any(Object),
        },
        result: {
          errors: [
            new GraphQLError(
              "You don't have permission to modify metadata schema"
            ),
          ],
        },
      },
    ];

    await mount(
      <MetadataTestWrapper mocks={permissionErrorMocks}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Wait for component to load
    await expect(page.getByText("No metadata fields defined")).toBeVisible();

    // Try to add column
    await page.getByRole("button", { name: /add.*field/i }).click();

    // Modal should appear
    await expect(
      page.getByRole("heading", { name: /add metadata field/i })
    ).toBeVisible();

    await page.getByLabel("Field Name").fill("New Field");
    await page.getByRole("button", { name: /save/i }).click();

    // Should show permission error
    await expect(page.getByText(/don't have permission/i)).toBeVisible();
  });

  test("handles validation errors from server", async ({ mount, page }) => {
    const baseMocks = [
      {
        request: {
          query: GET_CORPUS_METADATA_COLUMNS,
          variables: { corpusId },
        },
        result: {
          data: {
            corpus: {
              id: corpusId,
              metadataSchema: null,
              __typename: "CorpusType",
            },
          },
        },
      },
    ];

    const validationErrorMocks = [
      ...baseMocks,
      {
        request: {
          query: CREATE_METADATA_COLUMN,
          variables: expect.any(Object),
        },
        result: {
          errors: [
            new GraphQLError("Validation error", {
              extensions: {
                code: "VALIDATION_ERROR",
                fields: {
                  name: ["Field name must be unique"],
                  dataType: ["Invalid data type selected"],
                },
              },
            }),
          ],
        },
      },
    ];

    await mount(
      <MetadataTestWrapper mocks={validationErrorMocks}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Wait for component to load
    await expect(page.getByText("No metadata fields defined")).toBeVisible();

    // Try to add column
    await page.getByRole("button", { name: /add.*field/i }).click();

    // Modal should appear
    await expect(
      page.getByRole("heading", { name: /add metadata field/i })
    ).toBeVisible();

    await page.getByLabel("Field Name").fill("Test");
    await page.getByRole("button", { name: /save/i }).click();

    // Should show field-specific errors
    await expect(page.getByText("Field name must be unique")).toBeVisible();
    await expect(page.getByText("Invalid data type selected")).toBeVisible();
  });

  test("handles timeout gracefully", async ({ mount, page }) => {
    // Mock that never resolves
    const timeoutMock = {
      request: {
        query: GET_CORPUS_METADATA_COLUMNS,
        variables: { corpusId },
      },
      delay: 30000, // 30 second delay to simulate timeout
      result: {
        data: {
          corpus: {
            id: corpusId,
            metadataSchema: null,
            __typename: "CorpusType",
          },
        },
      },
    };

    await mount(
      <MetadataTestWrapper mocks={[timeoutMock]}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Should show loading initially
    await expect(page.getByTestId("metadata-loading")).toBeVisible();

    // After reasonable timeout, should show error
    await expect(page.getByText(/request timed out/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test("recovers from errors when retrying", async ({ mount, page }) => {
    let attemptCount = 0;

    const retryMocks = [
      {
        request: {
          query: GET_CORPUS_METADATA_COLUMNS,
          variables: { corpusId },
        },
        result: () => {
          attemptCount++;
          if (attemptCount === 1) {
            throw new Error("First attempt failed");
          }
          return {
            data: {
              corpus: {
                id: corpusId,
                metadataSchema: null,
                __typename: "CorpusType",
              },
            },
          };
        },
      },
    ];

    await mount(
      <MetadataTestWrapper mocks={retryMocks}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // First attempt fails
    await expect(page.getByText(/failed to load/i)).toBeVisible();

    // Click retry
    await page.getByRole("button", { name: /retry/i }).click();

    // Should succeed on retry
    await expect(page.getByText("No metadata fields defined")).toBeVisible();
  });
});
