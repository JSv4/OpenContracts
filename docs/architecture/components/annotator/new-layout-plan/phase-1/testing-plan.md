# Phase 1 — Testing Plan

Testing follows the **layout-first** philosophy outlined in `layout-testing-strategy.md`. During Phase 1 we care *only* about mechanics – content is mocked.

## Tools & Environment

- **Playwright Component Testing** for E2E-style interactions inside real browsers.
- **Vitest** (or Jest) for pure reducer / util unit tests.
- **React Testing Library** for targeted behavioural tests if needed.

All tests mount components inside `LayoutSystemTestWrapper` (see strategy doc) to provide DnD sensors + Jotai provider.

## Must-pass Test Suite

```typescript
// tests/LayoutDocking.ct.tsx
✅ drag panel from floating ➜ docked
✅ resize docked panel respecting min/max constraints

// tests/LayoutTabs.ct.tsx
✅ combine two floating panels into a tab-set

// tests/LayoutPersistence.ct.tsx
✅ persist layout config to localStorage and restore after reload
```

These tests already exist in `layout-testing-strategy.md` and should remain **green** throughout Phase 1.

## Additional Assertions

- `layoutReducer` unit tests ensure actions mutate state immutably and predictably.
- Accessibility: all draggable elements expose proper `aria-grabbed` / `aria-dropeffect` states.
- Performance budget: Use Playwright trace viewer to confirm <16ms scripting time per frame during drag. 