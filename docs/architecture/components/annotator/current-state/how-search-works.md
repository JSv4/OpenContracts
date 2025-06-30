# PDF Search Flow Documentation

## Overview
The search functionality in the document knowledge base allows users to search text within PDF documents and highlights matching results. Here's how the search flow works:

## Component Flow

### 1. User Input Entry
- Search can be initiated through multiple entry points:
  - The search tab in the right panel when `activeTab === "search"`
  - The `SearchSidebarWidget` component
  - The unified `FloatingDocumentInput` component
- User input is managed through controlled input with debouncing:
```typescript
const handleDocSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
  const value = e.target.value;
  isUserInitiatedRef.current = true;
  setLocalSearchText(value); // Update local state immediately
  debouncedFnRef.current?.(value); // Debounce actual search
};
```

### 2. State Management
- Search text is stored in Jotai atoms defined in `DocumentAtom.tsx`:
```typescript
export const textSearchStateAtom = atom<{
  matches: (TextSearchTokenResult | TextSearchSpanResult)[];
  selectedIndex: number;
}>({
  matches: [],
  selectedIndex: 0,
});

export const searchTextAtom = atom<string>("");
```

### 3. Search Processing
- The search text is processed to find matching tokens in the PDF document
- Matches are converted into `TextSearchTokenResult` objects containing:
  - Token IDs
  - Page numbers
  - Bounding box coordinates
  - Match metadata
- The `useTextSearch()` hook must be called in `DocumentKnowledgeBase` for search processing to work

### 4. Result Rendering
Results are rendered through a chain of components:

1. `SearchResult` Component:
```typescript
export const SearchResult = ({
  total_results,
  showBoundingBox,
  hidden,
  pageInfo,
  match,
  showInfo = true,
  scrollIntoView = false,
}) => {
  // Renders both the highlight boundary and tokens
  return (
    <>
      <ResultBoundary {...props}>
        <SearchSelectionTokens {...tokenProps} />
      </ResultBoundary>
    </>
  );
};
```

2. `ResultBoundary` Component:
- Creates the yellow highlight box around matched text
```typescript
export const ResultBoundary = ({
  id,
  hidden,
  showBoundingBox,
  scrollIntoView,
  color,
  bounds,
  children,
}) => {
  // Renders a boundary box with specified dimensions and styling
};
```

3. `SearchSelectionTokens` Component:
- Renders individual token highlights
```typescript
export const SearchSelectionTokens = ({
  color,
  hidden,
  pageInfo,
  tokens,
}) => {
  // Renders highlighted spans for each matching token
};
```

### 5. Visual Styling
- Matched text is highlighted using styled components:
```typescript
export const TokenSpan = styled.span.attrs<TokenSpanProps>((props) => ({
  style: {
    background: props.color,
    opacity: props.hidden ? 0.0 : props.highOpacity ? 0.4 : 0.2,
    position: 'absolute',
    // ... positioning styles
  }
}));
```

### 6. Integration with Unified Feed
- Search results can also be displayed in the `UnifiedContentFeed` when in feed mode
- The feed shows search results alongside annotations, notes, and relationships
- Clicking a search result in the feed navigates to that location in the document

## Key Features
- Debounced search input to prevent performance issues
- Token-based highlighting for precise text matching
- Visual feedback through highlighting and boundaries
- Support for scrolling to matches
- State management through Jotai atoms
- Integration with unified content feed
- Multiple entry points for search functionality

## Technical Notes
- Search highlights are rendered as absolutely positioned spans on top of the PDF
- Tokens use pointer-events: none to allow interaction with underlying PDF
- Results include both boundary boxes and individual token highlights for visual clarity
- Search state is managed globally through Jotai atoms for consistent access across components
- The PDF virtualization system ensures search result pages are always rendered when active
