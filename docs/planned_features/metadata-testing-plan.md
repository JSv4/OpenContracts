# Metadata Frontend Testing Plan

## Overview

This document outlines a comprehensive testing strategy for the new metadata functionality in OpenContracts, following established patterns from the codebase.

## Testing Architecture

### 1. Test Wrappers

Following the pattern established in `CorpusesTestWrapper.tsx` and `UnifiedContentFeedTestWrapper.tsx`, we'll create dedicated test wrappers for metadata components:

#### MetadataTestWrapper
```typescript
// frontend/tests/MetadataTestWrapper.tsx
import React from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { Provider as JotaiProvider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { relayStylePagination } from "@apollo/client/utilities";

interface MetadataTestWrapperProps {
  children: React.ReactNode;
  mocks: ReadonlyArray<MockedResponse>;
  initialEntries?: string[];
  corpusId?: string;
}

export const MetadataTestWrapper: React.FC<MetadataTestWrapperProps> = ({
  children,
  mocks,
  initialEntries = ["/"],
  corpusId,
}) => {
  const cache = new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          corpuses: relayStylePagination(),
          columns: relayStylePagination(),
        },
      },
      ColumnType: { keyFields: ["id"] },
      DatacellType: { keyFields: ["id"] },
      FieldsetType: { keyFields: ["id"] },
    },
  });

  return (
    <JotaiProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <MockedProvider mocks={mocks} cache={cache} addTypename>
          {children}
        </MockedProvider>
      </MemoryRouter>
    </JotaiProvider>
  );
};
```

### 2. Debug Components

Following the pattern from `UnifiedContentFeedDebug.story.tsx`, create debug components for troubleshooting:

```typescript
// frontend/tests/MetadataDebug.story.tsx
export const MetadataDebugComponent = ({ columns }: { columns: any[] }) => {
  React.useEffect(() => {
    console.log("DEBUG - Metadata columns:", columns);
    columns.forEach((col) => {
      console.log(`DEBUG - Column ${col.id}:`, {
        name: col.name,
        dataType: col.dataType,
        validationRules: col.extractIsList ? "LIST" : col.validationRules,
      });
    });
  }, [columns]);
  return null;
};
```

## Test Coverage Plan

### 1. Unit Tests

#### A. Validation Functions (`frontend/src/types/metadata.test.ts`)
```typescript
describe("validateMetadataValue", () => {
  test("validates string types correctly", () => {
    const column = { 
      dataType: MetadataDataType.STRING,
      validationRules: { max_length: 10 }
    };
    expect(validateMetadataValue("test", column)).toBe(true);
    expect(validateMetadataValue("very long string", column)).toBe(false);
  });

  test("validates number types with constraints", () => {
    const column = {
      dataType: MetadataDataType.NUMBER,
      validationRules: { min: 0, max: 100 }
    };
    expect(validateMetadataValue(50, column)).toBe(true);
    expect(validateMetadataValue(150, column)).toBe(false);
  });

  test("validates date formats", () => {
    const column = { dataType: MetadataDataType.DATE };
    expect(validateMetadataValue("2024-01-01", column)).toBe(true);
    expect(validateMetadataValue("invalid date", column)).toBe(false);
  });

  test("validates list constraints", () => {
    const column = {
      dataType: MetadataDataType.STRING,
      extractIsList: true,
      validationRules: { choices: ["A", "B", "C"] }
    };
    expect(validateMetadataValue(["A", "B"], column)).toBe(true);
    expect(validateMetadataValue(["D"], column)).toBe(false);
  });
});
```

#### B. Type Conversions (`frontend/src/utils/metadataUtils.test.ts`)
```typescript
describe("convertMetadataValue", () => {
  test("converts string to number", () => {
    expect(convertValue("123", MetadataDataType.NUMBER)).toBe(123);
    expect(convertValue("abc", MetadataDataType.NUMBER)).toBe(null);
  });

  test("converts boolean strings", () => {
    expect(convertValue("true", MetadataDataType.BOOLEAN)).toBe(true);
    expect(convertValue("yes", MetadataDataType.BOOLEAN)).toBe(true);
    expect(convertValue("no", MetadataDataType.BOOLEAN)).toBe(false);
  });
});
```

### 2. Component Tests

#### A. CorpusMetadataSettings (`frontend/tests/CorpusMetadataSettings.ct.tsx`)

