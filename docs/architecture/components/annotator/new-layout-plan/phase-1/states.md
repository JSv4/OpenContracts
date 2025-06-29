# Phase 1 — State Definitions

The first phase introduces a **single source of truth** for the layout engine. All subsequent phases will evolve this model, but the initial types live here for reference.

```typescript
// src/components/layout/layoutReducer.ts (excerpt)

export interface LayoutState {
  /**
   * Map of all panels keyed by a **stable** panel‐id.
   */
  panels: Record<string, PanelState>;
  /**
   * Currently focused / active panel – used for keyboard navigation.
   */
  activePanel: string | null;
  /**
   * Name of the active preset ("research", "reading", …) or "custom" if user tweaked.
   */
  layout: LayoutPreset | 'custom';
  /**
   * Schema version – increment on breaking changes so we can gracefully migrate / reset state.
   */
  version: string;
}

export type LayoutAction =
  | { type: 'ADD_PANEL'; payload: { id: string; config: PanelConfig } }
  | { type: 'REMOVE_PANEL'; payload: { id: string } }
  | { type: 'DOCK_PANEL'; payload: { id: string; position: DockPosition } }
  | { type: 'FLOAT_PANEL'; payload: { id: string; position: FloatPosition } }
  | { type: 'RESIZE_PANEL'; payload: { id: string; size: PanelSize } }
  | { type: 'SET_ACTIVE_PANEL'; payload: { id: string | null } }
  | { type: 'SET_LAYOUT'; payload: { preset: LayoutPreset } }
  | { type: 'RESTORE_LAYOUT'; payload: { state: LayoutState } };

// Inserted full reducer for quick reference

export const layoutReducer = (state: LayoutState, action: LayoutAction): LayoutState => {
  switch (action.type) {
    case 'ADD_PANEL':
      return {
        ...state,
        panels: {
          ...state.panels,
          [action.payload.id]: {
            id: action.payload.id,
            ...action.payload.config,
            visible: true,
            minimized: false,
            zIndex: Object.keys(state.panels).length,
          },
        },
      };

    case 'DOCK_PANEL':
      return {
        ...state,
        panels: {
          ...state.panels,
          [action.payload.id]: {
            ...state.panels[action.payload.id],
            position: action.payload.position,
            mode: 'docked',
          },
        },
      };

    case 'FLOAT_PANEL':
      return {
        ...state,
        panels: {
          ...state.panels,
          [action.payload.id]: {
            ...state.panels[action.payload.id],
            position: action.payload.position,
            mode: 'floating',
            zIndex: Math.max(
              ...Object.values(state.panels).map((p) => p.zIndex || 0),
            ) + 1,
          },
        },
      };

    // Additional cases such as REMOVE_PANEL, RESIZE_PANEL, etc. follow the same pattern

    default:
      return state;
  }
};
```

> **Note** At this stage there are **no Jotai atoms yet**. Persistence is handled directly in the `LayoutContainer` via `localStorage`. Atom‐based state lives in Phase 2. 