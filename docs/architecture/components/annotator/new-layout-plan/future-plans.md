## Concrete Implementation Plan: Context-Aware Document Interface

### Core Concept: The Context Feed

**What it is**: A unified, semi-transparent panel that dynamically displays all document elements (annotations, relationships, notes, search results) based on your current viewport location. Think of it as an intelligent companion that follows your reading, surfacing relevant information without you having to switch between tabs.

**How it works**:
- As you scroll through the document, the feed automatically updates to show content related to what's visible
- Items are ranked by relevance: exact page matches first, then nearby pages, then related content
- Each item type has a distinct visual indicator (color accent, icon) but lives in the same unified stream
- The feed maintains a subtle connection to its source via animated lines or highlights when hovering

**Visual Design**:
- Semi-transparent background (85% opacity) with backdrop blur
- Smooth gradient fade at top/bottom indicating more content
- Items appear as cards with consistent spacing
- Gentle animation as items enter/leave based on scroll position
- Proximity indicator showing how "far" content is from current view

### GUI Building Blocks

#### 1. **DockableContainer**
A wrapper component that provides any content with:
- **Floating mode**: Free positioning with drag handle
- **Docked mode**: Snaps to predefined zones (bars - i.e., on top, bottom, left, right - or split screen - i.e. right or left with document)
- **Minimized mode**: Collapses to a tab or icon
- **Maximized mode**: Expands to fill available space

Visual indicators:
- Subtle drop shadow when floating
- Magnetic edge highlighting when near dock zones
- Resize handles on corners and edges
- Title bar with standard window controls (minimize, maximize, close)

#### 2. **DockZone**
Designated areas where DockableContainers can attach:
- **Appearance**: Faint dotted outline that appears on hover near edges
- **Behavior**: Magnetic snapping within 50px of zone
- **Multi-tenant**: Can host multiple panels as tabs or accordion
- **Smart sizing**: Automatically adjusts to accommodate docked content

#### 3. **ToolPalette**
A floating action button that expands to reveal tools:
- **Collapsed state**: Single circular button with grid icon
- **Expanded state**: Radial or grid menu of tool icons
- **Smart positioning**: Avoids obscuring document content
- **Quick access**: Most-used tools bubble to the top

### Component Mapping

#### Current → New Architecture

**1. Sidebar Tabs (Annotations, Relations, Search, etc.) → Context Feed**
- All these separate lists merge into one intelligent feed
- Filter buttons at feed top allow focusing on specific types
- Each item retains its original functionality (click to select, edit, etc.)

**2. Right Panel (Chat, Notes) → Independent DockableContainers**
- Chat becomes its own dockable panel with full conversation history
- Notes get a dedicated dockable panel with the sticky note interface
- Both can be arranged independently or tabbed together

**3. MD Summary → Document Preview Panel**
- Becomes a DockableContainer that can be:
  - Floating picture-in-picture for reference while annotating
  - Docked as split-screen for side-by-side comparison
  - Minimized to a tab when not needed

**4. Label Selector → Modular Tool Widget**
- Transforms from fixed bottom bar to dockable widget
- Can be placed in any dock zone or float near work area
- Remembers last position per user preference

**5. Document Header → Info Card Widget**
- Metadata (title, type, creator) in a compact floating card
- Can be docked to top zone or minimized
- Expands on hover to show full details

### Interaction Flows

#### Reading Flow
1. User opens document - sees clean canvas with document
2. Tool palette appears in bottom-right corner
3. Context Feed slides in from right (default position) showing relevant content
4. As user scrolls, Context Feed smoothly updates its contents
5. Hovering over feed items highlights their location in document

#### Annotation Flow
1. User clicks tool palette → selects label tool
2. Label selector appears as floating widget near cursor
3. User selects label, then highlights text
4. New annotation immediately appears in Context Feed
5. Feed smoothly scrolls to show new item with subtle pulse animation

#### Research Flow
1. User wants summary visible while reading
2. Drags MD preview panel from minimized state
3. Resizes it to comfortable reading size
4. Docks it to left side for split-screen view
5. Context Feed adapts to narrower space

### Visual Hierarchy & Styling

**Layer Stack** (back to front):
1. Document canvas (base layer)
2. Docked panels (integrated with layout)
3. Floating panels (with shadows)
4. Tool palette (always accessible)
5. Tooltips and context menus (topmost)

**Consistent Visual Language**:
- Border radius: 8px for panels, 4px for cards
- Shadows: Subtle for docked (4px), pronounced for floating (16px)
- Colors: Document content full opacity, UI elements 85-95% opacity
- Animations: 200ms for entering/leaving, 100ms for hover states
- Spacing: 8px grid system throughout

### Context Feed Intelligence

**Relevance Scoring**:
1. **Page match** (score: 100): Items on current page
2. **Proximity** (score: 80-50): Items within 2 pages
3. **Relationship** (score: 60): Items connected to visible content
4. **Recency** (score: 40): Recently viewed/edited items
5. **Search match** (score: 30): Items matching active search