```typescript
import { test, expect } from "@playwright/experimental-ct-react";
import { MetadataTestWrapper } from "./MetadataTestWrapper";
import { CorpusMetadataSettings } from "../src/components/corpuses/CorpusMetadataSettings";
import { 
  GET_CORPUS_METADATA_COLUMNS,
  CREATE_METADATA_COLUMN,
  UPDATE_METADATA_COLUMN,
  DELETE_METADATA_COLUMN
} from "../src/graphql/metadataOperations";

test.describe("CorpusMetadataSettings", () => {
  const mockColumns = [
    {
      id: "col1",
      name: "Contract Date",
      dataType: "DATE",
      extractIsList: false,
      validationRules: {},
      orderIndex: 0,
    },
    {
      id: "col2", 
      name: "Contract Value",
      dataType: "NUMBER",
      extractIsList: false,
      validationRules: { min: 0 },
      orderIndex: 1,
    },
  ];

  const mocks = [
    {
      request: {
        query: GET_CORPUS_METADATA_COLUMNS,
        variables: { corpusId: "test-corpus" },
      },
      result: {
        data: {
          corpus: {
            metadataSchema: {
              id: "fieldset1",
              columns: { edges: mockColumns.map(col => ({ node: col })) },
            },
          },
        },
      },
    },
  ];

  test("displays metadata columns", async ({ mount, page }) => {
    await mount(
      <MetadataTestWrapper mocks={mocks}>
        <CorpusMetadataSettings corpusId="test-corpus" />
      </MetadataTestWrapper>
    );

    await expect(page.getByText("Contract Date")).toBeVisible();
    await expect(page.getByText("Contract Value")).toBeVisible();
    await expect(page.getByText("DATE")).toBeVisible();
    await expect(page.getByText("NUMBER")).toBeVisible();
  });

  test("adds new metadata column", async ({ mount, page }) => {
    const createMock = {
      request: {
        query: CREATE_METADATA_COLUMN,
        variables: {
          corpusId: "test-corpus",
          name: "Status",
          dataType: "STRING",
          extractIsList: false,
          validationRules: {},
        },
      },
      result: {
        data: {
          createMetadataColumn: {
            column: {
              id: "col3",
              name: "Status",
              dataType: "STRING",
              extractIsList: false,
              validationRules: {},
              orderIndex: 2,
            },
          },
        },
      },
    };

    await mount(
      <MetadataTestWrapper mocks={[...mocks, createMock]}>
        <CorpusMetadataSettings corpusId="test-corpus" />
      </MetadataTestWrapper>
    );

    // Click add button
    await page.getByRole("button", { name: /add field/i }).click();
    
    // Fill form
    await page.getByLabel("Field Name").fill("Status");
    await page.getByLabel("Data Type").click();
    await page.getByText("Text (Single Line)").click();
    
    // Save
    await page.getByRole("button", { name: /save/i }).click();
    
    // Verify new column appears
    await expect(page.getByText("Status")).toBeVisible();
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
            },
          },
        },
      },
    };

    await mount(
      <MetadataTestWrapper mocks={[...mocks, updateMock]}>
        <CorpusMetadataSettings corpusId="test-corpus" />
      </MetadataTestWrapper>
    );

    // Click edit on Contract Value
    const valueRow = page.locator('[data-testid="metadata-column-row"]').filter({ hasText: "Contract Value" });
    await valueRow.getByRole("button", { name: /edit/i }).click();

    // Add max constraint
    await page.getByLabel("Maximum Value").fill("1000000");
    await page.getByRole("button", { name: /save/i }).click();

    // Verify updated
    await expect(page.getByText("Max: 1,000,000")).toBeVisible();
  });
});
```

#### B. DocumentMetadataGrid (`frontend/tests/DocumentMetadataGrid.ct.tsx`)

