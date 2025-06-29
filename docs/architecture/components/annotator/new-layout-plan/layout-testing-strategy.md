# Layout-First Testing & Migration Strategy

## Core Principle: Decouple Layout from Content

The layout system should be completely agnostic to what it contains. We test the mechanics of docking, dragging, resizing, and persisting layouts WITHOUT any knowledge of annotations, PDFs, or context feeds.

## Testing Architecture

### 1. Test Wrapper for Layout Components

```typescript
// LayoutSystemTestWrapper.tsx
import React from "react";
import { Provider } from "jotai";
import { DndContext, MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core";

interface LayoutSystemTestWrapperProps {
  children: React.ReactNode;
  initialLayout?: LayoutConfig;
}

export const LayoutSystemTestWrapper: React.FC<LayoutSystemTestWrapperProps> = ({
  children,
  initialLayout,
}) => {
  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor)
  );

  return (
    <Provider>
      <DndContext sensors={sensors}>
        <LayoutManager initialConfig={initialLayout}>
          {children}
        </LayoutManager>
      </DndContext>
    </Provider>
  );
};
```

### 2. Dummy Components for Testing

```typescript
// test-components/DummyPanels.tsx

export const DummyPanelA: React.FC = () => (
  <div data-testid="dummy-panel-a" style={{ padding: 20, background: '#e3f2fd' }}>
    <h3>Panel A</h3>
    <p>I'm a simple panel with some content.</p>
    <button>Dummy Button</button>
  </div>
);

export const DummyPanelB: React.FC = () => (
  <div data-testid="dummy-panel-b" style={{ padding: 20, background: '#f3e5f5' }}>
    <h3>Panel B</h3>
    <ul>
      <li>Item 1</li>
      <li>Item 2</li>
      <li>Item 3</li>
    </ul>
  </div>
);

export const DummyPanelC: React.FC = () => (
  <div data-testid="dummy-panel-c" style={{ padding: 20, background: '#e8f5e9' }}>
    <h3>Panel C</h3>
    <div style={{ height: 200, background: '#c8e6c9' }}>
      Scrollable content area
    </div>
  </div>
);
```

## Playwright Component Tests

### Test 1: Basic Docking Operations

```typescript
// tests/LayoutDocking.ct.tsx
import { test, expect } from "@playwright/experimental-ct-react";
import { LayoutSystemTestWrapper } from "./LayoutSystemTestWrapper";
import { DockableContainer } from "../src/components/layout/DockableContainer";
import { DummyPanelA, DummyPanelB } from "./test-components/DummyPanels";

test("can drag panel from floating to docked position", async ({ mount, page }) => {
  await mount(
    <LayoutSystemTestWrapper>
      <DockableContainer id="panel-a" title="Panel A" defaultMode="floating" x={100} y={100}>
        <DummyPanelA />
      </DockableContainer>
      <DockableContainer id="panel-b" title="Panel B" defaultMode="floating" x={300} y={200}>
        <DummyPanelB />
      </DockableContainer>
    </LayoutSystemTestWrapper>
  );

  // Panel A starts floating
  const panelA = page.locator('[data-panel-id="panel-a"]');
  await expect(panelA).toHaveClass(/floating/);
  
  // Drag Panel A to right dock zone
  const dragHandle = panelA.locator('[data-drag-handle]');
  const rightDockZone = page.locator('[data-dock-zone="right"]');
  
  await dragHandle.hover();
  await page.mouse.down();
  
  // Move to right edge - dock zone should highlight
  await rightDockZone.hover();
  await expect(rightDockZone).toHaveClass(/active/);
  
  await page.mouse.up();
  
  // Panel A should now be docked
  await expect(panelA).toHaveClass(/docked/);
  await expect(panelA.locator('[data-testid="dummy-panel-a"]')).toBeVisible();
});

test("can resize docked panels", async ({ mount, page }) => {
  await mount(
    <LayoutSystemTestWrapper
      initialLayout={{
        panels: {
          "panel-a": { mode: "docked", position: "right", width: 300 }
        }
      }}
    >
      <DockableContainer id="panel-a" title="Panel A">
        <DummyPanelA />
      </DockableContainer>
    </LayoutSystemTestWrapper>
  );

  const panelA = page.locator('[data-panel-id="panel-a"]');
  const resizeHandle = panelA.locator('[data-resize-handle="left"]');
  
  // Get initial width
  const initialBox = await panelA.boundingBox();
  expect(initialBox?.width).toBeCloseTo(300, 1);
  
  // Drag resize handle
  await resizeHandle.hover();
  await page.mouse.down();
  await page.mouse.move(initialBox!.x - 100, initialBox!.y);
  await page.mouse.up();
  
  // Panel should be wider
  const newBox = await panelA.boundingBox();
  expect(newBox?.width).toBeCloseTo(400, 1);
});
```

