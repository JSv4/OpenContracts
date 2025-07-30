import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MetadataTestWrapper } from "./MetadataTestWrapper";
import { CorpusMetadataSettings } from "../src/components/corpuses/CorpusMetadataSettings";
import {
  GET_CORPUS_METADATA_COLUMNS,
  CREATE_METADATA_COLUMN,
  UPDATE_METADATA_COLUMN,
  DELETE_METADATA_COLUMN,
} from "../src/graphql/metadataOperations";
import { createMockColumn } from "./factories/metadataFactories";
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
      dataType: MetadataDataType.INTEGER,
      validationConfig: { min_value: 0 },
      orderIndex: 1,
    }),
  ];

  // mockFieldset no longer needed with updated flat-column GraphQL mocks

  const baseMocks = [
    {
      request: {
        query: GET_CORPUS_METADATA_COLUMNS,
        variables: { corpusId },
      },
      result: {
        data: {
          corpusMetadataColumns: mockColumns,
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

    // Check data types (ensure unique element)
    await expect(page.getByText(/^DATE$/)).toBeVisible();
    await expect(page.getByText(/^INTEGER$/)).toBeVisible();

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
            corpusMetadataColumns: [],
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
      page.getByRole("button", { name: /add.*field/i }).first()
    ).toBeVisible();
  });

  test("adds new metadata column", async ({ mount, page }) => {
    const newStatusColumn = createMockColumn({
      id: "col3",
      name: "Status",
      dataType: MetadataDataType.STRING,
      orderIndex: 2,
    });

    const createMock = {
      request: {
        query: CREATE_METADATA_COLUMN,
        variables: {
          corpusId,
          name: "Status",
          dataType: "STRING",
          validationConfig: { required: false },
          defaultValue: "",
          displayOrder: 2,
        },
      },
      result: {
        data: {
          createMetadataColumn: {
            ok: true,
            message: "Column created",
            obj: newStatusColumn,
          },
        },
      },
    };

    const refetchAfterCreateMock = {
      request: {
        query: GET_CORPUS_METADATA_COLUMNS,
        variables: { corpusId },
      },
      result: {
        data: {
          corpusMetadataColumns: [...mockColumns, newStatusColumn],
        },
      },
    };

    await mount(
      <MetadataTestWrapper
        mocks={[...baseMocks, createMock, refetchAfterCreateMock]}
      >
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Click add button
    const addFieldButton = page
      .getByRole("button", { name: /add.*field/i })
      .first();
    await addFieldButton.click({ force: true });
    await page.waitForTimeout(500); // Wait for modal animation

    // Modal should appear
    await expect(page.getByText("Create Metadata Field")).toBeVisible();

    // Fill form
    await page.getByLabel("Field Name").fill("Status");

    // Select data type
    const dropdown = page.locator("#metadata-data-type").first();
    await dropdown.click();
    await page.getByRole("option", { name: "Short Text" }).click();

    await page.waitForTimeout(500); // Allow state to settle

    // Save
    await page.getByText("Create Field").click();

    // Modal should close and new column should appear
    await expect(page.getByText("Create Metadata Field")).not.toBeVisible();
    await expect(page.getByText("Status")).toBeVisible();
  });

  test("adds column with validation rules", async ({ mount, page }) => {
    const newPriorityColumn = createMockColumn({
      id: "col3",
      name: "Priority",
      dataType: MetadataDataType.CHOICE,
      validationConfig: { choices: ["High", "Medium", "Low"] },
      orderIndex: 2,
    });

    const createMock = {
      request: {
        query: CREATE_METADATA_COLUMN,
        variables: {
          corpusId,
          name: "Priority",
          dataType: "CHOICE",
          validationConfig: {
            choices: ["High", "Medium", "Low"],
            required: false,
          },
          defaultValue: null,
          displayOrder: 2,
        },
      },
      result: {
        data: {
          createMetadataColumn: {
            ok: true,
            message: "Column created",
            obj: newPriorityColumn,
          },
        },
      },
    };

    const refetchAfterCreateMock2 = {
      request: {
        query: GET_CORPUS_METADATA_COLUMNS,
        variables: { corpusId },
      },
      result: {
        data: {
          corpusMetadataColumns: [...mockColumns, newPriorityColumn],
        },
      },
    };

    await mount(
      <MetadataTestWrapper
        mocks={[...baseMocks, createMock, refetchAfterCreateMock2]}
      >
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    await page
      .getByRole("button", { name: /add.*field/i })
      .first()
      .click();

    await page.getByLabel("Field Name").fill("Priority");

    // Select dropdown type
    const typeDropdown = page.locator("#metadata-data-type").first();
    await typeDropdown.click();
    await page.getByRole("option", { name: "Single Choice" }).click();

    await page.waitForTimeout(500); // Allow state to settle

    // Fill first choice and add two more
    const choice1 = page.locator('input[placeholder="Choice 1"]');
    await choice1.fill("High");
    await page.getByText("Add Choice").click();
    const choice2 = page.locator('input[placeholder="Choice 2"]');
    await choice2.fill("Medium");
    await page.getByText("Add Choice").click();
    const choice3 = page.locator('input[placeholder="Choice 3"]');
    await choice3.fill("Low");

    await page.getByText("Create Field").click();

    // Verify choices are displayed
    await expect(page.getByText("Choices: High, Medium, Low")).toBeVisible();
  });

  test("reorders columns with buttons", async ({ mount, page }) => {
    await mount(
      <MetadataTestWrapper mocks={baseMocks}>
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Find move down button for first item
    const firstRow = page
      .locator('[data-testid="metadata-column-row"]')
      .first();
    const moveDownBtn = firstRow.locator("button:has(i.chevron.down.icon)");

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
          name: "Contract Value",
          validationConfig: {
            required: false,
            min_value: 0,
            max_value: 1000000,
          },
          defaultValue: null,
        },
      },
      result: {
        data: {
          updateMetadataColumn: {
            ok: true,
            message: "Updated",
            obj: {
              ...mockColumns[1],
              validationConfig: {
                min_value: 0,
                max_value: 1000000,
                required: false,
              },
              __typename: "ColumnType",
            },
          },
        },
      },
    };

    const refetchAfterUpdateMock = {
      request: {
        query: GET_CORPUS_METADATA_COLUMNS,
        variables: { corpusId },
      },
      result: {
        data: {
          corpusMetadataColumns: [
            mockColumns[0],
            {
              ...mockColumns[1],
              validationConfig: {
                min_value: 0,
                max_value: 1000000,
                required: false,
              },
            },
          ],
        },
      },
    };

    await mount(
      <MetadataTestWrapper
        mocks={[...baseMocks, updateMock, refetchAfterUpdateMock]}
      >
        <CorpusMetadataSettings corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Click edit on Contract Value row
    const valueRow = page
      .locator('[data-testid="metadata-column-row"]')
      .filter({
        hasText: "Contract Value",
      });
    await valueRow.locator("button:has(i.edit.icon)").click({ force: true });
    await page.waitForTimeout(500); // Wait for modal animation

    // Modal should show with existing values
    await expect(page.getByText("Edit Metadata Field")).toBeVisible();
    await expect(page.getByLabel("Field Name")).toHaveValue("Contract Value");

    // Wait for validation fields to render
    await page.waitForSelector("#metadata-min-value", { state: "visible" });
    await expect(page.getByLabel("Minimum Value")).toHaveValue("0");

    // Add max constraint
    await page.getByLabel("Maximum Value").fill("1000000");
    await page.getByText("Update Field").click();

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
            ok: true,
            message: "Deleted",
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
            corpusMetadataColumns: [mockColumns[0]],
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
    await valueRow.locator("button:has(i.trash.icon)").click();

    // Confirm deletion
    await page.getByRole("button", { name: "Delete Field" }).click();

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
            corpusMetadataColumns: mockColumns,
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
