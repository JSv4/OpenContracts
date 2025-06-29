# Future Plans Implementation Guide

## Overview

This guide provides step-by-step implementation details for transitioning DocumentKnowledgeBase from a tab-based interface to a flexible, context-aware layout system. It builds upon the conceptual framework in future-plans.md with concrete implementation steps.

## Implementation Phases

### Phase 1: Layout Foundation (Weeks 1-2)

#### Step 1.1: Create Core Layout Components

```typescript
// src/components/layout/LayoutContainer.tsx
import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { DndContext } from '@dnd-kit/core';
import { layoutReducer, LayoutState, LayoutAction } from './layoutReducer';

const LayoutContext = createContext<{
  state: LayoutState;
  dispatch: React.Dispatch<LayoutAction>;
} | null>(null);

export const useLayoutContext = () => {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayoutContext must be used within LayoutProvider');
  }
  return context;
};

export const LayoutContainer: React.FC<LayoutContainerProps> = ({
  children,
  initialLayout,
  onLayoutChange,
  enablePersistence = true,
  persistenceKey = 'document-layout'
}) => {
  const [state, dispatch] = useReducer(layoutReducer, {
    panels: {},
    activePanel: null,
    layout: initialLayout || 'default',
    version: '1.0.0'
  });

  // Persist layout changes
  useEffect(() => {
    if (enablePersistence) {
      localStorage.setItem(persistenceKey, JSON.stringify(state));
    }
    onLayoutChange?.(state);
  }, [state, enablePersistence, persistenceKey, onLayoutChange]);

  return (
    <LayoutContext.Provider value={{ state, dispatch }}>
      <DndContext>
        <div className="layout-container">
          <DockZones />
          <PanelGrid>
            {children}
          </PanelGrid>
          <FloatingLayer />
        </div>
      </DndContext>
    </LayoutContext.Provider>
  );
};
```

#### Step 1.2: Implement Layout Reducer

```typescript
// src/components/layout/layoutReducer.ts
export interface LayoutState {
  panels: Record<string, PanelState>;
  activePanel: string | null;
  layout: LayoutPreset | 'custom';
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
            zIndex: Object.keys(state.panels).length
          }
        }
      };

    case 'DOCK_PANEL':
      return {
        ...state,
        panels: {
          ...state.panels,
          [action.payload.id]: {
            ...state.panels[action.payload.id],
            position: action.payload.position,
            mode: 'docked'
          }
        }
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
            zIndex: Math.max(...Object.values(state.panels).map(p => p.zIndex || 0)) + 1
          }
        }
      };

    // ... other cases

    default:
      return state;
  }
};
```

#### Step 1.3: Create DockablePanel Component

```typescript
// src/components/layout/DockablePanel.tsx
import React, { useRef, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ResizableBox } from 'react-resizable';
import { useLayoutContext } from './LayoutContainer';

export const DockablePanel: React.FC<DockablePanelProps> = ({
  id,
  title,
  icon,
  children,
  defaultPosition = 'floating',
  defaultSize = { width: 400, height: 300 },
  minSize = { width: 200, height: 150 },
  maxSize = { width: 800, height: 600 }
}) => {
  const { state, dispatch } = useLayoutContext();
  const panelState = state.panels[id] || {};
  const [isResizing, setIsResizing] = useState(false);

  const { attributes, listeners, setNodeRef: setDragRef, transform } = useDraggable({
    id,
    disabled: panelState.mode === 'docked' || isResizing
  });

  const handleResize = (event: any, { size }: any) => {
    dispatch({
      type: 'RESIZE_PANEL',
      payload: { id, size }
    });
  };

  const content = (
    <div className={`panel-content ${panelState.minimized ? 'minimized' : ''}`}>
      <div className="panel-header" {...attributes} {...listeners}>
        {icon}
        <span className="panel-title">{title}</span>
        <PanelControls panelId={id} />
      </div>
      {!panelState.minimized && (
        <div className="panel-body">
          {children}
        </div>
      )}
    </div>
  );

  if (panelState.mode === 'floating') {
    return (
      <div
        ref={setDragRef}
        className="dockable-panel floating"
        style={{
          transform: `translate3d(${transform?.x || 0}px, ${transform?.y || 0}px, 0)`,
          zIndex: panelState.zIndex
        }}
      >
        <ResizableBox
          width={panelState.size?.width || defaultSize.width}
          height={panelState.size?.height || defaultSize.height}
          minConstraints={[minSize.width, minSize.height]}
          maxConstraints={[maxSize.width, maxSize.height]}
          onResize={handleResize}
          onResizeStart={() => setIsResizing(true)}
          onResizeStop={() => setIsResizing(false)}
        >
          {content}
        </ResizableBox>
      </div>
    );
  }

  return (
    <div className={`dockable-panel docked ${panelState.position}`}>
      {content}
    </div>
  );
};
```

