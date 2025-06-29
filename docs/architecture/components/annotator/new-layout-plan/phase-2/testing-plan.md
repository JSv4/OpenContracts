# Phase 2 — Testing Plan

The focus shifts from *mechanics* to **integration & regression**.

## Key Areas

1. **Adapter correctness** – each migrated panel must still function exactly as in the legacy UI.
2. **Atom synchronisation** – updates made by user interactions should propagate across the tree.
3. **Feature-flag path parity** – switching the `newLayoutSystem` flag on/off during a session should not crash or lose state.

## Test Matrix

| Concern | Legacy Flag OFF | Flag ON |
|---------|-----------------|---------|
| Chat loads older messages | ✅ | ✅ |
| Annotations panel shows filters | ✅ | ✅ |
| Notes panel edit/save cycle | ✅ | ✅ |
| Layout persists across reload | ❌ | ✅ (new) |

## Representative Playwright Tests

```typescript
// tests/MigratedPanels.ct.tsx (see strategy doc)
✅ chat panel continues to send & receive messages after being floated/docked
✅ notes panel maintains rich-text editors when tabbed alongside chat
```

## Unit Tests

- Atom selectors (`visiblePanelsAtom`, `dockedPanelsAtom`) behave correctly given mocked state shapes.

## Manual QA Checklist

- Toggling feature flag retains scroll position and currently selected annotation.
- Inspect Redux dev-tools (or Jotai dev-tools) for unexpected re-render storms. 