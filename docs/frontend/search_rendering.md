# Search Result Rendering - The Deep Dive

1. **PDF Page Level Search Result Handling**
In `PDFPage.tsx`, we see the crucial connection between search matches and their visual representation:

```typescript
const { textSearchMatches: searchResults, selectedTextSearchMatchIndex } = useTextSearchState();
```

The component filters and processes these search results specifically for each PDF page:
```typescript
searchResults
  .filter((match): match is TextSearchTokenResult => "tokens" in match)  // Type guard to ensure token-based results
  .filter((match) => match.tokens[pageInfo.page.pageNumber - 1] !== undefined)  // Only show results for this page
  .map((match) => {
    const isHidden = match.id !== selectedTextSearchMatchIndex;
    return (
      <SearchResult
        key={match.id}
        total_results={searchResults.length}
        showBoundingBox={true}
        hidden={isHidden}
        pageInfo={updatedPageInfo}
        match={match}
      />
    );
  })
```

2. **Search Result Visualization Architecture**
The system uses a layered approach:
- The base layer is the PDF canvas (`<PageCanvas>`)
- Above it sits the `<SelectionLayer>` for user interactions
- Search results are rendered as `<SearchResult>` components in the same stack
- All of these are wrapped in a `<CanvasWrapper>` with `position: relative` to maintain proper positioning

3. **Token-Based Search Implementation**
The search results are specifically filtered for `TextSearchTokenResult` types, which contain:
- Token information for specific pages
- Page number information (start_page and end_page)
- Actual matching text content

4. **Coordinate System and Scaling**
The PDFPage component handles viewport scaling:
```typescript
const pageViewport = pageInfo.page.getViewport({ scale: 1 });
const { zoomLevel } = useZoomLevel();
```

This scaling information is passed to search results to ensure they're properly positioned regardless of zoom level:
```typescript
const updatedPageInfo = useMemo(() => {
  return new PDFPageInfo(
    pageInfo.page,
    pageInfo.tokens,
    zoomLevel,
    pageBounds
  );
}, [pageInfo.page, pageInfo.tokens, zoomLevel, pageBounds]);
```

5. **Search Result Highlighting and Navigation**
- Each `<SearchResult>` component receives:
  - The match data
  - Whether it should be hidden (based on selectedTextSearchMatchIndex)
  - The total number of results for context
  - Updated page information for proper scaling and positioning

6. **State Management Flow**
```
User Types Search → 
  useSearchText (Jotai atom) → 
    Text Search Processing → 
      Results stored in textSearchMatches atom →
        PDFPage components filter relevant results →
          SearchResult components render highlights
```

7. **Performance Considerations**
The implementation uses several performance optimizations:
- `useMemo` for expensive calculations
- Filtering results per page to avoid unnecessary rendering
- Type guards to ensure type safety and proper handling of token-based results

8. **Visual Feedback Loop**
When a search result is selected:
1. The `selectedTextSearchMatchIndex` is updated
2. This triggers re-renders of `SearchResult` components
3. The selected result becomes visible while others are hidden
4. The document view scrolls to the selected result's position

The search functionality isn't just a simple text highlight - it's a carefully orchestrated system that works across multiple layers of the PDF rendering stack while maintaining performance and accuracy.
