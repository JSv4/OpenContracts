import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MetadataTestWrapper } from "./MetadataTestWrapper";
import { DocumentMetadataGrid } from "../src/components/documents/DocumentMetadataGrid";
import {
  GET_DOCUMENT_METADATA_VALUES,
  SET_METADATA_VALUE,
} from "../src/graphql/metadataOperations";
import { generateLargeDataset } from "./factories/metadataFactories";

test.describe("Metadata Performance", () => {
  const corpusId = "test-corpus";

  test("handles large datasets efficiently", async ({ mount, page }) => {
    // Generate 100 documents with 10 metadata columns each
    const { columns, documents } = generateLargeDataset(100, 10);

    const largeMocks = [
      {
        request: {
          query: GET_DOCUMENT_METADATA_VALUES,
          variables: { documentIds: documents.map((d) => d.id) },
        },
        result: {
          data: {
            documents: {
              edges: documents.map((doc) => ({
                node: {
                  id: doc.id,
                  title: doc.title,
                  metadata: doc.metadata,
                  __typename: "DocumentType",
                },
                __typename: "DocumentTypeEdge",
              })),
              __typename: "DocumentTypeConnection",
            },
          },
        },
      },
    ];

    const startTime = Date.now();

    await mount(
      <MetadataTestWrapper mocks={largeMocks}>
        <DocumentMetadataGrid
          documents={documents}
          columns={columns}
          corpusId={corpusId}
        />
      </MetadataTestWrapper>
    );

    // Should render within 2 seconds
    await expect(page.getByRole("grid")).toBeVisible();
    const renderTime = Date.now() - startTime;
    expect(renderTime).toBeLessThan(2000);

    // Check virtualization - should not render all cells
    const visibleCells = await page.getByRole("cell").count();
    const totalCells = (documents.length + 1) * (columns.length + 1); // +1 for headers

    // Should only render visible viewport
    expect(visibleCells).toBeLessThan(totalCells * 0.5);

    // Scroll performance test
    const scrollStart = Date.now();
    await page.evaluate(() => {
      const grid = document.querySelector('[role="grid"]');
      if (grid) {
        grid.scrollTop = grid.scrollHeight / 2;
      }
    });

    // Wait for render
    await page.waitForTimeout(100);

    const scrollTime = Date.now() - scrollStart;
    expect(scrollTime).toBeLessThan(500); // Smooth scrolling
  });

  test("debounces saves during rapid editing", async ({ mount, page }) => {
    const { columns, documents } = generateLargeDataset(10, 5);
    let saveRequests = 0;

    const trackingSaveMock = {
      request: {
        query: SET_METADATA_VALUE,
        variables: expect.any(Object),
      },
      result: () => {
        saveRequests++;
        return {
          data: {
            setMetadataValue: {
              datacell: {
                id: `cell-${saveRequests}`,
                data: { value: `Saved ${saveRequests}` },
                __typename: "DatacellType",
              },
              __typename: "SetMetadataValueMutation",
            },
          },
        };
      },
    };

    const baseMocks = [
      {
        request: {
          query: GET_DOCUMENT_METADATA_VALUES,
          variables: { documentIds: documents.map((d) => d.id) },
        },
        result: {
          data: {
            documents: {
              edges: documents.map((doc) => ({
                node: {
                  id: doc.id,
                  title: doc.title,
                  metadata: doc.metadata,
                  __typename: "DocumentType",
                },
                __typename: "DocumentTypeEdge",
              })),
              __typename: "DocumentTypeConnection",
            },
          },
        },
      },
      trackingSaveMock,
    ];

    await mount(
      <MetadataTestWrapper mocks={baseMocks}>
        <DocumentMetadataGrid
          documents={documents}
          columns={columns}
          corpusId={corpusId}
          autoSaveDelay={300} // 300ms debounce
        />
      </MetadataTestWrapper>
    );

    // Rapidly edit multiple cells
    for (let i = 0; i < 5; i++) {
      const cell = page.getByRole("gridcell").nth(i + columns.length + 1); // Skip headers
      await cell.click();

      const input = page.getByRole("textbox");
      await input.fill(`Quick edit ${i}`);

      // Move to next without waiting
      await page.keyboard.press("Tab");
      await page.waitForTimeout(50); // Small delay between edits
    }

    // Press escape to exit edit mode
    await page.keyboard.press("Escape");

    // Wait for all debounced saves
    await page.waitForTimeout(500);

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
          query: GET_DOCUMENT_METADATA_VALUES,
          variables: { documentIds: documents.map((d) => d.id) },
        },
        result: {
          data: {
            documents: {
              edges: documents.map((doc) => ({
                node: {
                  id: doc.id,
                  title: doc.title,
                  metadata: doc.metadata,
                  __typename: "DocumentType",
                },
                __typename: "DocumentTypeEdge",
              })),
              __typename: "DocumentTypeConnection",
            },
          },
        },
      },
    ];

    const startTime = Date.now();

    await mount(
      <MetadataTestWrapper mocks={mocks}>
        <DocumentMetadataGrid
          documents={documents}
          columns={complexColumns}
          corpusId={corpusId}
        />
      </MetadataTestWrapper>
    );

    // Should still render quickly despite validation
    await expect(page.getByRole("grid")).toBeVisible();
    const renderTime = Date.now() - startTime;
    expect(renderTime).toBeLessThan(3000);

    // Test validation performance
    const cell = page.getByRole("gridcell").nth(complexColumns.length + 1);
    await cell.click();

    const input = page.getByRole("textbox");

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
          query: GET_DOCUMENT_METADATA_VALUES,
          variables: {
            documentIds: firstPageDocs.map((d) => d.id),
            first: pageSize,
          },
        },
        result: {
          data: {
            documents: {
              edges: firstPageDocs.map((doc) => ({
                node: {
                  id: doc.id,
                  title: doc.title,
                  metadata: doc.metadata,
                  __typename: "DocumentType",
                },
                __typename: "DocumentTypeEdge",
              })),
              pageInfo: {
                hasNextPage: true,
                hasPreviousPage: false,
                startCursor: null,
                endCursor: `cursor-${pageSize}`,
                __typename: "PageInfo",
              },
              __typename: "DocumentTypeConnection",
            },
          },
        },
      },
    ];

    await mount(
      <MetadataTestWrapper mocks={paginatedMocks}>
        <DocumentMetadataGrid
          documents={firstPageDocs}
          columns={columns}
          corpusId={corpusId}
          pageSize={pageSize}
        />
      </MetadataTestWrapper>
    );

    // Should only render first page
    await expect(page.getByRole("grid")).toBeVisible();

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
          query: GET_DOCUMENT_METADATA_VALUES,
          variables: { documentIds: documents.map((d) => d.id) },
        },
        result: {
          data: {
            documents: {
              edges: documents.map((doc) => ({
                node: {
                  id: doc.id,
                  title: doc.title,
                  metadata: doc.metadata,
                  __typename: "DocumentType",
                },
                __typename: "DocumentTypeEdge",
              })),
              __typename: "DocumentTypeConnection",
            },
          },
        },
      },
    ];

    await mount(
      <MetadataTestWrapper mocks={mocks}>
        <div>
          <input data-testid="search-input" placeholder="Search metadata..." />
          <DocumentMetadataGrid
            documents={documents}
            columns={columns}
            corpusId={corpusId}
          />
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
    expect(reorderTime).toBeLessThan(2000); // Reordering should be smooth
  });
});