### Phase 2: Component Migration (Weeks 3-5)

#### Step 2.1: Create Panel Adapters

```typescript
// src/components/layout/adapters/createPanelAdapter.tsx
export function createPanelAdapter<P extends object>(
  Component: React.ComponentType<P>,
  defaultConfig: Partial<DockablePanelProps>
) {
  return React.forwardRef<HTMLDivElement, P & { panelId?: string }>(
    (props, ref) => {
      const { panelId = defaultConfig.id, ...componentProps } = props;

      return (
        <DockablePanel
          ref={ref}
          id={panelId}
          {...defaultConfig}
        >
          <Component {...(componentProps as P)} />
        </DockablePanel>
      );
    }
  );
}

// Usage:
export const ChatPanelAdapter = createPanelAdapter(ChatTray, {
  id: 'chat',
  title: 'Chat',
  icon: <MessageSquare size={18} />,
  defaultPosition: 'right',
  defaultSize: { width: 400, height: '100%' }
});
```

#### Step 2.2: Migrate State Management

```typescript
// src/components/layout/atoms/layoutAtoms.ts
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// Layout configuration atom with persistence
export const layoutConfigAtom = atomWithStorage<LayoutState>(
  'document-layout-config',
  {
    panels: {},
    activePanel: null,
    layout: 'default',
    version: '1.0.0'
  }
);

// Derived atoms for specific queries
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
      [panel.position]: [...(acc[panel.position] || []), { id, ...panel }]
    }), {} as Record<DockPosition, PanelState[]>);
});
```

#### Step 2.3: Update DocumentKnowledgeBase

```typescript
// src/components/knowledge_base/document/DocumentKnowledgeBase.tsx
import { useAtom } from 'jotai';
import { featureFlagsAtom } from '../../../atoms/featureFlags';
import { LayoutContainer } from '../../layout/LayoutContainer';
import { ChatPanelAdapter, NotesPanelAdapter, AnnotationsPanelAdapter } from '../../layout/adapters';

const DocumentKnowledgeBase: React.FC<Props> = ({ documentId, corpusId }) => {
  const [featureFlags] = useAtom(featureFlagsAtom);
  const useNewLayout = featureFlags.newLayoutSystem;

  // ... existing state and logic

  if (useNewLayout) {
    return (
      <LayoutContainer
        initialLayout="research"
        onLayoutChange={handleLayoutChange}
        enablePersistence
      >
        {/* Main document viewer - always visible */}
        <div className="document-viewer-container">
          {viewerContent}
        </div>

        {/* Adaptable panels */}
        <ChatPanelAdapter
          documentId={documentId}
          corpusId={corpusId}
          onMessageSelect={handleMessageSelect}
        />

        <NotesPanelAdapter
          notes={notes}
          onNoteClick={handleNoteClick}
        />

        <AnnotationsPanelAdapter
          annotations={annotations}
          onAnnotationSelect={handleAnnotationSelect}
        />

        <ContextFeedAdapter
          documentId={documentId}
          viewportState={viewportState}
        />
      </LayoutContainer>
    );
  }

  // Existing implementation
  return (
    <div className="legacy-layout">
      {/* ... existing tab-based layout */}
    </div>
  );
};
```

