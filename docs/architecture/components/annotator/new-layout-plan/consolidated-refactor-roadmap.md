# Consolidated DocumentKnowledgeBase Refactor Roadmap

## Executive Summary

This document consolidates the complete refactoring plan for transforming DocumentKnowledgeBase from a tab-based interface to a flexible, context-aware layout system. The refactor will be executed in four phases, with each phase independently testable and deployable.

## Goals & Success Metrics

### Primary Goals
1. **Reduce Navigation Friction**: Eliminate constant tab switching
2. **Improve Context Awareness**: Show relevant information based on viewport
3. **Enhance Flexibility**: Allow users to customize their workspace
4. **Maintain Performance**: Keep virtualized rendering benefits
5. **Preserve All Features**: No functionality regression

### Success Metrics
- 50% reduction in clicks to access related information
- <200ms response time for layout changes (measured at p95)
- <16ms frame time during drag operations (60fps)
- 100% feature parity with current system
- No increase in memory footprint beyond 10%
- 90%+ test coverage for new components
- <3s initial load time for documents under 100 pages
- Zero data loss during layout transitions

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      LayoutContainer                         │
│  ┌─────────────────┐  ┌─────────────┐  ┌────────────────┐ │
│  │ Document Viewer │  │Context Feed │  │  Chat Panel    │ │
│  │  (Virtualized)  │  │  (Unified)  │  │  (Dockable)    │ │
│  └─────────────────┘  └─────────────┘  └────────────────┘ │
│                                                             │
│  State Management (Jotai)    DND-Kit Engine    Event Bus   │
└─────────────────────────────────────────────────────────────┘
```

### Technology Choice: DND-Kit

We're using **@dnd-kit** instead of react-dnd for the following reasons:

1. **Performance**: DND-Kit uses CSS transforms and pointer events, avoiding React re-renders during drag operations
2. **Accessibility**: Built-in keyboard and screen reader support with customizable announcements
3. **Touch Support**: Excellent mobile/tablet support with configurable touch sensors
4. **Modern Architecture**: Hook-based API that integrates naturally with React 18+
5. **Bundle Size**: Smaller footprint (~35KB vs ~45KB for react-dnd)
6. **TypeScript**: First-class TypeScript support with excellent type inference

## Phase 1: Layout Foundation (2 weeks)

### Objectives
- Build core layout components with placeholder content
- Establish component testing infrastructure
- Validate layout flexibility without complex integrations

### Deliverables

#### 1.1 LayoutContainer Component
```typescript
interface LayoutContainerProps {
  children: React.ReactNode;
  onLayoutChange?: (layout: LayoutState) => void;
  initialLayout?: LayoutPreset;
  enablePersistence?: boolean;
}
```

**Features:**
- Grid-based layout system
- Drag-to-reorder panels
- Resize boundaries
- Layout persistence to localStorage
- Responsive breakpoints

#### 1.2 DockablePanel Component
```typescript
interface DockablePanelProps {
  id: string;
  title: string;
  defaultPosition: DockPosition;
  defaultSize?: PanelSize;
  collapsible?: boolean;
  removable?: boolean;
  onDock?: (position: DockPosition) => void;
  onFloat?: (coordinates: Coordinates) => void;
}
```

**Features:**
- Dock to any edge
- Float with drag handle
- Minimize/maximize states
- Resize in all directions
- Z-index management

#### 1.3 ContextCard Component
```typescript
interface ContextCardProps {
  type: 'annotation' | 'relationship' | 'note' | 'search';
  data: ContextData;
  onInteraction?: (action: CardAction) => void;
  priority?: number;
}
```

**Features:**
- Consistent card design
- Type-specific rendering
- Interaction handlers
- Priority-based ordering

### Testing Strategy
- Playwright component tests with mock data
- Visual regression tests for layout states
- Performance benchmarks for drag/resize
- Accessibility audits

## Phase 2: Component Migration (3 weeks)

### Objectives
- Migrate existing panels to new layout system
- Maintain backward compatibility
- Incremental rollout with feature flags

### Migration Order (by complexity)

#### 2.1 Chat Panel Migration (Week 1)
**Current State:**
- Fixed right sidebar
- Manual width control
- Auto-minimize feature

**Migration Steps:**
1. Wrap existing ChatTray in DockablePanel
2. Map width modes to panel sizes
3. Preserve auto-minimize behavior
4. Add float capability
5. Test all chat features

**Challenges:**
- WebSocket reconnection on panel moves
- Message history scroll position
- Source highlighting coordination

#### 2.2 Search Panel Migration (Week 1)
**Current State:**
- Tab in right sidebar
- Simple component structure

**Migration Steps:**
1. Extract SearchSidebarWidget to standalone
2. Wrap in DockablePanel
3. Add results preview in collapsed state
4. Enable keyboard navigation

#### 2.3 Notes Panel Migration (Week 2)
**Current State:**
- Grid layout with sticky notes
- Modal-based editing

**Migration Steps:**
1. Convert NotesGrid to responsive
2. Implement inline editing
3. Add note filtering/search
4. Create note preview cards

#### 2.4 Annotations & Relationships (Week 2-3)
**Current State:**
- Separate list components
- Complex selection logic

**Migration Steps:**
1. Create unified list container
2. Implement virtualized scrolling
3. Add type filtering
4. Preserve selection synchronization

### State Management Updates
```typescript
// New atoms for layout state
export const layoutStateAtom = atom<LayoutState>({
  panels: {},
  activePanel: null,
  layout: 'default'
});

