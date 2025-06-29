# Phase 4 — Optimisations & Hardening Components

## 1. `OptimizedPanel`

Memoised wrapper that prevents unnecessary re-renders for docked/floating panels.

```typescript
export const OptimizedPanel = memo(DockablePanel, (prev, next) => {
  return (
    prev.id === next.id &&
    prev.isActive === next.isActive &&
    prev.size?.width === next.size?.width &&
    prev.size?.height === next.size?.height &&
    prev.position === next.position
  );
});
```

## 2. `VirtualizedContextFeed`

Introduces windowed list rendering + debounced data input for smoothness (see Phase-3 for base component).

## 3. `LayoutErrorBoundary`

Global React error boundary that catches rendering errors, logs them to Sentry and offers a **reset layout** button.

```typescript
export class LayoutErrorBoundary extends Component<Props, State> {
  // full source available in implementation guide Step 4.2
}
``` 