### Phase 3: Context Feed Implementation (Weeks 6-9)

#### Step 3.1: Create Viewport Tracking System

```typescript
// src/hooks/useViewportTracking.ts
export const useViewportTracking = (containerRef: RefObject<HTMLElement>) => {
  const [viewport, setViewport] = useState<ViewportState>({
    scrollTop: 0,
    visiblePageRange: [0, 0],
    documentHeight: 0,
    viewportHeight: 0,
    currentPage: 0
  });

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const resizeObserver = new ResizeObserver(() => {
      updateViewport();
    });

    const updateViewport = throttle(() => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const pageElements = container.querySelectorAll('.pdf-page');
      
      // Calculate visible pages
      const visiblePages: number[] = [];
      pageElements.forEach((el, index) => {
        const rect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        if (
          rect.bottom >= containerRect.top &&
          rect.top <= containerRect.bottom
        ) {
          visiblePages.push(index);
        }
      });

      setViewport({
        scrollTop,
        visiblePageRange: [
          Math.min(...visiblePages),
          Math.max(...visiblePages)
        ],
        documentHeight: scrollHeight,
        viewportHeight: clientHeight,
        currentPage: visiblePages[0] || 0
      });
    }, 100);

    container.addEventListener('scroll', updateViewport);
    resizeObserver.observe(container);
    updateViewport();

    return () => {
      container.removeEventListener('scroll', updateViewport);
      resizeObserver.disconnect();
    };
  }, [containerRef]);

  return viewport;
};
```

#### Step 3.2: Implement Context Aggregation

```typescript
// src/components/layout/ContextFeed/useContextAggregation.ts
export const useContextAggregation = (viewport: ViewportState) => {
  const annotations = useAtomValue(allAnnotationsAtom);
  const relationships = useAtomValue(relationshipsAtom);
  const notes = useAtomValue(notesAtom);
  const searchResults = useAtomValue(searchResultsAtom);

  return useMemo(() => {
    const items: ContextItem[] = [];

    // Score and collect annotations
    annotations.forEach(annotation => {
      const relevance = calculateRelevance(annotation, viewport);
      if (relevance.score > RELEVANCE_THRESHOLD) {
        items.push({
          id: annotation.id,
          type: 'annotation',
          data: annotation,
          score: relevance.score,
          distance: relevance.distance,
          pageNumber: annotation.page
        });
      }
    });

    // Score and collect relationships
    relationships.forEach(relationship => {
      const sourceRelevance = calculateRelevance(
        { page: relationship.source.page },
        viewport
      );
      const targetRelevance = calculateRelevance(
        { page: relationship.target.page },
        viewport
      );
      
      const combinedScore = Math.max(
        sourceRelevance.score,
        targetRelevance.score
      );

      if (combinedScore > RELEVANCE_THRESHOLD) {
        items.push({
          id: relationship.id,
          type: 'relationship',
          data: relationship,
          score: combinedScore,
          distance: Math.min(
            sourceRelevance.distance,
            targetRelevance.distance
          ),
          pageNumber: Math.min(
            relationship.source.page,
            relationship.target.page
          )
        });
      }
    });

    // Sort by relevance
    return items.sort((a, b) => b.score - a.score);
  }, [annotations, relationships, notes, searchResults, viewport]);
};
```

### Phase 4: Polish & Optimization (Weeks 10-11)

#### Step 4.1: Performance Optimizations

```typescript
// src/components/layout/optimizations.ts
import { memo, useCallback, useMemo } from 'react';
import { useDebounce, useThrottle } from '../hooks';

// Memoized panel component
export const OptimizedPanel = memo(DockablePanel, (prevProps, nextProps) => {
  // Only re-render if these specific props change
  return (
    prevProps.id === nextProps.id &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.size?.width === nextProps.size?.width &&
    prevProps.size?.height === nextProps.size?.height &&
    prevProps.position === nextProps.position
  );
});

// Virtualized context feed
export const VirtualizedContextFeed = () => {
  const items = useContextAggregation(viewport);
  const debouncedItems = useDebounce(items, 150);

  return (
    <VirtualList
      items={debouncedItems}
      itemHeight={80}
      overscan={5}
      getItemKey={(item) => item.id}
      renderItem={(item) => (
        <ContextFeedItem key={item.id} item={item} />
      )}
    />
  );
};
```