```typescript
test.describe("DocumentMetadataGrid", () => {
  const mockDocuments = [
    {
      id: "doc1",
      title: "Contract A",
      metadata: {
        edges: [
          {
            node: {
              id: "cell1",
              column: { id: "col1", name: "Date" },
              data: { value: "2024-01-01" },
            },
          },
        ],
      },
    },
  ];

  test("renders grid with metadata values", async ({ mount, page }) => {
    await mount(
      <MetadataTestWrapper mocks={[...]}>
        <DocumentMetadataGrid 
          documents={mockDocuments}
          columns={mockColumns}
          corpusId="test-corpus"
        />
      </MetadataTestWrapper>
    );

    await expect(page.getByRole("cell", { name: "Contract A" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "2024-01-01" })).toBeVisible();
  });

  test("inline editing with keyboard navigation", async ({ mount, page }) => {
    await mount(
      <MetadataTestWrapper mocks={[...]}>
        <DocumentMetadataGrid {...props} />
      </MetadataTestWrapper>
    );

    // Click to edit
    const cell = page.getByRole("cell", { name: "2024-01-01" });
    await cell.click();

    // Should show input
    const input = page.getByRole("textbox");
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();

    // Tab to next cell
    await page.keyboard.press("Tab");
    await expect(page.getByRole("textbox")).toBeFocused();

    // Escape to cancel
    await page.keyboard.press("Escape");
    await expect(page.getByRole("textbox")).not.toBeVisible();
  });

  test("validates input before saving", async ({ mount, page }) => {
    await mount(
      <MetadataTestWrapper mocks={[...]}>
        <DocumentMetadataGrid {...props} />
      </MetadataTestWrapper>
    );

    // Edit number field
    const numberCell = page.getByRole("cell", { name: "0" });
    await numberCell.click();
    
    const input = page.getByRole("textbox");
    await input.fill("invalid");
    await page.keyboard.press("Enter");

    // Should show error
    await expect(page.getByText("Must be a valid number")).toBeVisible();
    
    // Fix value
    await input.fill("100");
    await page.keyboard.press("Enter");
    
    // Error should be gone
    await expect(page.getByText("Must be a valid number")).not.toBeVisible();
  });

  test("auto-saves with debouncing", async ({ mount, page }) => {
    let saveCount = 0;
    const saveMock = {
      request: {
        query: SET_METADATA_VALUE,
        variables: { datacellId: "cell1", value: "2024-02-01" },
      },
      result: () => {
        saveCount++;
        return { data: { setMetadataValue: { success: true } } };
      },
    };

    await mount(
      <MetadataTestWrapper mocks={[...mocks, saveMock]}>
        <DocumentMetadataGrid {...props} />
      </MetadataTestWrapper>
    );

    // Edit cell
    const cell = page.getByRole("cell", { name: "2024-01-01" });
    await cell.click();
    
    const input = page.getByRole("textbox");
    
    // Type multiple characters quickly
    await input.fill("2024-02-01");
    
    // Wait for debounce
    await page.waitForTimeout(600);
    
    // Should only save once
    expect(saveCount).toBe(1);
  });
});
```

#### C. MetadataCellEditor (`frontend/tests/MetadataCellEditor.ct.tsx`)

```typescript
test.describe("MetadataCellEditor", () => {
  test("renders correct editor for each data type", async ({ mount, page }) => {
    // String editor
    await mount(
      <MetadataCellEditor
        column={{ dataType: MetadataDataType.STRING }}
        value=""
        onChange={() => {}}
      />
    );
    await expect(page.getByRole("textbox")).toBeVisible();

    // Boolean editor
    await mount(
      <MetadataCellEditor
        column={{ dataType: MetadataDataType.BOOLEAN }}
        value={false}
        onChange={() => {}}
      />
    );
    await expect(page.getByRole("checkbox")).toBeVisible();

    // Date editor
    await mount(
      <MetadataCellEditor
        column={{ dataType: MetadataDataType.DATE }}
        value=""
        onChange={() => {}}
      />
    );
    await expect(page.getByRole("textbox")).toHaveAttribute("type", "date");

    // Select editor for choices
    await mount(
      <MetadataCellEditor
        column={{
          dataType: MetadataDataType.STRING,
          validationRules: { choices: ["A", "B", "C"] },
        }}
        value=""
        onChange={() => {}}
      />
    );
    await expect(page.getByRole("combobox")).toBeVisible();
  });

  test("shows validation feedback in real-time", async ({ mount, page }) => {
    const column = {
      dataType: MetadataDataType.NUMBER,
      validationRules: { min: 0, max: 100 },
    };

    await mount(
      <MetadataCellEditor
        column={column}
        value={0}
        onChange={() => {}}
        onValidationChange={() => {}}
      />
    );

    const input = page.getByRole("textbox");
    
    // Valid value
    await input.fill("50");
    await expect(page.getByTestId("validation-icon-success")).toBeVisible();

    // Invalid value
    await input.fill("150");
    await expect(page.getByTestId("validation-icon-error")).toBeVisible();
    await expect(page.getByText("Must be ≤ 100")).toBeVisible();
  });
});
```

