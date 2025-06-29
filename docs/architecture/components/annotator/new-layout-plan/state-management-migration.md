# State Management Migration Guide

## Overview

This guide details how to migrate the existing Jotai state management to support the new flexible layout system while maintaining backward compatibility and ensuring smooth data flow.

## Current State Architecture

### Existing Atoms
```typescript
// Document state
export const documentAtom = atom<Document | null>(null);
export const pdfDocAtom = atom<PDFDocumentProxy | null>(null);
export const pagesAtom = atom<PDFPageInfo[]>([]);
export const docTextAtom = atom<string>('');

// Annotation state
export const pdfAnnotationsAtom = atom<PdfAnnotations>(new PdfAnnotations());
export const structuralAnnotationsAtom = atom<ServerAnnotation[]>([]);
export const selectedAnnotationIdAtom = atom<string | null>(null);

// UI state
export const viewStateAtom = atom<ViewState>(ViewState.LOADING);
export const zoomLevelAtom = atom<number>(1);
export const activeSpanLabelAtom = atom<AnnotationLabel | null>(null);

// Search state
export const searchTextAtom = atom<string>('');
export const textSearchStateAtom = atom<TextSearchState>({
  matches: [],
  selectedIndex: 0
});
```

## New State Architecture

### Layout State Atoms

```typescript
// Core layout state
export const layoutStateAtom = atom<LayoutState>({
  panels: {},
  activePanel: null,
  layout: 'default',
  version: '1.0.0'
});

// Individual panel states
export const panelStatesAtom = atom<Record<string, PanelState>>({});

// Panel visibility (quick toggle without removing from layout)
export const panelVisibilityAtom = atom<Record<string, boolean>>({});

// Floating panel positions
export const floatingPanelsAtom = atom<Record<string, FloatPosition>>({});

// Layout presets
export const layoutPresetsAtom = atom<Record<string, LayoutConfig>>({
  research: defaultResearchLayout,
  review: defaultReviewLayout,
  collaboration: defaultCollaborationLayout,
  focus: defaultFocusLayout
});

// User's custom layouts
export const customLayoutsAtom = atom<Record<string, LayoutConfig>>({});

// Layout history for undo/redo
export const layoutHistoryAtom = atom<LayoutState[]>([]);
export const layoutHistoryIndexAtom = atom<number>(0);
```

### Context Feed State Atoms

```typescript
// Feed configuration
export const feedConfigAtom = atom<FeedConfig>({
  sources: {
    annotations: true,
    relationships: true,
    notes: true,
    search: true,
    analyses: true,
    extracts: true
  },
  maxItems: 100,
  viewMode: 'list',
  relevanceFactors: {
    spatial: 0.4,
    temporal: 0.2,
    semantic: 0.2,
    interaction: 0.2
  }
});

// Feed items (raw data from all sources)
export const feedItemsAtom = atom<ContextItem[]>([]);

// Feed filters
export const feedFiltersAtom = atom<FilterState>({
  types: new Set(['annotation', 'relationship', 'note', 'search']),
  authors: [],
  dateRange: null,
  tags: [],
  searchQuery: '',
  pageRange: null
});

// Feed sorting
export const feedSortAtom = atom<SortStrategy>('relevance');

// Selected feed items
export const selectedFeedItemsAtom = atom<Set<string>>(new Set());

// Viewport context for relevance calculation
export const viewportContextAtom = atom<ViewportContext>({
  currentPage: 1,
  visiblePages: [1],
  scrollPosition: 0,
  viewportBounds: { top: 0, left: 0, width: 0, height: 0 },
  totalPages: 0,
  zoomLevel: 1,
  selectedText: null,
  hoveredElement: null,
  activeAnnotations: []
});
```

### Derived Atoms

