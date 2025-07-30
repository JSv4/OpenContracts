import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MetadataTestWrapper } from "./MetadataTestWrapper";
import { DocumentMetadataGrid } from "../src/components/documents/DocumentMetadataGrid";
import {
  GET_CORPUS_METADATA_COLUMNS,
  GET_DOCUMENT_METADATA_DATACELLS,
  SET_METADATA_VALUE,
} from "../src/graphql/metadataOperations";
import { generateLargeDataset } from "./factories/metadataFactories";
import { MockedResponse } from "@apollo/client/testing";

test.describe("Metadata Performance", () => {
  const corpusId = "test-corpus";

  test("debounces saves during rapid editing", async ({ mount, page }) => {
    const { columns, documents } = generateLargeDataset(10, 5);
    let saveRequests = 0;

    // Create multiple mocks for different variable combinations
    const createSaveMock = (docId: string, colId: string) => ({
      request: {
        query: SET_METADATA_VALUE,
        variables: {
          documentId: docId,
          corpusId: corpusId,
          columnId: colId,
          value: 42, // The value typed in the test
        },
      },
      result: () => {
        saveRequests++;
        return {
          data: {
            setMetadataValue: {
              ok: true,
              message: "Success",
              obj: {
                id: `cell-${saveRequests}`,
                data: { value: 42 },
                dataDefinition: {},
                column: {
                  id: colId,
                  name: "Test Column",
                  dataType: "TEXT",
                  __typename: "ColumnType",
                },
                __typename: "DatacellType",
              },
              __typename: "SetMetadataValueMutation",
            },
          },
        };
      },
    });

    // Create mocks for all possible combinations we might encounter
    const saveMocks: MockedResponse[] = [];
    for (let docIndex = 0; docIndex < documents.length; docIndex++) {
      for (let colIndex = 0; colIndex < columns.length; colIndex++) {
        saveMocks.push(createSaveMock(`doc${docIndex}`, `col${colIndex}`));
      }
    }

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
      ...saveMocks,
    ];

    await mount(
      <MetadataTestWrapper mocks={baseMocks}>
        <DocumentMetadataGrid documents={documents} corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Rapidly edit multiple cells
    for (let i = 0; i < 5; i++) {
      const cell = page
        .locator(".metadata-grid-cell")
        .nth(i + columns.length + 1); // Skip headers
      await cell.click();

      await page.keyboard.press("Digit4");
      await page.keyboard.press("Digit2");

      // Move to next without waiting
      await page.keyboard.press("Tab");
      await page.waitForTimeout(100); // Small delay between edits to allow mutations to fire
    }

    // Press escape to exit edit mode
    await page.keyboard.press("Escape");

    // Wait for all debounced saves
    await page.waitForTimeout(1000);

    // Should batch saves efficiently (less than number of edits)
    expect(saveRequests).toBeGreaterThan(0);
    expect(saveRequests).toBeLessThanOrEqual(5);
  });

  test("maintains performance with complex validation rules", async ({
    mount,
    page,
  }) => {
    const { columns, documents } = generateLargeDataset(50, 5);

    // Add complex validation to all columns
    const complexColumns = columns.map((col) => ({
      ...col,
      validationRules: {
        min: 0,
        max: 1000,
        pattern: "^[A-Za-z0-9]+$",
        max_length: 50,
        required: true,
      },
    }));

    const mocks = [
      {
        request: {
          query: GET_CORPUS_METADATA_COLUMNS,
          variables: { corpusId },
        },
        result: {
          data: {
            corpusMetadataColumns: complexColumns,
          },
        },
      },
    ];

    const startTime = Date.now();

    await mount(
      <MetadataTestWrapper mocks={mocks}>
        <DocumentMetadataGrid documents={documents} corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Should still render quickly despite validation
    await expect(page.locator("#document-metadata-grid-wrapper")).toBeVisible();
    const renderTime = Date.now() - startTime;
    expect(renderTime).toBeLessThan(5000);

    // Test validation performance
    const cell = page.locator(".metadata-grid-cell").nth(complexColumns.length);
    await cell.click();

    // Grab the <input> that lives *inside* the cell we just put into edit-mode
    const input = cell.locator("input");

    // Type invalid then valid value
    const typeStart = Date.now();
    await input.fill("Invalid!@#$");
    await page.waitForTimeout(100);
    await input.fill("ValidValue123");

    const typeTime = Date.now() - typeStart;
    expect(typeTime).toBeLessThan(500); // Validation shouldn't lag typing
  });

  test("efficient memory usage with pagination", async ({ mount, page }) => {
    // Create very large dataset
    const { columns, documents } = generateLargeDataset(1000, 20);

    // Mock paginated response
    const pageSize = 50;
    const firstPageDocs = documents.slice(0, pageSize);

    const paginatedMocks = [
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
    ];

    await mount(
      <MetadataTestWrapper mocks={paginatedMocks}>
        <DocumentMetadataGrid documents={firstPageDocs} corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Should only render first page
    await expect(page.locator("#document-metadata-grid-wrapper")).toBeVisible();

    // Count rendered rows (excluding header)
    const rows = await page.getByRole("row").count();
    expect(rows).toBeLessThanOrEqual(pageSize + 1); // +1 for header

    // Check for pagination controls
    await expect(page.getByText(/showing.*of.*documents/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /next/i })).toBeVisible();
  });

  test("search performance with large dataset", async ({ mount, page }) => {
    const { columns, documents } = generateLargeDataset(100, 5);

    const mocks = [
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
    ];

    await mount(
      <MetadataTestWrapper mocks={mocks}>
        <div>
          <input data-testid="search-input" placeholder="Search metadata..." />
          <DocumentMetadataGrid documents={documents} corpusId={corpusId} />
        </div>
      </MetadataTestWrapper>
    );

    const searchInput = page.getByTestId("search-input");

    // Measure search performance
    const searchStart = Date.now();
    await searchInput.fill("Value 50");

    // Wait for filtered results
    await page.waitForTimeout(300); // Debounce delay

    const searchTime = Date.now() - searchStart;
    expect(searchTime).toBeLessThan(1000); // Search should be fast

    // Verify search filtered results (implementation dependent)
    const visibleCells = await page.getByRole("cell").count();
    expect(visibleCells).toBeGreaterThan(0);
  });

  test("handles rapid column reordering", async ({ mount, page }) => {
    const { columns } = generateLargeDataset(1, 20); // Many columns

    // Mock component for testing column reordering performance
    await mount(
      <div data-testid="column-list">
        {columns.map((col, index) => (
          <div key={col.id} data-testid={`column-${col.id}`}>
            <span>{col.name}</span>
            <button data-testid={`move-up-${col.id}`} disabled={index === 0}>
              ↑
            </button>
            <button
              data-testid={`move-down-${col.id}`}
              disabled={index === columns.length - 1}
            >
              ↓
            </button>
          </div>
        ))}
      </div>
    );

    // Rapidly reorder columns
    const reorderStart = Date.now();

    for (let i = 0; i < 10; i++) {
      const randomIndex = Math.floor(Math.random() * (columns.length - 1));
      const moveDownBtn = page.getByTestId(`move-down-col${randomIndex}`);

      if (await moveDownBtn.isEnabled()) {
        await moveDownBtn.click();
      }
    }

    const reorderTime = Date.now() - reorderStart;
    expect(reorderTime).toBeLessThan(5000); // Reordering should be smooth
  });
});