export const panelVisibilityAtom = atom<Record<string, boolean>>({});
export const panelPositionsAtom = atom<Record<string, DockPosition>>({});
```

## Phase 3: Context Feed Implementation (4 weeks)

### Objectives
- Unify disparate content into single feed
- Implement viewport-aware content loading
- Create intelligent content ranking

### 3.1 Feed Architecture

```typescript
interface ContextFeed {
  items: ContextItem[];
  viewport: ViewportInfo;
  filters: FilterState;
  sort: SortStrategy;
}

interface ContextItem {
  id: string;
  type: ContextType;
  source: SourceInfo;
  relevance: number;
  timestamp: Date;
  content: any;
  actions: ContextAction[];
}
```

### 3.2 Content Aggregation

**Data Sources:**
- PDF annotations (from pdfAnnotationsAtom)
- Structural annotations (from structuralAnnotationsAtom)  
- Search results (from searchResultsAtom)
- Document notes (from GraphQL)
- Active selections (from selectedAnnotationAtom)
- Analysis results (from analysisManager)

**Aggregation Pipeline:**
```typescript
function aggregateContextItems(viewport: ViewportInfo): ContextItem[] {
  return [
    ...getViewportAnnotations(viewport),
    ...getRelatedRelationships(viewport),
    ...getRelevantNotes(viewport),
    ...getActiveSearchResults(viewport),
    ...getAnalysisResults(viewport)
  ]
  .map(calculateRelevance)
  .sort(byRelevanceAndType)
  .slice(0, MAX_ITEMS);
}
```

### 3.3 Viewport Awareness

**Implementation:**
```typescript
interface ViewportContext {
  currentPage: number;
  visiblePages: number[];
  scrollPosition: number;
  zoomLevel: number;
  selectedText?: TextSelection;
  hoveredElements?: Element[];
}

// Hook for viewport tracking
function useViewportContext(): ViewportContext {
  const { currentPage, visiblePages } = usePageVisibility();
  const scrollPosition = useScrollPosition();
  const { zoomLevel } = useZoom();
  const selection = useTextSelection();
  
  return {
    currentPage,
    visiblePages,
    scrollPosition,
    zoomLevel,
    selectedText: selection,
    hoveredElements: useHoveredElements()
  };
}
```

### 3.4 Relevance Scoring

**Factors:**
- **Spatial proximity**: Distance from viewport center
- **Type matching**: Annotation type vs user activity
- **Recency**: Recently created/modified items
- **User interaction**: Previously clicked/edited items
- **Semantic similarity**: For search results
- **Relationship distance**: Hops from selected item

### 3.5 Feed UI Components

```typescript
<ContextFeed>
  <FeedHeader>
    <FilterBar />
    <SortSelector />
    <ViewToggle /> {/* List/Grid/Compact */}
  </FeedHeader>
  
  <VirtualizedList>
    {items.map(item => (
      <ContextCard key={item.id} {...item} />
    ))}
  </VirtualizedList>
  
  <FeedFooter>
    <LoadMoreButton />
    <ItemCount />
  </FeedFooter>