```typescript
// Filtered and sorted feed items
export const visibleFeedItemsAtom = atom((get) => {
  const items = get(feedItemsAtom);
  const filters = get(feedFiltersAtom);
  const sort = get(feedSortAtom);
  const viewport = get(viewportContextAtom);
  const config = get(feedConfigAtom);
  
  // Apply filters
  let filtered = items.filter(item => {
    if (!filters.types.has(item.type)) return false;
    if (filters.authors.length && !filters.authors.includes(item.author?.id)) return false;
    if (filters.dateRange) {
      const date = new Date(item.timestamp);
      if (date < filters.dateRange.start || date > filters.dateRange.end) return false;
    }
    if (filters.tags.length && !filters.tags.some(tag => item.tags?.includes(tag))) return false;
    if (filters.searchQuery && !matchesSearch(item, filters.searchQuery)) return false;
    if (filters.pageRange && item.source.pageNumber) {
      if (item.source.pageNumber < filters.pageRange.start || 
          item.source.pageNumber > filters.pageRange.end) return false;
    }
    return true;
  });
  
  // Calculate relevance scores
  if (sort === 'relevance') {
    filtered = filtered.map(item => ({
      ...item,
      relevance: calculateRelevance(item, viewport, config.relevanceFactors)
    }));
  }
  
  // Sort
  filtered.sort((a, b) => {
    switch (sort) {
      case 'relevance':
        return b.relevance - a.relevance;
      case 'recent':
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      case 'oldest':
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      case 'type':
        return a.type.localeCompare(b.type);
      case 'author':
        return (a.author?.email || '').localeCompare(b.author?.email || '');
      case 'page':
        return (a.source.pageNumber || 0) - (b.source.pageNumber || 0);
      default:
        return 0;
    }
  });
  
  // Limit items
  return filtered.slice(0, config.maxItems);
});

// Active panel content
export const activePanelContentAtom = atom((get) => {
  const layoutState = get(layoutStateAtom);
  const activePanel = layoutState.activePanel;
  
  if (!activePanel) return null;
  
  switch (activePanel) {
    case 'feed':
      return get(visibleFeedItemsAtom);
    case 'chat':
      return get(chatMessagesAtom);
    case 'search':
      return get(searchResultsAtom);
    // ... other panels
    default:
      return null;
  }
});

// Layout validation
export const isValidLayoutAtom = atom((get) => {
  const layout = get(layoutStateAtom);
  const panels = layout.panels;
  
  // Check for overlapping docked panels
  const dockedPanels = Object.values(panels).filter(p => 
    ['left', 'right', 'top', 'bottom'].includes(p.position as string)
  );
  
  // Ensure no duplicate positions
  const positions = dockedPanels.map(p => p.position);
  return positions.length === new Set(positions).size;
});
```

## Migration Strategy

### Phase 1: Add New Atoms Without Breaking Changes

```typescript
// 1. Create new atoms in parallel with existing ones
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// Use atomWithStorage for persistence
export const layoutStateAtom = atomWithStorage<LayoutState>(
  'documentKnowledgeBase:layout',
  defaultLayoutState,
  {
    getItem: (key) => {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    },
    setItem: (key, value) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    removeItem: (key) => {
      localStorage.removeItem(key);
    }
  }
);

// 2. Create migration utilities
export const migrateToNewLayout = () => {
  // Check if old layout exists
  const oldLayout = localStorage.getItem('documentKnowledgeBase:oldLayout');
  if (oldLayout) {
    // Convert to new format
    const newLayout = convertOldToNewLayout(JSON.parse(oldLayout));
    localStorage.setItem('documentKnowledgeBase:layout', JSON.stringify(newLayout));
    localStorage.removeItem('documentKnowledgeBase:oldLayout');
  }
};

// 3. Create compatibility layer
export const useCompatibleLayout = () => {
  const [newLayout, setNewLayout] = useAtom(layoutStateAtom);
  const [oldSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const [oldActiveTab] = useAtom(activeTabAtom);
  
  // Sync old state to new state
  useEffect(() => {
    if (oldActiveTab && !newLayout.activePanel) {
      setNewLayout(prev => ({
        ...prev,
        activePanel: mapOldTabToNewPanel(oldActiveTab)
      }));
    }
  }, [oldActiveTab]);
  
  return newLayout;
};
```

### Phase 2: Update Components to Use New Atoms

```typescript
// Before: Component using old atoms
const OldComponent = () => {
  const [activeTab, setActiveTab] = useAtom(activeTabAtom);
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  
  return (
    <div>
      {activeTab === 'annotations' && <AnnotationList />}
    </div>
  );
};

// After: Component using new atoms with compatibility
const NewComponent = () => {
  const { activePanel, showPanel, hidePanel } = useLayout();
  const [legacyMode] = useAtom(legacyModeAtom);
  
  // Support both old and new patterns during migration
  if (legacyMode) {
    return <OldComponent />;
  }
  
  return (
    <LayoutContainer>
      <DockablePanel 
        id="annotations" 
        visible={activePanel === 'annotations'}
      >
        <AnnotationList />
      </DockablePanel>
    </LayoutContainer>
  );
};
```

### Phase 3: Data Aggregation for Context Feed

