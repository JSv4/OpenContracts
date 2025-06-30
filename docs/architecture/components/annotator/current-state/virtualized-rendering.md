# Virtualized PDF Rendering System

## Overview

The PDF annotation system implements a sophisticated virtualization approach to handle large documents efficiently. Instead of rendering all pages at once, only visible pages (plus a small buffer) are rendered, dramatically improving performance and memory usage.

## Architecture

### Core Concept

The virtualization system works by:
1. Calculating heights of all pages at the current zoom level
2. Determining which pages are visible in the viewport
3. Only rendering those pages (plus overscan)
4. Ensuring selected items' pages are always rendered

### Component Structure

```
PDF.tsx (Virtualization Engine)
├── Manages visible page range
├── Handles scroll events
├── Calculates page positions
└── Renders PDFPage components conditionally
    └── PDFPage.tsx (Individual Page)
        ├── Renders PDF canvas when visible
        ├── Displays annotations for the page
        └── Manages its own lifecycle
```

## Implementation Details

### Page Height Calculation

When the PDF loads or zoom changes:

```typescript
// In PDF.tsx
useEffect(() => {
  if (!pdfDoc) return;
  (async () => {
    const h: number[] = [];
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      h.push(page.getViewport({ scale: zoomLevel }).height + 32);
    }
    setPageHeights(h); // Cache heights at this zoom level
  })();
}, [pdfDoc, zoomLevel]);
```

### Cumulative Heights

For efficient position calculations:

```typescript
const cumulative = useMemo(() => {
  const out: number[] = [0];
  for (let i = 0; i < pageHeights.length; i++) {
    out.push(out[i] + pageHeights[i]);
  }
  return out; // cumulative[i] = top position of page i
}, [pageHeights]);
```

### Visible Range Detection

The system uses binary search for efficiency:

```typescript
const calcRange = useCallback(() => {
  const el = getScrollElement();
  const scroll = /* current scroll position */;
  const viewH = /* viewport height */;

  // Binary search for first visible page
  let lo = 0, hi = cumulative.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (cumulative[mid + 1] < scroll) lo = mid + 1;
    else hi = mid;
  }
  const first = lo;

  // Find last visible page
  const limit = scroll + viewH;
  // ... binary search for last visible

  // Add overscan for smooth scrolling
  const overscan = 2;
  let start = Math.max(0, first - overscan);
  let end = Math.min(pageCount - 1, last + overscan);

  setRange([start, end]);
}, [/* dependencies */]);
```

### Smart Range Expansion

The system ensures important content is always rendered:

```typescript
// Force selected annotation's page to be visible
if (selectedPageIdx !== undefined) {
  start = Math.min(start, selectedPageIdx);
  end = Math.max(end, selectedPageIdx);
}

// Same for search results
if (selectedSearchPageIdx !== undefined) {
  start = Math.min(start, selectedSearchPageIdx);
  end = Math.max(end, selectedSearchPageIdx);
}

// And chat source highlights
if (selectedChatSourcePageIdx !== undefined) {
  start = Math.min(start, selectedChatSourcePageIdx);
  end = Math.max(end, selectedChatSourcePageIdx);
}
```

### Rendering Loop

Only pages in range are rendered:

```typescript
return (
  <div style={{ position: "relative" }}>
    {pageInfos.map((pInfo, idx) => {
      const top = cumulative[idx];
      const height = pageHeights[idx];
      const visible = idx >= range[0] && idx <= range[1];

      return (
        <div
          key={pInfo.page.pageNumber}
          style={{
            position: "absolute",
            top,
            height,
            width: "100%",
          }}
        >
          {visible && (
            <PDFPage
              pageInfo={pInfo}
              /* other props */
            />
          )}
        </div>
      );
    })}
    {/* Spacer maintains correct scroll height */}
    <div style={{ height: cumulative[cumulative.length - 1] }} />
  </div>
);
```

## Scroll-to-Annotation System

The system implements a two-phase approach for scrolling to specific items:

### Phase 1: Page-Level Scroll (PDF.tsx)

When an annotation is selected:
1. Calculate which page contains the annotation
2. Scroll the container so the page is visible
3. Set a pending scroll ID for phase 2

```typescript
useEffect(() => {
  if (selectedAnnotations.length === 0 || pageHeights.length === 0) return;
  if (selectedPageIdx === undefined) return;

  const targetId = selectedAnnotations[0];

  // Scroll to page
  const topOffset = Math.max(0, cumulative[selectedPageIdx] - 32);
  getScrollElement().scrollTo({ top: topOffset, behavior: "smooth" });

  // Tell PDFPage to center the annotation
  setPendingScrollId(targetId);
}, [selectedAnnotations, selectedPageIdx, /* ... */]);
```

### Phase 2: Element-Level Scroll (PDFPage.tsx)

Once the page is rendered:
1. PDFPage checks for pending scroll requests
2. Finds the specific annotation element
3. Scrolls it into view with centering

```typescript
useEffect(() => {
  if (!hasPdfPageRendered) return;

  if (pendingScrollId) {
    const pageOwnsAnnotation = /* check if annotation is on this page */;
    if (!pageOwnsAnnotation) return;

    let cancelled = false;
    const tryScroll = () => {
      if (cancelled) return;
      const el = document.querySelector(`.selection_${pendingScrollId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setPendingScrollId(null); // Clear pending
      } else {
        requestAnimationFrame(tryScroll); // Retry
      }
    };
    tryScroll();
  }
}, [hasPdfPageRendered, pendingScrollId, /* ... */]);
```

## Performance Benefits

### Memory Usage
- Only visible pages hold rendered canvases
- Annotations for non-visible pages aren't mounted
- Dramatic reduction for documents with 100+ pages

### Rendering Performance
- Initial load only renders visible pages
- Scrolling only renders newly visible pages
- Zoom changes only affect rendered pages

### Smooth Scrolling
- Overscan ensures pages are ready before visible
- Height caching prevents layout recalculations
- RequestAnimationFrame for optimal timing

## Configuration

### Overscan Amount
```typescript
const overscan = 2; // Pages to render above/below viewport
```

### Scroll Container
The system supports both window scrolling and container scrolling:

```typescript
const getScrollElement = useCallback((): HTMLElement | Window => {
  const el = scrollContainerRef?.current;
  if (el && el.scrollHeight > el.clientHeight) return el;
  return window; // Fallback to window scrolling
}, [scrollContainerRef]);
```

## Best Practices

1. **Keep overscan reasonable** - Too much defeats virtualization benefits
2. **Cache computations** - Page heights are expensive to calculate
3. **Use binary search** - Linear search is too slow for large documents
4. **Handle edge cases** - Selected items must always be visible
5. **Debounce scroll events** - Use requestAnimationFrame for smoothness

## Future Enhancements

1. **Dynamic overscan** - Adjust based on scroll velocity
2. **Progressive rendering** - Low-res preview while scrolling
3. **Intersection Observer** - More efficient visibility detection
4. **Memory pressure handling** - Reduce overscan under memory constraints
5. **Predictive preloading** - Anticipate scroll direction
