# Phase 3 — State Additions

The Context Feed itself is **derived** data – it does **not** introduce new writeable atoms. Instead we build selectors on top of existing annotation / relationship stores.

```typescript
// src/components/layout/ContextFeed/useContextAggregation.ts (trimmed)

export const useContextAggregation = (viewport: ViewportState) => {
  const annotations = useAtomValue(allAnnotationsAtom);
  const relationships = useAtomValue(relationshipsAtom);
  const notes = useAtomValue(notesAtom);
  const searchResults = useAtomValue(searchResultsAtom);

  return useMemo(() => {
    const items: ContextItem[] = [];

    // scoring logic … (see implementation guide)

    return items.sort((a, b) => b.score - a.score);
  }, [annotations, relationships, notes, searchResults, viewport]);
};
```

### New Derived Types

```typescript
type ContextItem = {
  id: string;
  type: 'annotation' | 'relationship' | 'note' | 'search-result';
  data: unknown;        // original domain entity
  score: number;        // 0–1 relevance score
  distance: number;     // pixel distance from viewport
  pageNumber: number;
};
```

> **Performance** All heavy computations run inside a `useMemo` and are throttled via `useDebounce` in the UI component to avoid jank. 