**Smart Grouping**:
- Consecutive annotations on same paragraph group together
- Related items (via relationships) cluster with connecting lines
- Search results show snippet context
- Notes without page refs appear in "Document-wide" section

### Key User Benefits

1. **Unified Experience**: No more hunting through tabs - everything in one smart feed
2. **Spatial Awareness**: Always know where content relates to your current position
3. **Flexible Workspace**: Arrange tools exactly how you prefer
4. **Reduced Cognitive Load**: Interface adapts to your task, not vice versa
5. **Improved Discovery**: Serendipitously find related content while reading

This design maintains all current functionality while dramatically improving the user experience through intelligent content presentation and flexible layout options.

## Expanded Implementation Strategy

### Technical Architecture

#### 1. State Management Architecture

**Docking State Management**:
```typescript
// New Jotai atoms for layout management
export const layoutConfigAtom = atom<LayoutConfig>({
  panels: {
    contextFeed: { 
      position: 'right', 
      width: 320, 
      visible: true,
      mode: 'docked' // 'docked' | 'floating' | 'minimized'
    },
    chat: { 
      position: 'float', 
      x: 100, 
      y: 100, 
      width: 400, 
      height: 600,
      visible: true,
      mode: 'floating'
    },
    // ... other panels
  },
  activePanel: 'contextFeed',
  lockedPanels: [], // Panels that can't be moved
});

// Viewport tracking for Context Feed
export const viewportAtom = atom<ViewportState>({
  scrollTop: 0,
  visiblePageRange: [0, 0],
  documentHeight: 0,
  viewportHeight: 0,
});

// Derived atom for context-aware content
export const contextualContentAtom = atom((get) => {
  const viewport = get(viewportAtom);
  const allAnnotations = get(allAnnotationsAtom);
  const relationships = get(relationshipsAtom);
  const searchResults = get(searchResultsAtom);
  
  return computeRelevantContent({
    viewport,
    annotations: allAnnotations,
    relationships,
    searchResults,
  });
});
```

#### 2. Docking System Implementation

**Core Components**:

```typescript
// DockableContainer.tsx
interface DockableContainerProps {
  id: string;
  title: string;
  defaultPosition?: DockPosition;
  minWidth?: number;
  minHeight?: number;
  children: React.ReactNode;
  onDock?: (position: DockPosition) => void;
  onFloat?: (coords: { x: number; y: number }) => void;
}

// DockZone.tsx
interface DockZoneProps {
  position: 'top' | 'right' | 'bottom' | 'left';
  accepts: string[]; // Panel IDs that can dock here
  maxPanels?: number;
  splitMode?: 'tabs' | 'accordion' | 'split';
}

// LayoutManager.tsx
interface LayoutManagerProps {
  children: React.ReactNode;
  onLayoutChange?: (config: LayoutConfig) => void;
  persistKey?: string; // For localStorage persistence
}
```

**Drag and Drop System**:
- Use `react-dnd` for drag operations
- Custom hook `useDockable` for panel behavior
- Magnetic snapping within 50px of dock zones
- Visual feedback during drag (ghost preview, drop zones)

#### 3. Context Feed Implementation Details

**Viewport Tracking System**:
```typescript
// useViewportTracker.ts
const useViewportTracker = () => {
  const setViewport = useSetAtom(viewportAtom);
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const updateViewport = throttle(() => {
      if (!containerRef.current) return;
      
      const { scrollTop, clientHeight } = containerRef.current;
      const visiblePages = calculateVisiblePages(scrollTop, clientHeight);
      
      setViewport({
        scrollTop,
        visiblePageRange: visiblePages,
        documentHeight: containerRef.current.scrollHeight,
        viewportHeight: clientHeight,
      });
    }, 100);
    
    // Intersection Observer for precise page tracking
    const observer = new IntersectionObserver(
      (entries) => {
        // Update visible pages based on intersection
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    
    // ... setup and cleanup
  }, []);
  
  return { containerRef };
};
```

**Relevance Scoring Algorithm**:
```typescript
interface RelevanceScore {
  item: ContextItem;
  score: number;
  reason: string;
  distance?: number; // Pages away from viewport
}

const calculateRelevance = (
  item: ContextItem,
  viewport: ViewportState
): RelevanceScore => {
  let score = 0;
  let reason = '';
  
  // Page-based scoring
  if (item.pageNumber >= viewport.visiblePageRange[0] && 
      item.pageNumber <= viewport.visiblePageRange[1]) {
    score = 100;
    reason = 'On current page';
  } else {
    const distance = Math.min(
      Math.abs(item.pageNumber - viewport.visiblePageRange[0]),
      Math.abs(item.pageNumber - viewport.visiblePageRange[1])
    );
    
    if (distance <= 2) {
      score = 80 - (distance * 15);
      reason = `${distance} page${distance > 1 ? 's' : ''} away`;
    }
  }
  
  // Boost for relationships
  if (item.hasRelationships) {
    score += 20;
    reason += ' (has relationships)';
  }
  
  // Recency boost
  const minutesSinceInteraction = getMinutesSince(item.lastInteraction);
  if (minutesSinceInteraction < 5) {
    score += 15;
    reason += ' (recently viewed)';
  }
  
  return { item, score, reason, distance };
};
```

