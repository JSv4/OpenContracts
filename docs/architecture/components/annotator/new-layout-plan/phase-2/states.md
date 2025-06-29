# Phase 2 — State Management Changes

Phase 2 introduces **Jotai** as the canonical storage layer for layout state, replacing the direct `useReducer` store from Phase 1.

```typescript
// src/components/layout/atoms/layoutAtoms.ts (excerpt)

export const layoutConfigAtom = atomWithStorage<LayoutState>(
  'document-layout-config',
  {
    panels: {},
    activePanel: null,
    layout: 'default',
    version: '1.0.0',
  },
);

export const visiblePanelsAtom = atom((get) => {
  const config = get(layoutConfigAtom);
  return Object.entries(config.panels)
    .filter(([_, panel]) => panel.visible)
    .map(([id, panel]) => ({ id, ...panel }));
});

export const dockedPanelsAtom = atom((get) => {
  const config = get(layoutConfigAtom);
  return Object.entries(config.panels)
    .filter(([_, panel]) => panel.mode === 'docked')
    .reduce((acc, [id, panel]) => ({
      ...acc,
      [panel.position]: [...(acc[panel.position] || []), { id, ...panel }],
    }), {} as Record<DockPosition, PanelState[]>);
});
```

The reducer from Phase 1 remains intact but is *invoked* via an atom effect so that state updates stay serialisable and inspectable.

> **Migration Note** On first run the code attempts to load `document-layout-config`; if absent it falls back to the Phase 1 `document-layout` key and migrates automatically. 