### 3. Integration Tests

#### A. Full Metadata Workflow (`frontend/tests/MetadataWorkflow.ct.tsx`)

```typescript
test.describe("Metadata Workflow Integration", () => {
  test("complete metadata setup and data entry flow", async ({ mount, page }) => {
    // Start at corpus settings
    await mount(<FullCorpusView corpusId="test-corpus" />);

    // Navigate to settings
    await page.getByRole("tab", { name: "Settings" }).click();
    
    // Add metadata field
    await page.getByRole("button", { name: /add field/i }).click();
    await page.getByLabel("Field Name").fill("Project Name");
    await page.getByRole("button", { name: /save/i }).click();

    // Navigate to documents
    await page.getByRole("tab", { name: "Documents" }).click();
    
    // Switch to grid view
    await page.getByRole("button", { name: /grid view/i }).click();
    
    // Enter metadata value
    const cell = page.getByRole("cell").filter({ hasText: "" }).first();
    await cell.click();
    await page.getByRole("textbox").fill("Alpha Project");
    await page.keyboard.press("Enter");

    // Verify saved
    await expect(cell).toContainText("Alpha Project");
  });

  test("metadata filters affect document list", async ({ mount, page }) => {
    // Setup with documents having metadata
    await mount(<CorpusDocumentsWithMetadata />);

    // Apply metadata filter
    await page.getByRole("button", { name: /filter/i }).click();
    await page.getByLabel("Status").selectOption("Active");
    
    // Verify filtered results
    const documentCards = page.locator('[data-testid="document-card"]');
    await expect(documentCards).toHaveCount(3); // Only active documents
    
    // Clear filter
    await page.getByRole("button", { name: /clear filters/i }).click();
    await expect(documentCards).toHaveCount(5); // All documents
  });
});
```

### 4. Error Handling Tests

```typescript
test.describe("Metadata Error Handling", () => {
  test("handles GraphQL errors gracefully", async ({ mount, page }) => {
    const errorMocks = [
      {
        request: {
          query: CREATE_METADATA_COLUMN,
          variables: expect.any(Object),
        },
        error: new Error("Network error"),
      },
    ];

    await mount(
      <MetadataTestWrapper mocks={errorMocks}>
        <CorpusMetadataSettings corpusId="test-corpus" />
      </MetadataTestWrapper>
    );

    await page.getByRole("button", { name: /add field/i }).click();
    await page.getByLabel("Field Name").fill("Test");
    await page.getByRole("button", { name: /save/i }).click();

    await expect(page.getByText("Failed to create field")).toBeVisible();
  });

  test("handles concurrent edits", async ({ mount, page }) => {
    // Test optimistic updates and rollback
    const optimisticMock = {
      request: {
        query: SET_METADATA_VALUE,
        variables: { datacellId: "cell1", value: "New Value" },
      },
      result: {
        data: {
          setMetadataValue: {
            datacell: {
              id: "cell1",
              data: { value: "Server Value" }, // Different from optimistic
            },
          },
        },
      },
      delay: 1000,
    };

    await mount(
      <MetadataTestWrapper mocks={[optimisticMock]}>
        <DocumentMetadataGrid {...props} />
      </MetadataTestWrapper>
    );

    const cell = page.getByRole("cell", { name: "Old Value" });
    await cell.click();
    await page.getByRole("textbox").fill("New Value");
    await page.keyboard.press("Enter");

    // Should show optimistic update immediately
    await expect(cell).toContainText("New Value");

    // After server response, should show server value
    await expect(cell).toContainText("Server Value", { timeout: 2000 });
  });
});
```

### 5. Performance Tests