### Test 2: Tab Management

```typescript
// tests/LayoutTabs.ct.tsx
test("can combine panels into tabs", async ({ mount, page }) => {
  await mount(
    <LayoutSystemTestWrapper>
      <DockableContainer id="panel-a" title="Panel A" defaultMode="docked" position="right">
        <DummyPanelA />
      </DockableContainer>
      <DockableContainer id="panel-b" title="Panel B" defaultMode="floating">
        <DummyPanelB />
      </DockableContainer>
    </LayoutSystemTestWrapper>
  );

  // Drag Panel B onto Panel A's tab area
  const panelB = page.locator('[data-panel-id="panel-b"]');
  const panelATabArea = page.locator('[data-panel-id="panel-a"] [data-tab-drop-zone]');
  
  await panelB.locator('[data-drag-handle]').hover();
  await page.mouse.down();
  await panelATabArea.hover();
  
  // Tab drop zone should highlight
  await expect(panelATabArea).toHaveClass(/accepting/);
  
  await page.mouse.up();
  
  // Should now see two tabs
  const tabBar = page.locator('[data-panel-id="panel-a"] [data-tab-bar]');
  await expect(tabBar.locator('[data-tab="panel-a"]')).toBeVisible();
  await expect(tabBar.locator('[data-tab="panel-b"]')).toBeVisible();
  
  // Click Panel B tab
  await tabBar.locator('[data-tab="panel-b"]').click();
  await expect(page.locator('[data-testid="dummy-panel-b"]')).toBeVisible();
  await expect(page.locator('[data-testid="dummy-panel-a"]')).not.toBeVisible();
});
```

### Test 3: State Persistence

```typescript
// tests/LayoutPersistence.ct.tsx
test("persists layout configuration", async ({ mount, page, context }) => {
  // First mount - arrange panels
  await mount(
    <LayoutSystemTestWrapper>
      <DockableContainer id="panel-a" title="Panel A">
        <DummyPanelA />
      </DockableContainer>
    </LayoutSystemTestWrapper>
  );

  // Move panel to specific position
  const panelA = page.locator('[data-panel-id="panel-a"]');
  await panelA.locator('[data-drag-handle]').hover();
  await page.mouse.down();
  await page.mouse.move(200, 150);
  await page.mouse.up();

  // Verify localStorage was updated
  const layoutState = await page.evaluate(() => 
    localStorage.getItem('document-layout-config')
  );
  expect(JSON.parse(layoutState!)).toMatchObject({
    panels: {
      "panel-a": { 
        mode: "floating", 
        x: expect.any(Number),
        y: expect.any(Number)
      }
    }
  });

  // Reload and verify position restored
  await page.reload();
  const restoredPanel = page.locator('[data-panel-id="panel-a"]');
  const box = await restoredPanel.boundingBox();
  expect(box?.x).toBeCloseTo(200, 10);
  expect(box?.y).toBeCloseTo(150, 10);
});
```

## Migration Strategy: Wrapping Existing Components

### Phase 1: Create Layout Adapters

```typescript
// components/layout/adapters/ChatPanelAdapter.tsx
import React from "react";
import { DockableContainer } from "../DockableContainer";
import { ChatTray } from "../../knowledge_base/right_tray/ChatTray";

interface ChatPanelAdapterProps {
  documentId: string;
  corpusId: string;
  onMessageSelect: () => void;
  setShowLoad: (show: boolean) => void;
  showLoad: boolean;
}

export const ChatPanelAdapter: React.FC<ChatPanelAdapterProps> = (props) => {
  return (
    <DockableContainer
      id="chat-panel"
      title="Chat"
      icon={<MessageSquare size={18} />}
      defaultMode="docked"
      defaultPosition="right"
      defaultWidth={400}
      minWidth={300}
      maxWidth={800}
    >
      <ChatTray {...props} />
    </DockableContainer>
  );
};
```

