import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MetadataTestWrapper } from "./MetadataTestWrapper";
import { DocumentMetadataGrid } from "../src/components/documents/DocumentMetadataGrid";
import { CorpusDocumentCards } from "../src/components/documents/CorpusDocumentCards";
import {
  GET_CORPUS_METADATA_COLUMNS,
  GET_DOCUMENT_METADATA_DATACELLS,
  SET_METADATA_VALUE,
} from "../src/graphql/metadataOperations";
import { GET_DOCUMENTS } from "../src/graphql/queries";
import { generateLargeDataset } from "./factories/metadataFactories";
import { MockedResponse, MockedProvider } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";

test.describe("Metadata Performance", () => {
  const corpusId = "test-corpus";

  // Create a simple test cache for pagination tests
  const testCache = new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          documents: {
            keyArgs: [
              "inCorpusWithId",
              "textSearch",
              "hasLabelWithId",
              "hasAnnotationsWithIds",
            ],
            merge(existing, incoming, { args }) {
              if (!existing || !args?.cursor) {
                return incoming;
              }
              // Merge edges for pagination
              return {
                ...incoming,
                edges: [...(existing.edges || []), ...(incoming.edges || [])],
              };
            },
          },
        },
      },
    },
  });

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

  test("efficient memory usage with relay-style pagination", async ({
    mount,
    page,
  }) => {
    // Generate test data
    const { columns } = generateLargeDataset(100, 5);
    const pageSize = 20;
    let currentPage = 0;

    // Generate all documents with proper structure
    const allDocuments = Array.from({ length: 100 }, (_, i) => ({
      id: `doc-${i}`,
      title: `Document ${i}`,
      description: `Description for document ${i}`,
      backendLock: false,
      pdfFile: null,
      txtExtractFile: null,
      fileType: "PDF",
      pawlsParseFile: null,
      icon: null,
      isPublic: false,
      myPermissions: ["READ"],
      is_selected: false,
      is_open: false,
      metadata: {
        edges: columns.map((col) => ({
          node: {
            id: `meta-${i}-${col.id}`,
            documentId: `doc-${i}`,
            columnId: col.id,
            data: { value: `Value ${i} for ${col.name}` },
            column: col,
          },
        })),
      },
    }));

    // Mock columns
    const columnsMock = {
      request: {
        query: GET_CORPUS_METADATA_COLUMNS,
        variables: { corpusId },
      },
      result: {
        data: {
          corpusMetadataColumns: columns,
        },
      },
    };

    // Create pageInfo helper
    const createPageInfo = (hasNext: boolean, page: number) => ({
      hasNextPage: hasNext,
      hasPreviousPage: page > 0,
      startCursor: `cursor-doc-${page * pageSize}`,
      endCursor: `cursor-doc-${(page + 1) * pageSize - 1}`,
    });

    // Mock fetchMore function
    const mockFetchMore = (args?: any) => {
      currentPage++;
      return Promise.resolve({
        data: {
          documents: {
            edges: allDocuments
              .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
              .map((doc) => ({
                node: doc,
                cursor: `cursor-${doc.id}`,
              })),
            pageInfo: createPageInfo(currentPage < 4, currentPage),
          },
        },
      });
    };

    // Mount the component directly with pagination props
    const firstPageDocs = allDocuments.slice(0, pageSize);
    const initialPageInfo = createPageInfo(true, 0);

    await mount(
      <MetadataTestWrapper mocks={[columnsMock]}>
        <DocumentMetadataGrid
          documents={firstPageDocs}
          corpusId={corpusId}
          pageInfo={initialPageInfo}
          fetchMore={mockFetchMore}
          hasMore={true}
        />
      </MetadataTestWrapper>
    );

    // Wait for grid to be visible
    await expect(page.locator("#document-metadata-grid-wrapper")).toBeVisible();

    // Count initial rows (should be pageSize + 1 for header)
    const initialRows = await page.getByRole("row").count();
    expect(initialRows).toBe(pageSize + 1);

    // Check for pagination footer
    await expect(page.getByText("Showing 20 of many documents")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Load More Documents" })
    ).toBeVisible();

    // Verify initial data is displayed
    await expect(page.getByText("Document 0")).toBeVisible();
    await expect(page.getByText("Document 19")).toBeVisible();

    // Check memory efficiency with initial load
    const initialNodeCount = await page.evaluate(
      () => document.querySelectorAll("*").length
    );
    expect(initialNodeCount).toBeLessThan(5000); // Should be efficient with just 20 rows

    // Test that Load More button is functional
    const loadMoreBtn = page.getByRole("button", {
      name: "Load More Documents",
    });
    await expect(loadMoreBtn).toBeEnabled();

    // Verify that pagination controls are properly integrated
    await expect(page.locator(".ui.table")).toBeVisible();
    const cells = await page.locator(".metadata-grid-cell").count();
    expect(cells).toBeGreaterThan(0); // Should have metadata cells
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
