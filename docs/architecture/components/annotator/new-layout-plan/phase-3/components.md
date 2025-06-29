# Phase 3 — New Components & Hooks

## 1. `useViewportTracking`

Tracks scroll position & window size of the PDF viewer and returns a `ViewportState` object.

```typescript
export interface ViewportState {
  scrollTop: number;
  visiblePageRange: [number, number];
  documentHeight: number;
  viewportHeight: number;
  currentPage: number;
}
```

See full implementation in *future-plans-implementation-guide.md › Phase 3 Step 3.1*.

## 2. `useContextAggregation`

Consumes `ViewportState` + global atoms to build a relevance-ordered array of `ContextItem`s.

(Implementation excerpt included in Phase-3 states.)

## 3. `ContextFeedPanel`

A new **panel adapter** wrapping `VirtualizedContextFeed`:

```typescript
export const ContextFeedAdapter = createPanelAdapter(VirtualizedContextFeed, {
  id: 'context-feed',
  title: 'Context Feed',
  icon: <Layers size={18} />,
  defaultPosition: 'right',
  defaultSize: { width: 340, height: '100%' },
});
```

The feed itself uses a `VirtualList` component to render only visible items and debounces input data for smoother scrolling. 