### Phase 2: Progressive Migration in DocumentKnowledgeBase

```typescript
// Start with feature flag
const useNewLayoutSystem = () => {
  const [flags] = useAtom(featureFlagsAtom);
  return flags.newLayoutSystem ?? false;
};

// In DocumentKnowledgeBase render:
{useNewLayoutSystem() ? (
  <LayoutManager>
    <ChatPanelAdapter {...chatProps} />
    <NotesPanelAdapter {...notesProps} />
    <AnnotationsPanelAdapter {...annotationsProps} />
  </LayoutManager>
) : (
  // Existing tab-based implementation
  <SlidingPanel>...</SlidingPanel>
)}
```

### Phase 3: Test the Migration

```typescript
// tests/MigratedPanels.ct.tsx
test("migrated chat panel maintains functionality", async ({ mount, page }) => {
  const mocks = [...chatMocks]; // Existing GraphQL mocks
  
  await mount(
    <DocumentKnowledgeBaseTestWrapper mocks={mocks}>
      <LayoutSystemTestWrapper>
        <ChatPanelAdapter 
          documentId="DOC_1" 
          corpusId="CORPUS_1"
          onMessageSelect={vi.fn()}
          setShowLoad={vi.fn()}
          showLoad={false}
        />
      </LayoutSystemTestWrapper>
    </DocumentKnowledgeBaseTestWrapper>
  );

  // Verify chat loads
  const chatPanel = page.locator('[data-panel-id="chat-panel"]');
  await expect(chatPanel).toBeVisible();
  
  // Verify it can be docked/undocked
  await chatPanel.locator('[data-float-button]').click();
  await expect(chatPanel).toHaveClass(/floating/);
  
  // Verify chat content still works
  await expect(chatPanel.locator('[data-testid="chat-messages"]')).toBeVisible();
});
```

## Key Testing Principles

1. **Test Layout Mechanics Only**: Don't test annotation creation, PDF rendering, or data fetching in layout tests
2. **Use Dummy Components**: Simple divs with identifiable content are perfect
3. **Test User Interactions**: Drag, drop, resize, minimize, maximize, tab switching
4. **Test State Persistence**: Layouts should survive page reloads
5. **Test Edge Cases**: 
   - Dragging outside viewport
   - Minimum/maximum sizes
   - Multiple panels in same dock zone
   - Rapid state changes

## Test Coverage Checklist

- [ ] **Drag & Drop**
  - [ ] Float to dock
  - [ ] Dock to float
  - [ ] Between dock zones
  - [ ] Tab creation via drag
  
- [ ] **Resize Operations**
  - [ ] Horizontal resize
  - [ ] Vertical resize
  - [ ] Respect min/max constraints
  - [ ] Resize multiple docked panels
  
- [ ] **Window States**
  - [ ] Minimize/restore
  - [ ] Maximize/restore
  - [ ] Close panel
  - [ ] Reopen closed panel
  
- [ ] **Persistence**
  - [ ] Save on change
  - [ ] Restore on load
  - [ ] Handle corrupt state
  - [ ] Migration from old format
  
- [ ] **Responsive Behavior**
  - [ ] Auto-dock on small screens
  - [ ] Adjust widths on resize
  - [ ] Hide panels on mobile
  
- [ ] **Keyboard Navigation**
  - [ ] Tab between panels
  - [ ] Escape to close
  - [ ] Shortcuts for common operations

## Benefits of This Approach

1. **Fast Tests**: No PDF loading, no GraphQL, just DOM manipulation
2. **Focused Tests**: Each test has one clear purpose
3. **Easy Debugging**: Visual feedback makes failures obvious
4. **Safe Migration**: Can A/B test old vs new UI
5. **Incremental Rollout**: Migrate one panel at a time

This strategy lets us build confidence in the layout system before tackling the complexity of context-aware content filtering. 