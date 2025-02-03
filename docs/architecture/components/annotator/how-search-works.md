# PDF Search Flow Documentation

## Overview
The search functionality in DocumentAnnotator allows users to search text within PDF documents and highlights matching results. Here's how the search flow works:

## Component Flow

### 1. User Input Entry
- Search begins in `PDFActionBar` component which contains the search input field
- User input is managed through controlled input with debouncing:
```typescript:src/components/annotator/display/components/ActionBar.tsx
const handleDocSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
  const value = e.target.value;
  isUserInitiatedRef.current = true;
  setLocalSearchText(value); // Update local state immediately
  debouncedFnRef.current?.(value); // Debounce actual search
};
```

### 2. State Management
- Search text is stored in Jotai atoms defined in `DocumentAtom.tsx`:
```typescript:src/components/annotator/context/DocumentAtom.tsx
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
- you must run `useSearchText()` in a mounted component in order for effects processing search term to work.


### 4. Result Rendering
Results are rendered through a chain of components:

1. `SearchResult` Component:
```typescript:src/components/annotator/display/components/SearchResult.tsx
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
```typescript:src/components/annotator/display/components/ResultBoundary.tsx
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
```typescript:src/components/annotator/display/components/SelectionTokens.tsx
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
```typescript:src/components/annotator/display/components/Tokens.tsx
export const TokenSpan = styled.span.attrs<TokenSpanProps>((props) => ({
  style: {
    background: props.color,
    opacity: props.hidden ? 0.0 : props.highOpacity ? 0.4 : 0.2,
    position: 'absolute',
    // ... positioning styles
  }
}));
```

## Key Features
- Debounced search input to prevent performance issues
- Token-based highlighting for precise text matching
- Visual feedback through highlighting and boundaries
- Support for scrolling to matches
- State management through Jotai atoms

## Technical Notes
- Search highlights are rendered as absolutely positioned spans on top of the PDF
- Tokens use pointer-events: none to allow interaction with underlying PDF
- Results include both boundary boxes and individual token highlights for visual clarity
- Search state is managed globally through Jotai atoms for consistent access across components