```typescript
// Create aggregator hook
export const useContextAggregator = () => {
  const [annotations] = useAtom(pdfAnnotationsAtom);
  const [searchResults] = useAtom(searchResultsAtom);
  const [notes] = useAtom(documentNotesAtom);
  const [relationships] = useAtom(relationshipsAtom);
  const [viewport] = useAtom(viewportContextAtom);
  const setFeedItems = useSetAtom(feedItemsAtom);
  
  // Aggregate data whenever sources change
  useEffect(() => {
    const aggregated: ContextItem[] = [];
    
    // Convert annotations to feed items
    annotations.annotations.forEach(ann => {
      aggregated.push({
        id: ann.id,
        type: 'annotation',
        source: {
          documentId: ann.documentId,
          pageNumber: ann.page,
          bounds: ann.bounds
        },
        content: {
          text: ann.text,
          metadata: {
            label: ann.annotation_label,
            color: ann.color
          }
        },
        relevance: 0, // Calculated later
        timestamp: new Date(ann.created),
        author: ann.creator,
        actions: getAnnotationActions(ann),
        tags: ann.tags || []
      });
    });
    
    // Convert search results
    searchResults.forEach(result => {
      aggregated.push({
        id: `search-${result.index}`,
        type: 'search',
        source: {
          documentId: result.documentId,
          pageNumber: result.page,
          bounds: result.bounds
        },
        content: {
          title: 'Search Result',
          text: result.snippet,
          metadata: {
            query: result.query,
            score: result.score
          }
        },
        relevance: 0,
        timestamp: new Date(),
        actions: getSearchActions(result),
        tags: []
      });
    });
    
    // Similar conversions for notes, relationships, etc.
    
    setFeedItems(aggregated);
  }, [annotations, searchResults, notes, relationships]);
};
```

### Phase 4: Implement State Persistence

```typescript
// Persistence layer
export const persistenceMiddleware = (config: PersistenceConfig) => {
  return (set: any, get: any, api: any) => {
    // Subscribe to state changes
    api.subscribe((state: any) => {
      if (config.enabled) {
        const toPersist = config.select ? config.select(state) : state;
        config.storage.setItem(config.key, toPersist);
      }
    });
    
    // Load initial state
    const stored = config.storage.getItem(config.key);
    if (stored) {
      set(config.deserialize ? config.deserialize(stored) : stored);
    }
    
    return set;
  };
};

// Apply to layout atoms
export const layoutStateAtom = atom(
  defaultLayoutState,
  persistenceMiddleware({
    enabled: true,
    key: 'layout:state',
    storage: localStorage,
    select: (state) => ({
      panels: state.panels,
      layout: state.layout
    })
  })
);
```

## Hooks for State Management

### useLayout Hook

```typescript
export const useLayout = () => {
  const [layoutState, setLayoutState] = useAtom(layoutStateAtom);
  const [panelStates, setPanelStates] = useAtom(panelStatesAtom);
  const [visibility, setVisibility] = useAtom(panelVisibilityAtom);
  const [history, setHistory] = useAtom(layoutHistoryAtom);
  const [historyIndex, setHistoryIndex] = useAtom(layoutHistoryIndexAtom);
  
  const showPanel = useCallback((panelId: string) => {
    setVisibility(prev => ({ ...prev, [panelId]: true }));
    setLayoutState(prev => ({ ...prev, activePanel: panelId }));
  }, []);
  
  const hidePanel = useCallback((panelId: string) => {
    setVisibility(prev => ({ ...prev, [panelId]: false }));
    if (layoutState.activePanel === panelId) {
      setLayoutState(prev => ({ ...prev, activePanel: null }));
    }
  }, [layoutState.activePanel]);
  
  const dockPanel = useCallback((panelId: string, position: DockPosition) => {
    setPanelStates(prev => ({
      ...prev,
      [panelId]: {
        ...prev[panelId],
        position,
        minimized: false
      }
    }));
    addToHistory();
  }, []);
  
  const floatPanel = useCallback((panelId: string, position?: FloatPosition) => {
    const defaultPosition = position || {
      x: window.innerWidth / 2 - 200,
      y: window.innerHeight / 2 - 150,
      width: 400,
      height: 300
    };
    
    setPanelStates(prev => ({
      ...prev,
      [panelId]: {
        ...prev[panelId],
        position: defaultPosition,
        minimized: false
      }
    }));
    addToHistory();
  }, []);
  
  const addToHistory = useCallback(() => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(layoutState);
      return newHistory.slice(-50); // Keep last 50 states
    });
    setHistoryIndex(prev => prev + 1);
  }, [layoutState, historyIndex]);
  
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setLayoutState(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);
  
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setLayoutState(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);
  
  return {
    layout: layoutState,
    activePanel: layoutState.activePanel,
    showPanel,
    hidePanel,
    togglePanel: (id: string) => visibility[id] ? hidePanel(id) : showPanel(id),
    focusPanel: (id: string) => setLayoutState(prev => ({ ...prev, activePanel: id })),
    setLayout: (preset: LayoutPreset) => {
      const config = layoutPresetsAtom[preset];
      if (config) applyLayoutConfig(config);
    },
    dockPanel,
    floatPanel,
    resizePanel,
    minimizePanel,
    maximizePanel,
    isPanelVisible: (id: string) => visibility[id] ?? false,
    getPanelState: (id: string) => panelStates[id] || null,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1
  };
};
```