### 4. Migration Strategy

#### Phase 1: Foundation
1. **Create base docking system**
   - Implement `DockableContainer` component
   - Build `LayoutManager` with basic persistence
   - Create `DockZone` components for each edge
   
2. **Set up state management**
   - Add layout-related Jotai atoms
   - Implement viewport tracking
   - Create persistence layer for layout preferences

#### Phase 2: Context Feed
1. **Build Context Feed component**
   - Implement relevance scoring algorithm
   - Create unified item renderers for each content type
   - Add smooth scroll-based updates
   
2. **Integrate with existing atoms**
   - Connect to `allAnnotationsAtom`
   - Subscribe to search results
   - Handle relationship data

#### Phase 3: Component Migration
1. **Migrate existing panels**
   - Wrap Chat in `DockableContainer`
   - Convert MD Summary to dockable panel
   - Transform label selector to floating widget
   
2. **Maintain backward compatibility**
   - Add feature flag for new UI
   - Provide migration tool for user preferences
   - Keep old UI accessible during transition

#### Phase 4: Polish & Optimization
1. **Performance optimization**
   - Implement virtual scrolling for Context Feed
   - Add request animation frame for smooth updates
   - Optimize relevance calculations with memoization
   
2. **Accessibility & UX**
   - Add keyboard navigation
   - Implement focus management
   - Create onboarding tour

### 5. Performance Considerations

**Context Feed Optimization**:
```typescript
// Virtualized Context Feed
const VirtualizedContextFeed = () => {
  const items = useAtomValue(contextualContentAtom);
  
  // Use react-window for virtualization
  return (
    <FixedSizeList
      height={feedHeight}
      itemCount={items.length}
      itemSize={80} // Estimated item height
      overscanCount={5}
    >
      {({ index, style }) => (
        <ContextFeedItem
          item={items[index]}
          style={style}
        />
      )}
    </FixedSizeList>
  );
};

// Debounced relevance calculation
const debouncedRelevanceUpdate = useMemo(
  () => debounce((viewport: ViewportState) => {
    // Expensive relevance calculations
  }, 200),
  []
);
```

### 6. Edge Cases & Error Handling

**Screen Size Adaptation**:
```typescript
const useResponsiveLayout = () => {
  const [screenSize, setScreenSize] = useState(getScreenSize());
  
  useEffect(() => {
    const handleResize = () => {
      const newSize = getScreenSize();
      
      // Auto-dock floating panels on small screens
      if (newSize.width < 768 && screenSize.width >= 768) {
        autoDockFloatingPanels();
      }
      
      // Adjust Context Feed width
      if (newSize.width < 1200) {
        setContextFeedWidth(280); // Narrower on smaller screens
      }
    };
  }, []);
};
```

**Multi-Monitor Support**:
- Detect when panels are dragged to different monitors
- Save monitor-specific layouts
- Handle monitor disconnection gracefully

### 7. Testing Strategy

**Unit Tests**:
- Relevance scoring algorithm
- Viewport tracking calculations
- Layout persistence

**Integration Tests**:
- Drag and drop operations
- Panel state synchronization
- Context Feed updates

**E2E Tests**:
- Full user workflows
- Layout restoration
- Performance benchmarks

### 8. Accessibility Implementation

**Keyboard Navigation**:
```typescript
const keyboardShortcuts = {
  'Ctrl+Shift+F': 'Toggle Context Feed',
  'Ctrl+Shift+D': 'Dock/undock active panel',
  'Tab': 'Navigate between panels',
  'Ctrl+1-9': 'Quick switch to panel N',
};

// ARIA announcements for screen readers
const announceLayoutChange = (change: LayoutChange) => {
  const announcement = `${change.panel} ${change.action} ${change.position}`;
  ariaAnnounce(announcement);
};
```

### 9. Configuration & Customization

**User Preferences**:
```typescript
interface UserLayoutPreferences {
  defaultLayout: 'comfortable' | 'compact' | 'focused';
  contextFeedBehavior: 'auto-hide' | 'always-visible' | 'manual';
  animationSpeed: 'instant' | 'fast' | 'smooth';
  colorScheme: 'light' | 'dark' | 'auto';
  panelOpacity: number; // 0.7 - 1.0
}
```

This expanded strategy provides a clear roadmap from current implementation to the envisioned flexible, context-aware interface while maintaining performance and user experience.