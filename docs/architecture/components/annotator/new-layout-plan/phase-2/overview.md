# Phase 2 — Component Migration (Weeks 3-5)

## Goals

- **Wrap** existing functional panels (Chat, Notes, Annotations, …) in `DockablePanel` shells via *panel-adapters*.
- Keep the legacy tab-based implementation alive behind the existing feature flag for rapid rollback.
- Introduce **persistent, atom-based** state so multiple React trees (e.g. toolbars) can observe layout changes.

## Scope

This phase focuses on **integration**—no new layout features are built. Instead we:

1. Generate adapter components with `createPanelAdapter(...)` (see code below).
2. Extend `DocumentKnowledgeBase` to render through `LayoutContainer` when the feature flag is enabled.
3. Add Jotai atoms (`layoutConfigAtom`, `visiblePanelsAtom`, etc.) for global observability & persistence.
4. Maintain **100 % functional parity** with the legacy UI.

## Success Criteria

- All major panels render inside the new layout without runtime errors.
- Toggling the feature flag switches between *old* and *new* UI paths without losing user state.
- `layoutConfigAtom` round-trips to `localStorage` and is forward-compatible (versioning works).
- No significant performance or bundle-size regressions (≤ +20 KB gzipped). 