### useViewportContext Hook

```typescript
export const useViewportContext = () => {
  const [viewport, setViewport] = useAtom(viewportContextAtom);
  const [currentPage] = useAtom(currentPageAtom);
  const [visiblePages] = useAtom(visiblePagesAtom);
  const [scrollPosition] = useAtom(scrollPositionAtom);
  const [zoomLevel] = useAtom(zoomLevelAtom);
  const scrollContainerRef = useScrollContainerRef();
  
  // Update viewport context when dependencies change
  useEffect(() => {
    setViewport(prev => ({
      ...prev,
      currentPage,
      visiblePages,
      scrollPosition,
      zoomLevel
    }));
  }, [currentPage, visiblePages, scrollPosition, zoomLevel]);
  
  const isInViewport = useCallback((bounds: BoundingBox) => {
    const container = scrollContainerRef.current;
    if (!container) return false;
    
    const containerRect = container.getBoundingClientRect();
    const elementTop = bounds.top + container.scrollTop;
    const elementBottom = elementTop + bounds.height;
    
    return (
      elementBottom >= container.scrollTop &&
      elementTop <= container.scrollTop + containerRect.height
    );
  }, [scrollContainerRef]);
  
  const getDistanceFromViewport = useCallback((bounds: BoundingBox) => {
    const container = scrollContainerRef.current;
    if (!container) return Infinity;
    
    const containerRect = container.getBoundingClientRect();
    const viewportCenter = container.scrollTop + containerRect.height / 2;
    const elementCenter = bounds.top + bounds.height / 2;
    
    return Math.abs(viewportCenter - elementCenter);
  }, [scrollContainerRef]);
  
  const scrollToPosition = useCallback((position: number | BoundingBox) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    if (typeof position === 'number') {
      container.scrollTo({ top: position, behavior: 'smooth' });
    } else {
      const top = position.top - 100; // Offset for better visibility
      container.scrollTo({ top, behavior: 'smooth' });
    }
  }, [scrollContainerRef]);
  
  return {
    ...viewport,
    isInViewport,
    getDistanceFromViewport,
    scrollToPosition
  };
};
```

## Testing State Migrations

### Unit Tests

```typescript
describe('State Migration', () => {
  it('should migrate old layout to new format', () => {
    const oldLayout = {
      activeTab: 'annotations',
      sidebarCollapsed: false,
      rightPanelWidth: 400
    };
    
    const newLayout = migrateLayout(oldLayout);
    
    expect(newLayout).toEqual({
      panels: {
        annotations: {
          id: 'annotations',
          position: 'right',
          size: { width: 400, height: '100%' },
          visible: true,
          minimized: false,
          zIndex: 1
        }
      },
      activePanel: 'annotations',
      layout: 'custom',
      version: '1.0.0'
    });
  });
  
  it('should aggregate feed items correctly', () => {
    const annotations = [/* mock data */];
    const searchResults = [/* mock data */];
    
    const feedItems = aggregateFeedItems({ annotations, searchResults });
    
    expect(feedItems).toHaveLength(annotations.length + searchResults.length);
    expect(feedItems[0].type).toBe('annotation');
  });
});
```

### Integration Tests