```typescript
test.describe("Metadata Performance", () => {
  test("handles large datasets efficiently", async ({ mount, page }) => {
    // Generate 100 documents with 10 metadata columns each
    const largeMockData = generateLargeDataset(100, 10);

    await mount(
      <MetadataTestWrapper mocks={largeMockData}>
        <DocumentMetadataGrid {...props} />
      </MetadataTestWrapper>
    );

    const startTime = Date.now();
    
    // Should render within 2 seconds
    await expect(page.getByRole("grid")).toBeVisible();
    const renderTime = Date.now() - startTime;
    expect(renderTime).toBeLessThan(2000);

    // Virtualization should limit DOM nodes
    const cells = await page.getByRole("cell").count();
    expect(cells).toBeLessThan(500); // Not all 1000 cells rendered
  });

  test("debounces saves during rapid editing", async ({ mount, page }) => {
    let saveRequests = 0;
    const trackingSaveMock = {
      request: {
        query: SET_METADATA_VALUE,
        variables: expect.any(Object),
      },
      result: () => {
        saveRequests++;
        return { data: { setMetadataValue: { success: true } } };
      },
    };

    await mount(
      <MetadataTestWrapper mocks={[trackingSaveMock]}>
        <DocumentMetadataGrid {...props} />
      </MetadataTestWrapper>
    );

    // Rapidly edit multiple cells
    for (let i = 0; i < 5; i++) {
      const cell = page.getByRole("cell").nth(i);
      await cell.click();
      await page.getByRole("textbox").fill(`Value ${i}`);
      await page.keyboard.press("Tab");
    }

    // Wait for debounce
    await page.waitForTimeout(1000);

    // Should batch saves efficiently
    expect(saveRequests).toBeLessThan(5);
  });
});
```

## Test Data Factories

Create factories for generating test data:

```typescript
// frontend/tests/factories/metadataFactories.ts
export const createMockColumn = (overrides?: Partial<ColumnType>): ColumnType => ({
  id: `col-${Date.now()}`,
  name: "Test Column",
  dataType: MetadataDataType.STRING,
  extractIsList: false,
  validationRules: {},
  orderIndex: 0,
  ...overrides,
});

export const createMockDatacell = (
  columnId: string,
  documentId: string,
  value: any
): DatacellType => ({
  id: `cell-${Date.now()}`,
  column: { id: columnId },
  document: { id: documentId },
  data: { value },
  correctedData: null,
  failed: false,
});

export const createMockFieldset = (columns: ColumnType[]): FieldsetType => ({
  id: `fieldset-${Date.now()}`,
  name: "Test Fieldset",
  columns: {
    edges: columns.map(col => ({ node: col })),
    pageInfo: createMockPageInfo(),
  },
});
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/frontend-metadata-tests.yml
name: Frontend Metadata Tests

on:
  pull_request:
    paths:
      - 'frontend/src/components/metadata/**'
      - 'frontend/src/components/corpuses/CorpusMetadataSettings.tsx'
      - 'frontend/src/components/documents/DocumentMetadataGrid.tsx'
      - 'frontend/tests/**/*metadata*'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: cd frontend && yarn install
        
      - name: Run unit tests
        run: cd frontend && yarn test:unit src/types/metadata.test.ts
        
      - name: Run component tests
        run: cd frontend && yarn test:ct tests/*Metadata*.ct.tsx
        
      - name: Generate coverage report
        run: cd frontend && yarn test:coverage --testPathPattern=metadata
```

## Testing Best Practices

1. **Use Test IDs**: Add `data-testid` attributes to key elements for reliable selection
2. **Mock at the Right Level**: Mock GraphQL operations, not internal functions
3. **Test User Flows**: Focus on complete user workflows, not just individual components
4. **Handle Async Operations**: Use proper waitFor/expect patterns for async updates
5. **Test Error States**: Include tests for network errors, validation errors, and edge cases
6. **Performance Monitoring**: Include tests that verify performance characteristics
7. **Accessibility**: Include tests for keyboard navigation and screen reader support

## Debugging Strategy

1. **Console Logging**: Use debug components to log state during tests
2. **Screenshots**: Capture screenshots on test failure
3. **Apollo DevTools**: Use Apollo Client DevTools in development
4. **React DevTools**: Inspect component state during manual testing
5. **Network Tab**: Monitor GraphQL requests/responses

## Next Steps

1. Implement test wrappers and factories
2. Write unit tests for validation functions
3. Create component tests for each major component
4. Add integration tests for complete workflows
5. Set up CI/CD pipeline for automated testing
6. Add performance benchmarks
7. Create visual regression tests with Percy or similar tool