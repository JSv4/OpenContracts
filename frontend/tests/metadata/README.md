# Metadata Testing Guide

## Overview

This directory contains comprehensive tests for the OpenContracts metadata functionality. The tests follow established patterns in the codebase and ensure full coverage of the metadata feature set.

## Test Structure

### Test Files

1. **Unit Tests**

   - `src/types/metadata.test.ts` - Tests for validation functions
   - `src/utils/metadataUtils.test.ts` - Tests for utility functions

2. **Component Tests**

   - `tests/CorpusMetadataSettings.ct.tsx` - Tests for metadata schema management
   - `tests/DocumentMetadataGrid.ct.tsx` - Tests for Excel-like grid editing
   - `tests/MetadataCellEditor.ct.tsx` - Tests for type-specific editors

3. **Integration Tests**
   - `tests/MetadataWorkflow.ct.tsx` - End-to-end workflow tests
   - `tests/MetadataErrorHandling.ct.tsx` - Error scenarios
   - `tests/MetadataPerformance.ct.tsx` - Performance benchmarks

### Supporting Files

- `tests/MetadataTestWrapper.tsx` - Apollo test wrapper for metadata components
- `tests/MetadataDebug.story.tsx` - Debug components for troubleshooting
- `tests/factories/metadataFactories.ts` - Factory functions for test data

## Running Tests

### All Tests

```bash
# Run all frontend tests
yarn test:unit
yarn test:ct

# Run only metadata tests
yarn test:unit src/**/*metadata*.test.ts
yarn test:ct tests/*Metadata*.ct.tsx
```

### Specific Test Suites

```bash
# Unit tests only
yarn test:unit src/types/metadata.test.ts

# Component tests only
yarn test:ct tests/CorpusMetadataSettings.ct.tsx

# With coverage
yarn test:coverage --testPathPattern=metadata
```

### Debug Mode

```bash
# Run tests with UI (Playwright)
yarn test:ct --ui

# Run specific test in debug mode
yarn test:ct tests/DocumentMetadataGrid.ct.tsx --debug
```

## Test Patterns

### 1. Apollo Mocking

Always use `MockedProvider` with proper type policies:

```typescript
const mocks = [
  {
    request: {
      query: GET_CORPUS_METADATA_COLUMNS,
      variables: { corpusId },
    },
    result: {
      data: { corpus: { metadataSchema: mockFieldset } },
    },
  },
];

await mount(
  <MetadataTestWrapper mocks={mocks}>
    <YourComponent />
  </MetadataTestWrapper>
);
```

### 2. Testing Async Operations

Use proper wait patterns for GraphQL operations:

```typescript
// Wait for loading state to clear
await expect(page.getByTestId("loading")).not.toBeVisible();

// Wait for data to appear
await expect(page.getByText("Expected Data")).toBeVisible({ timeout: 5000 });
```

### 3. Keyboard Navigation

Test Excel-like keyboard interactions:

```typescript
// Tab navigation
await page.keyboard.press("Tab");
await expect(nextCell).toBeFocused();

// Escape to cancel
await page.keyboard.press("Escape");
await expect(page.getByRole("textbox")).not.toBeVisible();
```

### 4. Error Handling

Always test error scenarios:

```typescript
const errorMock = {
  request: { query: MUTATION },
  error: new Error("Network error"),
};

// Test error display and recovery
await expect(page.getByText(/error/i)).toBeVisible();
```

## Debugging Failed Tests

### 1. Enable Console Logging

```typescript
page.on("console", (msg) => {
  console.log("Browser:", msg.text());
});
```

### 2. Use Debug Components

```typescript
import { MetadataDebugComponent } from "./MetadataDebug.story";

<MetadataDebugComponent columns={columns} />;
```

### 3. Screenshots on Failure

Tests automatically capture screenshots on failure in CI. Check the artifacts.

### 4. Trace Viewer

```bash
# Record trace
yarn test:ct --trace on

# View trace
npx playwright show-trace trace.zip
```

## Performance Benchmarks

The `MetadataPerformance.ct.tsx` tests establish performance baselines:

- Initial render: < 2 seconds for 100 documents × 10 columns
- Scroll performance: < 500ms for smooth scrolling
- Save debouncing: Batches rapid edits efficiently
- Search filtering: < 1 second for large datasets

## CI/CD Integration

Tests run automatically on:

1. **Every PR** - Via `.github/workflows/frontend.yml`
2. **Metadata changes** - Via `.github/workflows/frontend-metadata.yml`

### Coverage Requirements

- Branches: 80%
- Functions: 80%
- Lines: 80%
- Statements: 80%

## Common Issues

### 1. Flaky Tests

If tests are flaky, check for:

- Missing `await` statements
- Race conditions in mocks
- Hardcoded timeouts that are too short

### 2. Apollo Cache Issues

Ensure proper cache configuration:

```typescript
const cache = new InMemoryCache({
  typePolicies: {
    ColumnType: { keyFields: ["id"] },
  },
});
```

### 3. Type Errors

Run TypeScript check before tests:

```bash
yarn tsc --noEmit
```

## Adding New Tests

1. Create test file following naming convention
2. Use appropriate test wrapper
3. Mock all GraphQL operations
4. Test happy path and error cases
5. Add to CI workflow if needed

## Resources

- [Playwright Component Testing](https://playwright.dev/docs/test-components)
- [Apollo Testing](https://www.apollographql.com/docs/react/development-testing/testing/)
- [Vitest Documentation](https://vitest.dev/)