```typescript
describe('Layout State Integration', () => {
  it('should persist layout changes', async () => {
    const { result } = renderHook(() => useLayout());
    
    // Change layout
    act(() => {
      result.current.dockPanel('chat', 'bottom');
    });
    
    // Check persistence
    const stored = localStorage.getItem('documentKnowledgeBase:layout');
    expect(JSON.parse(stored).panels.chat.position).toBe('bottom');
  });
  
  it('should sync viewport context with feed relevance', async () => {
    const { result: layoutResult } = renderHook(() => useLayout());
    const { result: feedResult } = renderHook(() => useContextFeed());
    
    // Scroll to page 5
    act(() => {
      window.scrollTo(0, 5000);
    });
    
    await waitFor(() => {
      const topItem = feedResult.current.items[0];
      expect(topItem.source.pageNumber).toBeCloseTo(5, 1);
    });
  });
});
```

## Performance Considerations

### Atom Optimization

```typescript
// Use atom families for dynamic atoms
export const panelStateFamily = atomFamily(
  (panelId: string) => atom<PanelState>({
    id: panelId,
    position: 'right',
    size: { width: '300px', height: '100%' },
    visible: false,
    minimized: false,
    zIndex: 1
  })
);

// Split large atoms to reduce re-renders
export const feedItemsByTypeAtom = atom((get) => {
  const items = get(feedItemsAtom);
  return items.reduce((acc, item) => {
    if (!acc[item.type]) acc[item.type] = [];
    acc[item.type].push(item);
    return acc;
  }, {} as Record<string, ContextItem[]>);
});

// Use selectAtom for specific data
export const annotationCountAtom = selectAtom(
  feedItemsAtom,
  items => items.filter(i => i.type === 'annotation').length
);
```

### Memoization Strategies

```typescript
// Memoize expensive calculations
export const relevanceCalculator = memoize(
  (item: ContextItem, viewport: ViewportContext, factors: RelevanceFactors) => {
    const spatial = calculateSpatialScore(item, viewport) * factors.spatial;
    const temporal = calculateTemporalScore(item) * factors.temporal;
    const semantic = calculateSemanticScore(item) * factors.semantic;
    const interaction = calculateInteractionScore(item) * factors.interaction;
    
    return spatial + temporal + semantic + interaction;
  },
  (item, viewport) => `${item.id}-${viewport.currentPage}-${viewport.scrollPosition}`
);

// Use React.memo for feed components
export const FeedItem = React.memo(({ item }: { item: ContextItem }) => {
  return <ContextCard item={item} />;
}, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.item.relevance === next.item.relevance
  );
});
```

## Debugging Tools

### State Inspector

```typescript
export const StateInspector = () => {
  const [showInspector, setShowInspector] = useState(false);
  const layoutState = useAtomValue(layoutStateAtom);
  const feedItems = useAtomValue(feedItemsAtom);
  const viewport = useAtomValue(viewportContextAtom);
  
  if (!showInspector) return null;
  
  return (
    <div className="state-inspector">
      <h3>Layout State</h3>
      <pre>{JSON.stringify(layoutState, null, 2)}</pre>
      
      <h3>Feed Items ({feedItems.length})</h3>
      <pre>{JSON.stringify(feedItems.slice(0, 5), null, 2)}</pre>
      
      <h3>Viewport Context</h3>
      <pre>{JSON.stringify(viewport, null, 2)}</pre>
    </div>
  );
};

// Add to development builds
if (process.env.NODE_ENV === 'development') {
  window.__LAYOUT_STATE__ = {
    getLayout: () => store.get(layoutStateAtom),
    setLayout: (layout: LayoutState) => store.set(layoutStateAtom, layout),
    resetLayout: () => store.set(layoutStateAtom, defaultLayoutState),
    inspectAtom: (atomName: string) => store.get(atoms[atomName])
  };
}
```

## Migration Timeline

1. **Week 1**: Add new atoms alongside existing ones
2. **Week 2**: Create compatibility layer and migration utilities  
3. **Week 3**: Update components to use new atoms with fallbacks
4. **Week 4**: Implement data aggregation for context feed
5. **Week 5**: Add persistence and performance optimizations
6. **Week 6**: Remove old atoms and compatibility layer

## Rollback Strategy

```typescript
// Keep backup of old state
export const backupOldState = () => {
  const backup = {
    activeTab: localStorage.getItem('activeTab'),
    sidebarCollapsed: localStorage.getItem('sidebarCollapsed'),
    // ... other old state
  };
  localStorage.setItem('state:backup', JSON.stringify(backup));
};

// Restore if needed
export const restoreOldState = () => {
  const backup = localStorage.getItem('state:backup');
  if (backup) {
    const parsed = JSON.parse(backup);
    Object.entries(parsed).forEach(([key, value]) => {
      if (value) localStorage.setItem(key, value);
    });
  }
};
``` 