</ContextFeed>
```

## Phase 4: Polish & Optimization (2 weeks)

### 4.1 Performance Optimization

**Targets:**
- Feed updates < 16ms (60fps)
- Layout changes < 100ms
- Memory usage stable under 200MB
- No scroll jank with 1000+ items

**Strategies:**
- Aggressive memoization
- Virtual scrolling for feed
- RequestIdleCallback for non-critical updates
- WebWorker for relevance calculations
- IndexedDB for layout persistence

### 4.2 Accessibility Enhancements

**Requirements:**
- Full keyboard navigation
- Screen reader announcements
- Focus management
- High contrast mode
- Reduced motion support

**Implementation:**
```typescript
// Keyboard navigation map
const keyboardShortcuts = {
  'Ctrl+Shift+F': 'Toggle feed',
  'Ctrl+Shift+C': 'Toggle chat',
  'Ctrl+1-9': 'Switch layout presets',
  'Alt+Arrow': 'Move focused panel',
  'Escape': 'Close floating panel'
};

// ARIA live regions for updates
<div role="status" aria-live="polite" aria-atomic="true">
  {feedUpdateCount} new items in context feed
</div>
```

### 4.3 User Testing Plan

**Test Scenarios:**
1. New user onboarding flow
2. Power user with 10+ documents
3. Mobile/tablet experience
4. Accessibility audit with screen readers
5. Performance under stress (large PDFs)

**Metrics to Track:**
- Time to first meaningful interaction
- Number of layout adjustments per session
- Feature discovery rate
- Error frequency
- User satisfaction scores

## Implementation Timeline

```
Week 1-2:   Layout Foundation
Week 3-5:   Component Migration  
Week 6-9:   Context Feed
Week 10-11: Polish & Optimization
Week 12:    Launch Preparation
```

## Critical Implementation Details

### State Management Migration

#### Atom Structure Updates
```typescript
// New atoms to be created
export const layoutStateAtom = atom<LayoutState>({
  panels: {},
  activePanel: null,
  layout: 'default',
  version: '1.0.0'
});

export const viewportAtom = atom<ViewportState>({
  scrollTop: 0,
  visiblePageRange: [0, 0],
  documentHeight: 0,
  viewportHeight: 0,
  currentPage: 0
});

export const contextualContentAtom = atom<ContextItem[]>([]);

// Atoms to be updated for compatibility
export const pdfAnnotationsAtom = atom<PdfAnnotations>((get) => {
  const base = get(basePdfAnnotationsAtom);
  const viewport = get(viewportAtom);
  // Add viewport-aware filtering
  return filterByViewport(base, viewport);
});
```

#### Migration Strategy for Existing Atoms
1. Create compatibility layer that maps old atom structure to new
2. Implement backward-compatible getters/setters
3. Add deprecation warnings for direct atom access
4. Provide migration utilities for persisted state

### Error Handling Architecture

#### Component-Level Error Boundaries
```typescript
class LayoutErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error, errorInfo) {
    // Log to monitoring service
    console.error('Layout error:', error, errorInfo);
    
    // Attempt recovery
    if (error.message.includes('drag')) {
      this.resetDragState();
    } else if (error.message.includes('layout')) {
      this.resetToDefaultLayout();
    }
  }
  
  render() {
    if (this.state.hasError) {
      return <LayoutFallback onReset={() => this.resetLayout()} />;
    }
    return this.props.children;
  }
}
```

#### Network Error Handling
```typescript
const useContextDataWithRetry = () => {
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;
  
  const fetchData = async () => {
    try {
      const data = await fetchContextualData();
      return data;
    } catch (error) {
      if (retryCount < maxRetries) {
        setRetryCount(prev => prev + 1);
        // Exponential backoff
        await delay(Math.pow(2, retryCount) * 1000);
        return fetchData();
      }
      throw error;
    }
  };
  
  return { fetchData, retryCount };
};
```

### Performance Optimization Details

#### Memory Management
```typescript
// Cleanup strategy for unmounted panels
const usePanelCleanup = (panelId: string) => {
  useEffect(() => {
    return () => {
      // Clear panel-specific cache
      clearPanelCache(panelId);
      
      // Cancel pending requests
      cancelPanelRequests(panelId);
      
      // Remove event listeners
      removePanelListeners(panelId);
      
      // Clear from global state
      cleanupPanelState(panelId);
    };
  }, [panelId]);
};

// Garbage collection triggers
const useMemoryPressure = () => {
  useEffect(() => {
    const checkMemory = () => {
      if (performance.memory) {
        const used = performance.memory.usedJSHeapSize;
        const total = performance.memory.totalJSHeapSize;
        const ratio = used / total;
        
        if (ratio > 0.9) {
          // Trigger cleanup
          triggerGarbageCollection();
        }
      }
    };
    
    const interval = setInterval(checkMemory, 30000);
    return () => clearInterval(interval);
  }, []);
};
```

#### Rendering Optimization
```typescript
// Memoization strategy
const ContextFeedItem = React.memo(({ item }) => {
  // Component implementation
}, (prevProps, nextProps) => {
  // Custom comparison - only re-render if these change
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.score === nextProps.item.score &&
    prevProps.item.selected === nextProps.item.selected
  );
});

