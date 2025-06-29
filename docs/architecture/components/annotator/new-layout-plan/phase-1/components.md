# Phase 1 — Core Components

## 1. `LayoutContainer`

Provides the top-level **provider**, drag-and-drop context and persistence glue.

```typescript
// --- Full LayoutContainer implementation used in Phase 1 ---
import React, { useState, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  rectIntersection,
  MeasuringStrategy,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';

// … helper imports, initialPanels etc.

export function LayoutContainer({ children, onLayoutChange, enablePersistence = true }: LayoutContainerProps) {
  const [panels, setPanels] = useState<PanelConfig[]>(initialPanels);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [floatingPanels, setFloatingPanels] = useState<FloatingPanel[]>([]);

  /* ---- sensor setup (mouse / keyboard / touch) ---- */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  /* ---- collision detection prioritising DockZones ---- */
  const collisionDetection = useCallback((args) => {
    const dockCollisions = rectIntersection({
      ...args,
      droppableContainers: args.droppableContainers.filter(
        (c) => c.data.current?.type === 'dock-zone',
      ),
    });
    return dockCollisions.length > 0
      ? dockCollisions
      : closestCenter({
          ...args,
          droppableContainers: args.droppableContainers.filter(
            (c) => c.data.current?.type === 'panel',
          ),
        });
  }, []);

  /* ---- drag lifecycle handlers ---- */
  const handleDragStart = (event: DragStartEvent) => setActiveId(event.active.id as string);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    // behaviour for floating / docking / reordering
    // … identical to guide excerpt …
    onLayoutChange?.(getCurrentLayout());
  };

  /* ---- render ---- */
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToWindowEdges]}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    >
      <div className="layout-container">
        {/* Dock zones */}
        <DockZone id="dock-left" position="left" />
        <DockZone id="dock-right" position="right" />
        <DockZone id="dock-top" position="top" />
        <DockZone id="dock-bottom" position="bottom" />

        {/* Main panel grid */}
        <SortableContext items={panels.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div className="panel-grid">
            {panels.map((panel) => (
              <DockablePanel key={panel.id} {...panel} />
            ))}
          </div>
        </SortableContext>

        {/* Floating panels */}
        {floatingPanels.map((panel) => (
          <FloatingPanel key={panel.id} {...panel} />
        ))}

        {/* Drag overlay for smooth dragging */}
        <DragOverlay>{activeId ? <DockablePanel id={activeId} isDragging /> : null}</DragOverlay>
      </div>
    </DndContext>
  );
}
```

## 2. `DockablePanel`

Reusable shell that can live **docked** inside a zone *or* **floating**.

```typescript
// src/components/layout/DockablePanel.tsx (trimmed)

export const DockablePanel: React.FC<DockablePanelProps> = ({
  id,
  title,
  icon,
  children,
  defaultPosition = 'floating',
  defaultSize = { width: 400, height: 300 },
}) => {
  const { state, dispatch } = useLayoutContext();
  const panelState = state.panels[id] || {};

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id,
    disabled: panelState.mode === 'docked',
  });

  const handleResize = (_e: unknown, { size }: { size: PanelSize }) => {
    dispatch({ type: 'RESIZE_PANEL', payload: { id, size } });
  };

  // … render logic for floating vs docked …
};
```

## 3. `DockZones`, `PanelGrid`, `FloatingLayer`

Helper components rendered **inside** `LayoutContainer` responsible for:

- Rendering drop-zones (left, right, top, bottom, full) that highlight on drag.
- Housing docked panels in a CSS grid.
- Hosting absolutely positioned floating windows in their own stacking context.

*(See `future-plans-implementation-guide.md` – Step 1.1 for full source)* 

### Dock Zones helper

```typescript
// DockZone.tsx (Phase 1 reference)
import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { motion, AnimatePresence } from 'framer-motion';

interface DockZoneProps {
  id: string;
  position: 'left' | 'right' | 'top' | 'bottom';
}

export function DockZone({ id, position }: DockZoneProps) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: 'dock-zone', position },
  });

  return (
    <>
      <div ref={setNodeRef} className={`dock-zone dock-zone-${position}`} />
      <AnimatePresence>
        {isOver && (
          <motion.div
            className={`dock-preview dock-preview-${position}`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
``` 