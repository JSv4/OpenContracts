# Phase 1 — Layout Foundation (Weeks 1-2)

## Goals

- Establish the new, layout-first engine that will eventually replace the legacy tab-based UI inside `DocumentKnowledgeBase`.
- Build the absolute minimum set of infrastructure required for docking, floating, resizing and persisting panels.
- Run the new layout engine behind a feature flag so that it can be exercised in isolation before real content is migrated.

## Scope

The scope of Phase 1 is limited to **layout mechanics only**. No business-specific panels (Chat, Notes, etc.) are migrated yet—only dummy components are used to validate the engine.

Covered work items (taken from the existing documentation):

- Create core layout container (`LayoutContainer`) that hosts drag & dock zones (`DockZones`, `PanelGrid`, `FloatingLayer`).
- Implement the `layoutReducer` and related TypeScript types (`LayoutState`, `LayoutAction`).
- Build the first reusable panel shell (`DockablePanel`).
- Wire everything through **@dnd-kit** for accessibility-friendly drag-and-drop support.
- Persist layout state to `localStorage` under the key `document-layout`.

## Success Criteria

- Users (internal only) can **dock, undock, move and resize** dummy panels without page reloads.
- Layout configuration is correctly **saved and restored** from `localStorage`.
- Initial Playwright component tests pass (see Phase 1 testing plan).
- Performance budget: **< 16 ms** main-thread work per layout interaction (drag, resize). 