// Virtual scrolling configuration
const VIRTUAL_CONFIG = {
  itemSize: 80,
  overscanCount: 5,
  initialScrollOffset: 0,
  estimatedItemSize: 80,
  // Use dynamic sizing for variable height items
  getItemSize: (index: number) => itemHeights[index] || 80
};
```

### WebSocket Reconnection Logic

```typescript
const useChatWebSocket = () => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  
  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      reconnectAttemptsRef.current = 0;
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      
      // Exponential backoff reconnection
      const attempts = reconnectAttemptsRef.current;
      if (attempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current += 1;
          connect();
        }, delay);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    setSocket(ws);
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      socket?.close();
    };
  }, [socket]);
  
  return { socket, connect };
};
```

### Rollback Implementation

```typescript
// Feature flag system with granular control
const FEATURE_FLAGS = {
  NEW_LAYOUT_SYSTEM: {
    enabled: false,
    percentage: 0,
    whitelist: [],
    blacklist: [],
    override: process.env.FORCE_NEW_LAYOUT === 'true'
  },
  UNIFIED_CONTEXT_FEED: {
    enabled: false,
    dependencies: ['NEW_LAYOUT_SYSTEM']
  }
};

// Rollback procedure
const rollbackLayout = async () => {
  try {
    // 1. Disable feature flags
    await updateFeatureFlags({
      NEW_LAYOUT_SYSTEM: { enabled: false }
    });
    
    // 2. Clear new layout data
    localStorage.removeItem('layout-state-v2');
    localStorage.removeItem('panel-positions');
    
    // 3. Restore legacy layout
    const legacyLayout = localStorage.getItem('layout-state-v1');
    if (legacyLayout) {
      restoreLegacyLayout(JSON.parse(legacyLayout));
    }
    
    // 4. Notify users
    toast.info('Reverting to classic layout. Please refresh the page.');
    
    // 5. Log rollback
    logRollbackEvent({
      timestamp: new Date(),
      reason: 'Manual rollback initiated',
      userId: getCurrentUserId()
    });
    
    // 6. Force reload
    setTimeout(() => window.location.reload(), 2000);
  } catch (error) {
    console.error('Rollback failed:', error);
    // Force fallback to basic layout
    window.location.href = '/documents?layout=basic';
  }
};
```

## Risk Mitigation

### Technical Risks
1. **Performance Regression**
   - Mitigation: Continuous benchmarking
   - Fallback: Feature flags for gradual rollout

2. **State Synchronization Issues**
   - Mitigation: Comprehensive E2E tests
   - Fallback: State reset mechanisms

3. **Browser Compatibility**
   - Mitigation: Progressive enhancement
   - Fallback: Simplified layout for older browsers

### User Experience Risks
1. **Learning Curve**
   - Mitigation: Interactive tutorial
   - Fallback: "Classic mode" toggle

2. **Feature Discovery**
   - Mitigation: Contextual hints
   - Fallback: Prominent help documentation

## Success Criteria

### Phase 1 Complete When:
- [ ] All layout components built
- [ ] 90% test coverage achieved
- [ ] Performance benchmarks pass
- [ ] Design review approved

### Phase 2 Complete When:
- [ ] All panels migrated
- [ ] No feature regressions
- [ ] State management stable
- [ ] Backward compatibility verified

### Phase 3 Complete When:
- [ ] Context feed aggregating all sources
- [ ] Viewport awareness working
- [ ] Relevance scoring accurate
- [ ] Performance targets met

### Phase 4 Complete When:
- [ ] Accessibility audit passed
- [ ] User testing completed
- [ ] Documentation updated
- [ ] Launch metrics defined

## Appendices

### A. Layout Presets
1. **Research Mode**: Document left, feed right, chat bottom
2. **Review Mode**: Document center, annotations overlay
3. **Collaboration**: Document left, chat right, feed bottom
4. **Focus Mode**: Document only, all panels minimized

### B. Migration Checklist
- [ ] Create feature flags
- [ ] Set up monitoring
- [ ] Update documentation
- [ ] Train support team
- [ ] Prepare rollback plan

### C. Component API Reference
[See api-reference.md for detailed component APIs]

### D. Testing Strategy Details
[See layout-testing-strategy.md for comprehensive test plans] 