#### Step 4.2: Error Boundaries and Fallbacks

```typescript
// src/components/layout/LayoutErrorBoundary.tsx
export class LayoutErrorBoundary extends Component<Props, State> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Layout error:', error, errorInfo);
    
    // Report to monitoring
    if (window.Sentry) {
      window.Sentry.captureException(error, {
        contexts: { react: { componentStack: errorInfo.componentStack } }
      });
    }
  }

  handleReset = () => {
    // Clear corrupted layout state
    localStorage.removeItem('document-layout-config');
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="layout-error-fallback">
          <h2>Layout Error</h2>
          <p>Something went wrong with the layout system.</p>
          <button onClick={this.handleReset}>
            Reset Layout
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

## Testing Strategy

### Unit Tests

```typescript
// src/components/layout/__tests__/layoutReducer.test.ts
describe('layoutReducer', () => {
  it('should dock a panel', () => {
    const initialState = {
      panels: {
        'panel-1': {
          id: 'panel-1',
          mode: 'floating',
          position: { x: 100, y: 100 }
        }
      }
    };

    const action = {
      type: 'DOCK_PANEL',
      payload: { id: 'panel-1', position: 'right' }
    };

    const newState = layoutReducer(initialState, action);
    
    expect(newState.panels['panel-1'].mode).toBe('docked');
    expect(newState.panels['panel-1'].position).toBe('right');
  });
});
```

### Integration Tests

```typescript
// src/components/layout/__tests__/LayoutContainer.test.tsx
import { render, fireEvent } from '@testing-library/react';
import { LayoutContainer } from '../LayoutContainer';

test('persists layout changes to localStorage', async () => {
  const { getByTestId } = render(
    <LayoutContainer enablePersistence>
      <DockablePanel id="test-panel" title="Test">
        Content
      </DockablePanel>
    </LayoutContainer>
  );

  // Trigger a layout change
  fireEvent.click(getByTestId('float-panel-button'));

  // Check localStorage
  await waitFor(() => {
    const saved = JSON.parse(localStorage.getItem('document-layout'));
    expect(saved.panels['test-panel'].mode).toBe('floating');
  });
});
```

## Deployment Strategy

### Feature Flag Configuration

```typescript
// src/config/featureFlags.ts
export const FEATURE_FLAGS = {
  newLayoutSystem: {
    default: false,
    environments: {
      development: true,
      staging: true,
      production: false
    },
    rollout: {
      percentage: 0,
      whitelist: ['beta-users'],
      blacklist: []
    }
  }
};
```

### Gradual Rollout Plan

1. **Week 1**: Internal testing (development team only)
2. **Week 2**: Beta users (5% of traffic)
3. **Week 3**: Expand to 25% of users
4. **Week 4**: 50% rollout with A/B testing
5. **Week 5**: 100% deployment

### Monitoring Setup

```typescript
// src/utils/layoutMonitoring.ts
export const trackLayoutEvent = (event: LayoutEvent) => {
  // Send to analytics
  analytics.track('layout_event', {
    type: event.type,
    panelId: event.panelId,
    timestamp: event.timestamp,
    userId: getCurrentUserId(),
    sessionId: getSessionId()
  });

  // Performance metrics
  if (event.type === 'resize' || event.type === 'drag') {
    performance.mark(`layout-${event.type}-end`);
    performance.measure(
      `layout-${event.type}`,
      `layout-${event.type}-start`,
      `layout-${event.type}-end`
    );
  }
};
```

## Success Criteria

- [ ] All panels migrated without feature regression
- [ ] Performance metrics meet targets (<200ms layout changes)
- [ ] Zero increase in error rates
- [ ] Positive user feedback from beta testing
- [ ] Accessibility audit passes
- [ ] Documentation complete and accurate
