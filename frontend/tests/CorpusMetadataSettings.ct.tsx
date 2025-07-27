import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MetadataTestWrapper } from "./MetadataTestWrapper";
import { CorpusMetadataSettings } from "../src/components/corpuses/CorpusMetadataSettings";
import {
  GET_CORPUS_METADATA_COLUMNS,
  CREATE_METADATA_COLUMN,
  UPDATE_METADATA_COLUMN,
  DELETE_METADATA_COLUMN,
  REORDER_METADATA_COLUMNS,
} from "../src/graphql/metadataOperations";
import {
  createMockColumn,
  createMockFieldset,
} from "./factories/metadataFactories";
import { MetadataDataType } from "../src/types/metadata";

test.describe("CorpusMetadataSettings", () => {
  const corpusId = "test-corpus";

  const mockColumns = [
    createMockColumn({
      id: "col1",
      name: "Contract Date",
      dataType: MetadataDataType.DATE,
      orderIndex: 0,
    }),
    createMockColumn({
      id: "col2",
      name: "Contract Value",
      dataType: MetadataDataType.NUMBER,
      validationRules: { min: 0 },
      orderIndex: 1,
    }),
  ];

  const mockFieldset = createMockFieldset(mockColumns);

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
            metadataSchema: mockFieldset,
            __typename: "CorpusType",
          },
        },
      },
    },
  ];

  test("displays metadata columns", async ({ mount, page }) => {
    await mount(
      <MetadataTestWrapper mocks={baseMocks}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Check column names
    await expect(page.getByText("Contract Date")).toBeVisible();
    await expect(page.getByText("Contract Value")).toBeVisible();

    // Check data types
    await expect(page.getByText("DATE")).toBeVisible();
    await expect(page.getByText("NUMBER")).toBeVisible();

    // Check validation info
    await expect(page.getByText("Min: 0")).toBeVisible();
  });

  test("shows empty state when no columns", async ({ mount, page }) => {
    const emptyMocks = [
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

    await mount(
      <MetadataTestWrapper mocks={emptyMocks}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    await expect(page.getByText("No metadata fields defined")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /add.*field/i })
    ).toBeVisible();
  });

  test("adds new metadata column", async ({ mount, page }) => {
    const createMock = {
      request: {
        query: CREATE_METADATA_COLUMN,
        variables: {
          corpusId,
          name: "Status",
          dataType: "STRING",
          extractIsList: false,
          validationRules: {},
        },
      },
      result: {
        data: {
          createMetadataColumn: {
            fieldset: {
              ...mockFieldset,
              columns: {
                ...mockFieldset.columns,
                edges: [
                  ...mockFieldset.columns.edges,
                  {
                    node: createMockColumn({
                      id: "col3",
                      name: "Status",
                      dataType: MetadataDataType.STRING,
                      orderIndex: 2,
                    }),
                    __typename: "ColumnTypeEdge",
                  },
                ],
              },
            },
            __typename: "CreateMetadataColumnMutation",
          },
        },
      },
    };

    await mount(
      <MetadataTestWrapper mocks={[...baseMocks, createMock]}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Click add button
    await page.getByRole("button", { name: /add.*field/i }).click();

    // Modal should appear
    await expect(
      page.getByRole("heading", { name: /add metadata field/i })
    ).toBeVisible();

    // Fill form
    await page.getByLabel("Field Name").fill("Status");

    // Select data type
    const dropdown = page.getByLabel("Data Type");
    await dropdown.click();
    await page.getByText("Text (Single Line)").click();

    // Save
    await page.getByRole("button", { name: /save/i }).click();

    // Modal should close and new column should appear
    await expect(
      page.getByRole("heading", { name: /add metadata field/i })
    ).not.toBeVisible();
    await expect(page.getByText("Status")).toBeVisible();
  });

  test("adds column with validation rules", async ({ mount, page }) => {
    const createMock = {
      request: {
        query: CREATE_METADATA_COLUMN,
        variables: {
          corpusId,
          name: "Priority",
          dataType: "STRING",
          extractIsList: false,
          validationRules: {
            choices: ["High", "Medium", "Low"],
          },
        },
      },
      result: {
        data: {
          createMetadataColumn: {
            fieldset: createMockFieldset([
              ...mockColumns,
              createMockColumn({
                id: "col3",
                name: "Priority",
                dataType: MetadataDataType.STRING,
                validationRules: { choices: ["High", "Medium", "Low"] },
                orderIndex: 2,
              }),
            ]),
            __typename: "CreateMetadataColumnMutation",
          },
        },
      },
    };

    await mount(
      <MetadataTestWrapper mocks={[...baseMocks, createMock]}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    await page.getByRole("button", { name: /add.*field/i }).click();

    await page.getByLabel("Field Name").fill("Priority");

    // Select dropdown type
    const typeDropdown = page.getByLabel("Data Type");
    await typeDropdown.click();
    await page.getByText("Text (Single Line)").click();

    // Add choices
    await page.getByLabel("Allowed Values").fill("High, Medium, Low");

    await page.getByRole("button", { name: /save/i }).click();

    // Verify choices are displayed
    await expect(page.getByText("Choices: High, Medium, Low")).toBeVisible();
  });

  test("reorders columns with buttons", async ({ mount, page }) => {
    const reorderMock = {
      request: {
        query: REORDER_METADATA_COLUMNS,
        variables: {
          corpusId,
          columnOrders: [
            { columnId: "col2", orderIndex: 0 },
            { columnId: "col1", orderIndex: 1 },
          ],
        },
      },
      result: {
        data: {
          reorderMetadataColumns: {
            fieldset: createMockFieldset([
              { ...mockColumns[1], orderIndex: 0 },
              { ...mockColumns[0], orderIndex: 1 },
            ]),
            __typename: "ReorderMetadataColumnsMutation",
          },
        },
      },
    };

    await mount(
      <MetadataTestWrapper mocks={[...baseMocks, reorderMock]}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Find move down button for first item
    const firstRow = page
      .locator('[data-testid="metadata-column-row"]')
      .first();
    const moveDownBtn = firstRow.getByRole("button", { name: /move down/i });

    await expect(moveDownBtn).toBeVisible();
    await moveDownBtn.click();

    // Wait for reorder to complete
    await page.waitForTimeout(500);

    // Verify order changed
    const rows = await page
      .locator('[data-testid="metadata-column-row"]')
      .all();
    await expect(rows[0]).toContainText("Contract Value");
    await expect(rows[1]).toContainText("Contract Date");
  });

  test("edits column validation rules", async ({ mount, page }) => {
    const updateMock = {
      request: {
        query: UPDATE_METADATA_COLUMN,
        variables: {
          columnId: "col2",
          validationRules: { min: 0, max: 1000000 },
        },
      },
      result: {
        data: {
          updateMetadataColumn: {
            column: {
              ...mockColumns[1],
              validationRules: { min: 0, max: 1000000 },
              __typename: "ColumnType",
            },
            __typename: "UpdateMetadataColumnMutation",
          },
        },
      },
    };

    await mount(
      <MetadataTestWrapper mocks={[...baseMocks, updateMock]}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Click edit on Contract Value row
    const valueRow = page
      .locator('[data-testid="metadata-column-row"]')
      .filter({
        hasText: "Contract Value",
      });
    await valueRow.getByRole("button", { name: /edit/i }).click();

    // Modal should show with existing values
    await expect(
      page.getByRole("heading", { name: /edit metadata field/i })
    ).toBeVisible();
    await expect(page.getByLabel("Field Name")).toHaveValue("Contract Value");
    await expect(page.getByLabel("Minimum Value")).toHaveValue("0");

    // Add max constraint
    await page.getByLabel("Maximum Value").fill("1000000");
    await page.getByRole("button", { name: /save/i }).click();

    // Verify updated
    await expect(page.getByText("Max: 1,000,000")).toBeVisible();
  });

  test("deletes metadata column", async ({ mount, page }) => {
    const deleteMock = {
      request: {
        query: DELETE_METADATA_COLUMN,
        variables: { columnId: "col2" },
      },
      result: {
        data: {
          deleteMetadataColumn: {
            success: true,
            __typename: "DeleteMetadataColumnMutation",
          },
        },
      },
    };

    // Updated mocks after deletion
    const afterDeleteMocks = [
      {
        request: {
          query: GET_CORPUS_METADATA_COLUMNS,
          variables: { corpusId },
        },
        result: {
          data: {
            corpus: {
              id: corpusId,
              metadataSchema: createMockFieldset([mockColumns[0]]),
              __typename: "CorpusType",
            },
          },
        },
      },
    ];

    await mount(
      <MetadataTestWrapper
        mocks={[...baseMocks, deleteMock, ...afterDeleteMocks]}
      >
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Find delete button for Contract Value
    const valueRow = page
      .locator('[data-testid="metadata-column-row"]')
      .filter({
        hasText: "Contract Value",
      });
    await valueRow.getByRole("button", { name: /delete/i }).click();

    // Confirm deletion
    await page.getByRole("button", { name: /confirm/i }).click();

    // Wait for deletion
    await page.waitForTimeout(500);

    // Contract Value should be gone, Contract Date should remain
    await expect(page.getByText("Contract Value")).not.toBeVisible();
    await expect(page.getByText("Contract Date")).toBeVisible();
  });

  test("handles loading state", async ({ mount, page }) => {
    const slowMocks = [
      {
        request: {
          query: GET_CORPUS_METADATA_COLUMNS,
          variables: { corpusId },
        },
        result: {
          data: {
            corpus: {
              id: corpusId,
              metadataSchema: mockFieldset,
              __typename: "CorpusType",
            },
          },
        },
        delay: 1000, // Simulate slow loading
      },
    ];

    await mount(
      <MetadataTestWrapper mocks={slowMocks}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Should show loading state
    await expect(page.getByTestId("metadata-loading")).toBeVisible();

    // Wait for data
    await expect(page.getByText("Contract Date")).toBeVisible({
      timeout: 2000,
    });
  });

  test("handles error state", async ({ mount, page }) => {
    const errorMocks = [
      {
        request: {
          query: GET_CORPUS_METADATA_COLUMNS,
          variables: { corpusId },
        },
        error: new Error("Failed to load metadata"),
      },
    ];

    await mount(
      <MetadataTestWrapper mocks={errorMocks}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    await expect(page.getByText(/failed to load metadata/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
  });
});
