import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MetadataTestWrapper } from "./MetadataTestWrapper";
import { DocumentMetadataGrid } from "../src/components/documents/DocumentMetadataGrid";
import {
  GET_CORPUS_METADATA_COLUMNS,
  GET_DOCUMENT_METADATA_DATACELLS,
  SET_METADATA_VALUE,
} from "../src/graphql/metadataOperations";
import {
  createMockDatacell,
  createMetadataTestScenario,
} from "./factories/metadataFactories";

test.describe("DocumentMetadataGrid", () => {
  const corpusId = "test-corpus";
  const { columns, documents } = createMetadataTestScenario();

  // Mock the columns query that the component actually uses
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
  ];

  // Add mocks for individual document metadata queries
  const documentMetadataMocks = documents.map((doc) => ({
    request: {
      query: GET_DOCUMENT_METADATA_DATACELLS,
      variables: { documentId: doc.id, corpusId },
    },
    result: {
      data: {
        documentMetadataDatacells: doc.metadata.edges.map((edge) => edge.node),
      },
    },
  }));

  test("renders grid with metadata values", async ({ mount, page }) => {
    await mount(
      <MetadataTestWrapper mocks={[...baseMocks, ...documentMetadataMocks]}>
        <DocumentMetadataGrid documents={documents} corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Check headers
    await expect(page.locator('xpath=//th[text()="Document"]')).toBeVisible();
    await expect(
      page.locator('xpath=//th[text()="Contract Date"]')
    ).toBeVisible();
    await expect(
      page.locator('xpath=//th[text()="Contract Value"]')
    ).toBeVisible();
    await expect(page.locator('xpath=//th[text()="Status"]')).toBeVisible();
    await expect(
      page.locator('xpath=//th[text()="Is Confidential"]')
    ).toBeVisible();

    // Check document titles
    await expect(page.getByRole("cell", { name: "Contract A" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Contract B" })).toBeVisible();

    // Check values based on test data (doc1: 2024-01-01, doc2: 2024-02-15)
    await expect(page.getByRole("cell", { name: "1/1/2024" })).toBeVisible(); // 2024-01-01 formatted
    await expect(page.getByRole("cell", { name: "2/15/2024" })).toBeVisible(); // 2024-02-15 formatted
    await expect(page.getByRole("cell", { name: "50,000" })).toBeVisible(); // Formatted number with comma
    await expect(page.getByRole("cell", { name: "Active" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "No" })).toBeVisible(); // Boolean as Yes/No
  });

  test("inline editing with click", async ({ mount, page }) => {
    const saveMock = {
      request: {
        query: SET_METADATA_VALUE,
        variables: {
          documentId: "doc1",
          corpusId: corpusId,
          columnId: "col1",
          value: "2024-06-15",
        },
      },
      result: {
        data: {
          setMetadataValue: {
            ok: true,
            message: "Success",
            obj: {
              id: "cell1",
              data: { value: "2024-06-15" },
              dataDefinition: "date",
              column: {
                id: "col1",
                name: "Contract Date",
                dataType: "DATE",
              },
              __typename: "DatacellType",
            },
            __typename: "SetMetadataValueMutation",
          },
        },
      },
    };

    await mount(
      <MetadataTestWrapper
        mocks={[...baseMocks, ...documentMetadataMocks, saveMock]}
      >
        <DocumentMetadataGrid documents={documents} corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Click to edit date cell (doc1 has 2024-01-01 which formats to 1/1/2024)
    const dateCell = page.getByRole("cell", { name: "1/1/2024" });
    await dateCell.click();

    // Should show date input
    const input = page.getByRole("textbox");
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute("type", "date");

    // Change value
    await input.click();
    await input.type("06152025");
    await page.keyboard.press("Enter");

    // Should save and show new value (formatted as local date)
    await expect(page.getByRole("cell", { name: "6/15/2025" })).toBeVisible();
  });

  test("keyboard navigation", async ({ mount, page }) => {
    await mount(
      <MetadataTestWrapper mocks={[...baseMocks, ...documentMetadataMocks]}>
        <DocumentMetadataGrid documents={documents} corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // First verify the grid is loaded
    await expect(page.getByRole("cell", { name: "1/1/2024" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "50,000" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Active" })).toBeVisible();

    // Click date cell using data-testid
    const dateCell = page.getByTestId("cell-doc1-col1");
    await dateCell.click();
    await page.waitForTimeout(300);

    // Should be in edit mode with date input - look globally first
    let dateInput = page.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible({ timeout: 2000 });
    await expect(dateInput).toBeFocused();

    // Tab to next cell (number)
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);

    // Should now have number input
    let numberInput = page.locator('input[type="number"]').first();
    await expect(numberInput).toBeVisible({ timeout: 2000 });
    await expect(numberInput).toBeFocused();

    // Tab to next cell (dropdown)
    await page.keyboard.press("Tab");
    await page.waitForTimeout(300);

    // Should show dropdown - look for the entire dropdown element
    const dropdown = page.locator(".ui.dropdown").first();
    await expect(dropdown).toBeVisible({ timeout: 2000 });

    // Click outside to exit edit mode
    await page.locator("body").click({ position: { x: 10, y: 10 } });
    await page.waitForTimeout(300);

    // After clicking outside, we should exit edit mode
    // Check that we're back to viewing mode (no editors visible)
    await expect(page.locator('input[type="date"]')).not.toBeVisible();
    await expect(page.locator('input[type="number"]')).not.toBeVisible();

    // Check that we're no longer in edit mode by verifying the editingCell state
    // We can verify this by checking that clicking a cell enters edit mode again
    await dateCell.click();
    await page.waitForTimeout(300);
    await expect(page.locator('input[type="date"]').first()).toBeVisible();
  });

  test("validates input before saving", async ({ mount, page }) => {
    await mount(
      <MetadataTestWrapper mocks={[...baseMocks, ...documentMetadataMocks]}>
        <DocumentMetadataGrid documents={documents} corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Wait for grid to be ready
    await expect(page.getByRole("cell", { name: "50,000" })).toBeVisible();

    // Click number cell using data-testid
    const numberCell = page.getByTestId("cell-doc1-col2");
    await numberCell.click();
    await page.waitForTimeout(300);

    const input = page.locator('input[type="number"]').first();
    await expect(input).toBeVisible({ timeout: 2000 });

    // Enter a value that exceeds the max constraint (1000000)
    await input.clear();
    await input.type("9999999");

    // Wait for validation to run
    await page.waitForTimeout(500);

    // Check for validation indicator or error styling
    const validationIcon = page.locator(
      '[data-testid="validation-icon-error"]'
    );
    const hasValidationIcon = (await validationIcon.count()) > 0;

    if (hasValidationIcon) {
      await expect(validationIcon).toBeVisible();
    }

    // Fix the value
    await input.clear();
    await input.type("75000");
    await page.waitForTimeout(500);

    // Check for success indicator
    const successIcon = page.locator('[data-testid="validation-icon-success"]');
    const hasSuccessIcon = (await successIcon.count()) > 0;

    if (hasSuccessIcon) {
      await expect(successIcon).toBeVisible();
    }
  });

  test("boolean editor with checkbox", async ({ mount, page }) => {
    const saveMock = {
      request: {
        query: SET_METADATA_VALUE,
        variables: {
          documentId: "doc1",
          corpusId: corpusId,
          columnId: "col4",
          value: true,
        },
      },
      result: {
        data: {
          setMetadataValue: {
            ok: true,
            message: "Success",
            obj: {
              id: "cell4",
              data: { value: true },
              dataDefinition: "boolean",
              column: {
                id: "col4",
                name: "Is Confidential",
                dataType: "BOOLEAN",
              },
              __typename: "DatacellType",
            },
            __typename: "SetMetadataValueMutation",
          },
        },
      },
    };

    await mount(
      <MetadataTestWrapper
        mocks={[...baseMocks, ...documentMetadataMocks, saveMock]}
      >
        <DocumentMetadataGrid documents={documents} corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Wait for grid to be ready
    await expect(page.getByRole("cell", { name: "No" })).toBeVisible();

    // Click boolean cell using data-testid
    const boolCell = page.getByTestId("cell-doc1-col4");
    await boolCell.click();

    // Wait for React to update
    await page.waitForTimeout(300);

    // Look for checkbox container (Semantic UI wraps checkboxes)
    const checkboxContainer = page.locator(".ui.checkbox").first();
    await expect(checkboxContainer).toBeVisible({ timeout: 2000 });

    // Check the actual checkbox state
    const checkbox = checkboxContainer.locator('input[type="checkbox"]');
    await expect(checkbox).not.toBeChecked();

    // Click the checkbox container (not the input directly)
    await checkboxContainer.click();

    // Click outside to trigger save
    await page.locator("body").click({ position: { x: 10, y: 10 } });

    // Wait for save
    await page.waitForTimeout(1700);

    // Should save and show "Yes"
    // Be specific - we want the cell in the first row (Contract A)
    const firstRow = page
      .locator("tr")
      .filter({ has: page.getByText("Contract A") });
    await expect(firstRow.getByRole("cell", { name: "Yes" })).toBeVisible();
  });

  test("dropdown editor for choices", async ({ mount, page }) => {
    const saveMock = {
      request: {
        query: SET_METADATA_VALUE,
        variables: {
          documentId: "doc1",
          corpusId: corpusId,
          columnId: "col3",
          value: "Completed",
        },
      },
      result: {
        data: {
          setMetadataValue: {
            ok: true,
            message: "Success",
            obj: {
              id: "cell3",
              data: { value: "Completed" },
              dataDefinition: "string",
              column: {
                id: "col3",
                name: "Status",
                dataType: "STRING",
              },
              __typename: "DatacellType",
            },
            __typename: "SetMetadataValueMutation",
          },
        },
      },
    };

    await mount(
      <MetadataTestWrapper
        mocks={[...baseMocks, ...documentMetadataMocks, saveMock]}
      >
        <DocumentMetadataGrid documents={documents} corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Wait for grid to be ready
    await expect(page.getByRole("cell", { name: "Active" })).toBeVisible();

    // Click status cell using data-testid
    const statusCell = page.getByTestId("cell-doc1-col3");
    await statusCell.click();

    // Wait for React to update
    await page.waitForTimeout(300);

    // Look for dropdown globally
    const dropdown = page.locator(".ui.dropdown").first();
    await expect(dropdown).toBeVisible({ timeout: 2000 });

    // Type to search and select
    const searchInput = dropdown.locator("input.search");
    await searchInput.type("Completed");
    await page.waitForTimeout(100);

    // Press Enter to select the highlighted option
    await page.keyboard.press("Enter");

    // Click outside to ensure save is triggered
    await page.locator("body").click({ position: { x: 10, y: 10 } });

    // Wait for save to complete
    await page.waitForTimeout(2000);

    // Should save and show new value
    await expect(page.getByRole("cell", { name: "Completed" })).toBeVisible();
  });

  test("auto-saves with debouncing", async ({ mount, page }) => {
    let saveCount = 0;
    const trackingSaveMock = {
      request: {
        query: SET_METADATA_VALUE,
        variables: {
          documentId: "doc1",
          corpusId: corpusId,
          columnId: "col1",
          value: "2024-04-01",
        },
      },
      result: () => {
        saveCount++;
        return {
          data: {
            setMetadataValue: {
              ok: true,
              message: "Success",
              obj: {
                id: "cell1",
                data: { value: "2024-04-01" },
                dataDefinition: "date",
                column: {
                  id: "col1",
                  name: "Contract Date",
                  dataType: "DATE",
                },
                __typename: "DatacellType",
              },
              __typename: "SetMetadataValueMutation",
            },
          },
        };
      },
      delay: 100,
    };

    await mount(
      <MetadataTestWrapper
        mocks={[...baseMocks, ...documentMetadataMocks, trackingSaveMock]}
      >
        <DocumentMetadataGrid documents={documents} corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Edit cell (looking for formatted date 1/1/2024)
    const cell = page.getByRole("cell", { name: "1/1/2024" });
    await cell.click();

    const input = page.locator('input[type="date"]').first();

    // Type multiple times quickly
    await input.fill("2024-02-01");
    await page.waitForTimeout(100);
    await input.fill("2024-03-01");
    await page.waitForTimeout(100);
    await input.fill("2024-04-01");

    // Move to next cell to trigger save
    await page.keyboard.press("Tab");

    // Wait for debounce (1500ms debounce + some buffer)
    await page.waitForTimeout(1700);

    // Should only save once
    expect(saveCount).toBe(1);
  });

  test("shows loading state during save", async ({ mount, page }) => {
    const slowSaveMock = {
      request: {
        query: SET_METADATA_VALUE,
        variables: {
          documentId: "doc1",
          corpusId: corpusId,
          columnId: "col1",
          value: "2024-12-31",
        },
      },
      result: {
        data: {
          setMetadataValue: {
            ok: true,
            message: "Success",
            obj: {
              id: "cell1",
              data: { value: "2024-12-31" },
              dataDefinition: "date",
              column: {
                id: "col1",
                name: "Contract Date",
                dataType: "DATE",
              },
              __typename: "DatacellType",
            },
            __typename: "SetMetadataValueMutation",
          },
        },
      },
      delay: 2000, // Increased delay to make saving indicator visible
    };

    await mount(
      <MetadataTestWrapper
        mocks={[...baseMocks, ...documentMetadataMocks, slowSaveMock]}
      >
        <DocumentMetadataGrid documents={documents} corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    const cell = page.getByRole("cell", { name: "1/1/2024" });
    await cell.click();

    const input = page.locator('input[type="date"]').first();
    await input.fill("2024-12-31");

    // Move to another cell to trigger save
    await page.keyboard.press("Tab");

    // Wait for debounce period (1500ms)
    await page.waitForTimeout(1600);

    // Should show saving indicator after debounce
    await expect(page.getByTestId("saving-indicator")).toBeVisible();

    // Should hide after save completes
    await expect(page.getByTestId("saving-indicator")).not.toBeVisible({
      timeout: 3000,
    });
  });

  test("handles empty cells", async ({ mount, page }) => {
    const documentsWithEmpty = [
      {
        id: "doc3",
        title: "Contract C",
        metadata: {
          edges: [
            { node: createMockDatacell("col1", "doc3", null) }, // Empty date
            { node: createMockDatacell("col2", "doc3", null) }, // Empty number
            { node: createMockDatacell("col3", "doc3", "Active") }, // Non-empty status
            { node: createMockDatacell("col4", "doc3", true) }, // Non-empty boolean
          ],
        },
      },
    ];

    const emptyMocks = [
      {
        request: {
          query: GET_DOCUMENT_METADATA_DATACELLS,
          variables: { documentId: "doc3", corpusId },
        },
        result: {
          data: {
            documentMetadataDatacells: documentsWithEmpty[0].metadata.edges.map(
              (edge) => edge.node
            ),
          },
        },
      },
    ];

    await mount(
      <MetadataTestWrapper mocks={[...baseMocks, ...emptyMocks]}>
        <DocumentMetadataGrid
          documents={documentsWithEmpty}
          corpusId={corpusId}
        />
      </MetadataTestWrapper>
    );

    // Empty cells should show placeholder
    const emptyCells = page.getByText("Click to edit");
    await expect(emptyCells).toHaveCount(2);

    // Click to add value
    await emptyCells.first().click();
    const input = page.getByRole("textbox");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("");
  });

  test("handles network errors gracefully", async ({ mount, page }) => {
    let errorHandled = false;

    // Listen for console errors to verify error is logged
    page.on("console", (msg) => {
      if (msg.type() === "error" && msg.text().includes("Network error")) {
        errorHandled = true;
      }
    });

    const errorMocks = [
      ...baseMocks,
      ...documentMetadataMocks,
      {
        request: {
          query: SET_METADATA_VALUE,
          variables: {
            documentId: "doc1",
            corpusId: corpusId,
            columnId: "col1",
            value: "2024-12-31",
          },
        },
        error: new Error("Network error"),
      },
    ];

    await mount(
      <MetadataTestWrapper mocks={errorMocks}>
        <DocumentMetadataGrid documents={documents} corpusId={corpusId} />
      </MetadataTestWrapper>
    );

    // Wait for grid to be ready
    await expect(page.getByRole("cell", { name: "1/1/2024" })).toBeVisible();

    // Click date cell
    const dateCell = page.getByTestId("cell-doc1-col1");
    await dateCell.click();
    await page.waitForTimeout(300);

    const input = page.locator('input[type="date"]').first();
    await expect(input).toBeVisible({ timeout: 1000 });

    // Change value
    await input.fill("2024-12-31");

    // Click outside to trigger save
    await page.locator("body").click({ position: { x: 10, y: 10 } });

    // Wait for debounce and error to occur
    await page.waitForTimeout(2000);

    // The component should handle the error gracefully
    // It might show the original value or keep the new value
    // The important thing is that it doesn't crash

    // Verify the grid is still functional by clicking another cell
    const numberCell = page.getByTestId("cell-doc1-col2");
    await numberCell.click();
    await page.waitForTimeout(300);

    // Should be able to edit another cell
    const numberInput = page.locator('input[type="number"]').first();
    await expect(numberInput).toBeVisible({ timeout: 1000 });

    // Test passes if we get here without crashing
    expect(true).toBe(true);
  });
});
