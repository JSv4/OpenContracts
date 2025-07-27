import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MetadataTestWrapper } from "./MetadataTestWrapper";
import { DocumentMetadataGrid } from "../src/components/documents/DocumentMetadataGrid";
import {
  GET_DOCUMENT_METADATA_VALUES,
  SET_METADATA_VALUE,
} from "../src/graphql/metadataOperations";
import {
  createMockColumn,
  createMockDatacell,
  createMetadataTestScenario,
} from "./factories/metadataFactories";
import { MetadataDataType } from "../src/types/metadata";

test.describe("DocumentMetadataGrid", () => {
  const corpusId = "test-corpus";
  const { columns, documents } = createMetadataTestScenario();

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
  ];

  test("renders grid with metadata values", async ({ mount, page }) => {
    await mount(
      <MetadataTestWrapper mocks={baseMocks}>
        <DocumentMetadataGrid
          documents={documents}
          columns={columns}
          corpusId={corpusId}
        />
      </MetadataTestWrapper>
    );

    // Check headers
    await expect(
      page.getByRole("columnheader", { name: "Document" })
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Contract Date" })
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Contract Value" })
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Status" })
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Is Confidential" })
    ).toBeVisible();

    // Check document titles
    await expect(page.getByRole("cell", { name: "Contract A" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Contract B" })).toBeVisible();

    // Check values
    await expect(page.getByRole("cell", { name: "2024-01-01" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "50,000" })).toBeVisible(); // Formatted number
    await expect(page.getByRole("cell", { name: "Active" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "No" })).toBeVisible(); // Boolean as Yes/No
  });

  test("inline editing with click", async ({ mount, page }) => {
    const saveMock = {
      request: {
        query: SET_METADATA_VALUE,
        variables: {
          datacellId: "cell1",
          value: "2024-06-15",
        },
      },
      result: {
        data: {
          setMetadataValue: {
            datacell: {
              id: "cell1",
              data: { value: "2024-06-15" },
              __typename: "DatacellType",
            },
            __typename: "SetMetadataValueMutation",
          },
        },
      },
    };

    await mount(
      <MetadataTestWrapper mocks={[...baseMocks, saveMock]}>
        <DocumentMetadataGrid
          documents={documents}
          columns={columns}
          corpusId={corpusId}
        />
      </MetadataTestWrapper>
    );

    // Click to edit date cell
    const dateCell = page.getByRole("cell", { name: "2024-01-01" });
    await dateCell.click();

    // Should show date input
    const input = page.getByRole("textbox");
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute("type", "date");

    // Change value
    await input.fill("2024-06-15");
    await page.keyboard.press("Enter");

    // Should save and show new value
    await expect(page.getByRole("cell", { name: "2024-06-15" })).toBeVisible();
  });

  test("keyboard navigation", async ({ mount, page }) => {
    await mount(
      <MetadataTestWrapper mocks={baseMocks}>
        <DocumentMetadataGrid
          documents={documents}
          columns={columns}
          corpusId={corpusId}
        />
      </MetadataTestWrapper>
    );

    // Click first editable cell
    const firstCell = page
      .getByRole("gridcell")
      .filter({ hasText: "2024-01-01" })
      .first();
    await firstCell.click();

    // Should be in edit mode
    let input = page.getByRole("textbox");
    await expect(input).toBeFocused();

    // Tab to next cell
    await page.keyboard.press("Tab");

    // Should move to next cell (Contract Value)
    input = page.getByRole("textbox");
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute("type", "number");

    // Tab again to Status cell
    await page.keyboard.press("Tab");

    // Should show dropdown for choices
    const dropdown = page.getByRole("combobox");
    await expect(dropdown).toBeFocused();

    // Escape to cancel
    await page.keyboard.press("Escape");

    // Should exit edit mode
    await expect(page.getByRole("textbox")).not.toBeVisible();
    await expect(page.getByRole("combobox")).not.toBeVisible();
  });

  test("validates input before saving", async ({ mount, page }) => {
    await mount(
      <MetadataTestWrapper mocks={baseMocks}>
        <DocumentMetadataGrid
          documents={documents}
          columns={columns}
          corpusId={corpusId}
        />
      </MetadataTestWrapper>
    );

    // Edit number field with constraints
    const numberCell = page.getByRole("cell", { name: "50,000" }).first();
    await numberCell.click();

    const input = page.getByRole("textbox");
    await input.fill("invalid");
    await page.keyboard.press("Enter");

    // Should show error
    await expect(page.getByText("Must be a valid number")).toBeVisible();

    // Input should still be focused
    await expect(input).toBeFocused();

    // Fix value
    await input.fill("75000");
    await page.keyboard.press("Enter");

    // Error should be gone
    await expect(page.getByText("Must be a valid number")).not.toBeVisible();
  });

  test("boolean editor with checkbox", async ({ mount, page }) => {
    const saveMock = {
      request: {
        query: SET_METADATA_VALUE,
        variables: {
          datacellId: expect.stringMatching(/cell/),
          value: true,
        },
      },
      result: {
        data: {
          setMetadataValue: {
            datacell: {
              id: "cell4",
              data: { value: true },
              __typename: "DatacellType",
            },
            __typename: "SetMetadataValueMutation",
          },
        },
      },
    };

    await mount(
      <MetadataTestWrapper mocks={[...baseMocks, saveMock]}>
        <DocumentMetadataGrid
          documents={documents}
          columns={columns}
          corpusId={corpusId}
        />
      </MetadataTestWrapper>
    );

    // Click boolean cell (showing "No")
    const boolCell = page.getByRole("cell", { name: "No" }).first();
    await boolCell.click();

    // Should show checkbox
    const checkbox = page.getByRole("checkbox");
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();

    // Toggle
    await checkbox.check();
    await page.keyboard.press("Enter");

    // Should save and show "Yes"
    await expect(page.getByRole("cell", { name: "Yes" })).toBeVisible();
  });

  test("dropdown editor for choices", async ({ mount, page }) => {
    const saveMock = {
      request: {
        query: SET_METADATA_VALUE,
        variables: {
          datacellId: expect.stringMatching(/cell/),
          value: "Completed",
        },
      },
      result: {
        data: {
          setMetadataValue: {
            datacell: {
              id: "cell3",
              data: { value: "Completed" },
              __typename: "DatacellType",
            },
            __typename: "SetMetadataValueMutation",
          },
        },
      },
    };

    await mount(
      <MetadataTestWrapper mocks={[...baseMocks, saveMock]}>
        <DocumentMetadataGrid
          documents={documents}
          columns={columns}
          corpusId={corpusId}
        />
      </MetadataTestWrapper>
    );

    // Click status cell
    const statusCell = page.getByRole("cell", { name: "Active" }).first();
    await statusCell.click();

    // Should show dropdown
    const dropdown = page.getByRole("combobox");
    await expect(dropdown).toBeVisible();

    // Select new value
    await dropdown.selectOption("Completed");
    await page.keyboard.press("Enter");

    // Should save and show new value
    await expect(page.getByRole("cell", { name: "Completed" })).toBeVisible();
  });

  test("auto-saves with debouncing", async ({ mount, page }) => {
    let saveCount = 0;
    const trackingSaveMock = {
      request: {
        query: SET_METADATA_VALUE,
        variables: expect.any(Object),
      },
      result: () => {
        saveCount++;
        return {
          data: {
            setMetadataValue: {
              datacell: {
                id: "cell1",
                data: { value: `Save ${saveCount}` },
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
      <MetadataTestWrapper mocks={[...baseMocks, trackingSaveMock]}>
        <DocumentMetadataGrid
          documents={documents}
          columns={columns}
          corpusId={corpusId}
          autoSaveDelay={500} // 500ms debounce
        />
      </MetadataTestWrapper>
    );

    // Edit cell
    const cell = page.getByRole("cell", { name: "2024-01-01" }).first();
    await cell.click();

    const input = page.getByRole("textbox");

    // Type multiple times quickly
    await input.fill("2024-02-01");
    await page.waitForTimeout(100);
    await input.fill("2024-03-01");
    await page.waitForTimeout(100);
    await input.fill("2024-04-01");

    // Move to next cell to trigger save
    await page.keyboard.press("Tab");

    // Wait for debounce
    await page.waitForTimeout(700);

    // Should only save once
    expect(saveCount).toBe(1);
  });

  test("shows loading state during save", async ({ mount, page }) => {
    const slowSaveMock = {
      request: {
        query: SET_METADATA_VALUE,
        variables: expect.any(Object),
      },
      result: {
        data: {
          setMetadataValue: {
            datacell: {
              id: "cell1",
              data: { value: "2024-12-31" },
              __typename: "DatacellType",
            },
            __typename: "SetMetadataValueMutation",
          },
        },
      },
      delay: 1000, // Slow save
    };

    await mount(
      <MetadataTestWrapper mocks={[...baseMocks, slowSaveMock]}>
        <DocumentMetadataGrid
          documents={documents}
          columns={columns}
          corpusId={corpusId}
        />
      </MetadataTestWrapper>
    );

    const cell = page.getByRole("cell", { name: "2024-01-01" }).first();
    await cell.click();

    const input = page.getByRole("textbox");
    await input.fill("2024-12-31");
    await page.keyboard.press("Enter");

    // Should show saving indicator
    await expect(page.getByTestId("saving-indicator")).toBeVisible();

    // Should hide after save completes
    await expect(page.getByTestId("saving-indicator")).not.toBeVisible({
      timeout: 2000,
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
          ],
        },
      },
    ];

    const emptyMocks = [
      {
        request: {
          query: GET_DOCUMENT_METADATA_VALUES,
          variables: { documentIds: ["doc3"] },
        },
        result: {
          data: {
            documents: {
              edges: documentsWithEmpty.map((doc) => ({
                node: {
                  ...doc,
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
      <MetadataTestWrapper mocks={emptyMocks}>
        <DocumentMetadataGrid
          documents={documentsWithEmpty}
          columns={columns.slice(0, 2)} // Just date and number columns
          corpusId={corpusId}
        />
      </MetadataTestWrapper>
    );

    // Empty cells should show placeholder
    const emptyCells = page.getByRole("cell", { name: "—" });
    await expect(emptyCells).toHaveCount(2);

    // Click to add value
    await emptyCells.first().click();
    const input = page.getByRole("textbox");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("");
  });

  test("handles network errors gracefully", async ({ mount, page }) => {
    const errorMocks = [
      ...baseMocks,
      {
        request: {
          query: SET_METADATA_VALUE,
          variables: expect.any(Object),
        },
        error: new Error("Network error"),
      },
    ];

    await mount(
      <MetadataTestWrapper mocks={errorMocks}>
        <DocumentMetadataGrid
          documents={documents}
          columns={columns}
          corpusId={corpusId}
        />
      </MetadataTestWrapper>
    );

    // Edit a cell
    const cell = page.getByRole("cell", { name: "2024-01-01" }).first();
    await cell.click();

    const input = page.getByRole("textbox");
    await input.fill("2024-12-31");
    await page.keyboard.press("Enter");

    // Should show error message
    await expect(page.getByText(/failed to save/i)).toBeVisible();

    // Value should revert
    await expect(page.getByRole("cell", { name: "2024-01-01" })).toBeVisible();
  });
});
