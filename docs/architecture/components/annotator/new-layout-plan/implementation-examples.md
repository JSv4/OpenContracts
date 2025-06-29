# Implementation Examples

## Overview

This document provides practical implementation examples for the new layout system, showing how to migrate from the current tab-based interface to the flexible layout architecture.

## Basic Layout Setup

### Before: Tab-Based Implementation

```tsx
// Current implementation with tabs
const DocumentKnowledgeBase = () => {
  const [activeTab, setActiveTab] = useState('summary');
  const [showRightPanel, setShowRightPanel] = useState(false);
  
  return (
    <div>
      <TabsColumn>
        {tabs.map(tab => (
          <TabButton
            key={tab.key}
            active={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </TabButton>
        ))}
      </TabsColumn>
      
      <MainContent>
        {activeTab === 'summary' && <Summary />}
        {activeTab === 'annotations' && <AnnotationList />}
        {activeTab === 'chat' && <ChatPanel />}
        {/* ... more tabs ... */}
      </MainContent>
    </div>
  );
};
```

### After: Flexible Layout Implementation

```tsx
// New implementation with flexible layout
const DocumentKnowledgeBase = () => {
  const { layout, showPanel, hidePanel } = useLayout();
  
  return (
    <LayoutContainer
      initialLayout="research"
      enablePersistence={true}
      onLayoutChange={(newLayout) => {
        console.log('Layout changed:', newLayout);
      }}
    >
      {/* Main document viewer - always visible */}
      <DockablePanel
        id="document"
        title="Document"
        defaultPosition="center"
        draggable={false}
        closable={false}
      >
        <DocumentViewer />
      </DockablePanel>
      
      {/* Context feed - dockable to any side */}
      <DockablePanel
        id="context-feed"
        title="Context"
        icon={<Layers size={16} />}
        defaultPosition="right"
        defaultSize={{ width: 350, height: '100%' }}
        minSize={{ width: 300, height: 400 }}
      >
        <ContextFeed />
      </DockablePanel>
      
      {/* Chat panel - can float or dock */}
      <DockablePanel
        id="chat"
        title="Chat"
        icon={<MessageSquare size={16} />}
        defaultPosition={{ x: 100, y: 100, width: 400, height: 500 }}
        closable
        alwaysOnTop
      >
        <ChatPanel />
      </DockablePanel>
      
      {/* Summary panel - initially hidden */}
      <DockablePanel
        id="summary"
        title="Summary"
        icon={<FileText size={16} />}
        defaultPosition="left"
        defaultSize={{ width: 400, height: '100%' }}
        visible={false}
      >
        <Summary />
      </DockablePanel>
    </LayoutContainer>
  );
};
```

## Context Feed Implementation

### Aggregating Multiple Data Sources

```tsx
const ContextFeed = () => {
  const { items, loading, error } = useContextFeed({
    sources: {
      annotations: true,
      relationships: true,
      notes: true,
      search: true,
      analyses: true
    },
    viewportTracking: true,
    maxItems: 100,
    relevanceFactors: {
      spatial: 0.4,
      temporal: 0.2,
      semantic: 0.2,
      interaction: 0.2
    }
  });
  
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [filters, setFilters] = useState<FilterState>({
    types: new Set(['annotation', 'relationship', 'note']),
    dateRange: null,
    authors: []
  });
  
  if (loading) return <AccessibleLoader label="Loading context items..." />;
  if (error) return <ErrorMessage error={error} />;
  
  return (
    <FeedContainer>
      <FeedHeader>
        <FilterBar
          filters={filters}
          onChange={setFilters}
          availableTypes={['annotation', 'relationship', 'note', 'search']}
        />
        <ViewToggle
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: 'list', icon: <List />, label: 'List view' },
            { value: 'grid', icon: <Grid />, label: 'Grid view' }
          ]}
        />
      </FeedHeader>
      
      <VirtualizedList
        items={items}
        viewMode={viewMode}
        renderItem={(item) => (
          <ContextCard
            key={item.id}
            item={item}
            viewMode={viewMode}
            onInteraction={(action) => handleItemAction(action, item)}
          />
        )}
      />
    </FeedContainer>
  );
};
```

### Context Card with Type-Specific Rendering

```tsx
const ContextCard: React.FC<{ item: ContextItem; viewMode: ViewMode }> = ({ 
  item, 
  viewMode 
}) => {
  const { navigateToAnnotation } = useAnnotationNavigation();
  const { selectedAnnotations, toggleAnnotation } = useAnnotationSelection();
  
  const isSelected = selectedAnnotations.includes(item.id);
  
  const renderContent = () => {
    switch (item.type) {
      case 'annotation':
        return (
          <AnnotationContent>
            <Label color={item.content.metadata?.color}>
              {item.content.metadata?.label}
            </Label>
            <Text>{item.content.text}</Text>
            <PageRef>Page {item.source.pageNumber}</PageRef>
          </AnnotationContent>
        );
        
      case 'relationship':
        return (
          <RelationshipContent>
            <RelationType>{item.content.metadata?.type}</RelationType>
            <Connection>
              <span>{item.content.metadata?.source}</span>
              <Arrow />
              <span>{item.content.metadata?.target}</span>
            </Connection>
          </RelationshipContent>
        );
        
      case 'note':
        return (
          <NoteContent>
            <NoteTitle>{item.content.title}</NoteTitle>
            <NoteText>{item.content.text}</NoteText>
            <Author>{item.author?.name}</Author>
          </NoteContent>
        );
        
      case 'search':
        return (
          <SearchContent>
            <Highlight>{item.content.text}</Highlight>
            <SearchMeta>
              Match score: {item.content.metadata?.score}
            </SearchMeta>
          </SearchContent>
        );
    }
  };
  
  return (
    <Card
      viewMode={viewMode}
      selected={isSelected}
      onClick={() => {
        if (item.type === 'annotation') {
          navigateToAnnotation(item.id);
        }
        toggleAnnotation(item.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleAnnotation(item.id);
        }
      }}
      role="article"
      tabIndex={0}
      aria-selected={isSelected}
      aria-label={getItemAriaLabel(item)}
    >
      <CardHeader>
        <TypeIcon type={item.type} />
        <Timestamp>{formatRelativeTime(item.timestamp)}</Timestamp>
      </CardHeader>
      
      {renderContent()}
      
      <CardActions>
        {item.actions.map(action => (
          <ActionButton
            key={action.id}
            onClick={(e) => {
              e.stopPropagation();
              action.handler(item);
            }}
            aria-label={action.label}
            title={action.label}
          >
            {action.icon}
          </ActionButton>
        ))}
      </CardActions>
      
      <RelevanceIndicator value={item.relevance} />
    </Card>
  );
};
```

## State Management Migration

### Setting Up New Layout State

```tsx
// atoms/layoutAtoms.ts
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// Layout configuration with persistence
export const layoutConfigAtom = atomWithStorage<LayoutConfig>(
  'documentKnowledgeBase:layoutConfig',
  {
    preset: 'research',
    customLayouts: {},
    recentLayouts: []
  }
);

// Panel states
export const panelStatesAtom = atom<Record<string, PanelState>>({
  document: {
    id: 'document',
    position: 'center',
    size: { width: '100%', height: '100%' },
    visible: true,
    minimized: false,
    zIndex: 0
  },
  'context-feed': {
    id: 'context-feed',
    position: 'right',
    size: { width: 350, height: '100%' },
    visible: true,
    minimized: false,
    zIndex: 1
  },
  chat: {
    id: 'chat',
    position: { x: 100, y: 100, width: 400, height: 500 },
    size: { width: 400, height: 500 },
    visible: false,
    minimized: false,
    zIndex: 2
  }
});

// Active panel for keyboard navigation
export const activePanelAtom = atom<string | null>('document');

// Layout history for undo/redo
export const layoutHistoryAtom = atom<LayoutState[]>([]);
export const layoutHistoryIndexAtom = atom<number>(0);
```

### Migrating Component State

```tsx
// Before: Using old tab state
const AnnotationsPanel = () => {
  const [activeTab] = useAtom(activeTabAtom);
  const [annotations] = useAtom(annotationsAtom);
  
  if (activeTab !== 'annotations') return null;
  
  return <AnnotationList annotations={annotations} />;
};

// After: Using new layout state
const AnnotationsPanel = () => {
  const { isPanelVisible } = useLayout();
  const annotations = useAnnotations(); // Now from context feed
  
  // Panel visibility is handled by DockablePanel
  return <AnnotationList annotations={annotations} />;
};

// The panel itself is now wrapped:
<DockablePanel id="annotations" title="Annotations">
  <AnnotationsPanel />
</DockablePanel>
```

## Custom Layout Presets

### Creating Layout Presets

```tsx
const layoutPresets: Record<string, LayoutConfig> = {
  research: {
    panels: {
      document: { position: 'center', visible: true },
      'context-feed': { position: 'right', size: { width: 350 }, visible: true },
      chat: { position: 'bottom', size: { height: 200 }, visible: false },
      summary: { position: 'left', size: { width: 300 }, visible: false }
    }
  },
  
  review: {
    panels: {
      document: { position: 'center', visible: true },
      'context-feed': { 
        position: { x: 50, y: 50, width: 400, height: 600 }, 
        visible: true 
      },
      chat: { position: 'right', size: { width: 300 }, visible: true }
    }
  },
  
  presentation: {
    panels: {
      document: { position: 'center', visible: true },
      // All other panels hidden
      'context-feed': { visible: false },
      chat: { visible: false },
      summary: { visible: false }
    }
  }
};

// Layout preset selector
const LayoutPresetSelector = () => {
  const { setLayout, layout } = useLayout();
  const [customName, setCustomName] = useState('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  
  const presets = [
    { id: 'research', label: 'Research Mode', icon: <Book /> },
    { id: 'review', label: 'Review Mode', icon: <CheckSquare /> },
    { id: 'collaboration', label: 'Collaboration', icon: <Users /> },
    { id: 'presentation', label: 'Presentation', icon: <Monitor /> }
  ];
  
  return (
    <LayoutSelector>
      <CurrentLayout>
        <Icon>{presets.find(p => p.id === layout)?.icon}</Icon>
        <Label>{presets.find(p => p.id === layout)?.label}</Label>
      </CurrentLayout>
      
      <PresetMenu>
        {presets.map(preset => (
          <PresetOption
            key={preset.id}
            active={layout === preset.id}
            onClick={() => setLayout(preset.id)}
          >
            {preset.icon}
            <span>{preset.label}</span>
          </PresetOption>
        ))}
        
        <Divider />
        
        <PresetOption onClick={() => setShowSaveDialog(true)}>
          <Save size={16} />
          <span>Save Current Layout</span>
        </PresetOption>
      </PresetMenu>
      
      {showSaveDialog && (
        <SaveLayoutDialog
          onSave={(name) => {
            saveCustomLayout(name, getCurrentLayout());
            setShowSaveDialog(false);
          }}
          onCancel={() => setShowSaveDialog(false)}
        />
      )}
    </LayoutSelector>
  );
};
```

## Keyboard Navigation Implementation

```tsx
const KeyboardNavigationProvider = ({ children }) => {
  const { panels, activePanel, focusPanel } = useLayout();
  const [navigationMode, setNavigationMode] = useState<'normal' | 'panel'>('normal');
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F6 - Cycle through panels
      if (e.key === 'F6') {
        e.preventDefault();
        const panelIds = Object.keys(panels).filter(id => panels[id].visible);
        const currentIndex = panelIds.indexOf(activePanel || '');
        const nextIndex = e.shiftKey 
          ? (currentIndex - 1 + panelIds.length) % panelIds.length
          : (currentIndex + 1) % panelIds.length;
        focusPanel(panelIds[nextIndex]);
        announcePanel(panels[panelIds[nextIndex]].title);
      }
      
      // Ctrl+Shift+P - Open command palette
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        openCommandPalette();
      }
      
      // Escape - Exit panel navigation mode
      if (e.key === 'Escape' && navigationMode === 'panel') {
        setNavigationMode('normal');
        announceMode('Exited panel navigation');
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [panels, activePanel, navigationMode]);
  
  return (
    <NavigationContext.Provider value={{ navigationMode, setNavigationMode }}>
      {children}
    </NavigationContext.Provider>
  );
};
```

## Performance Optimization Examples

### Virtualized Feed with Intersection Observer

```tsx
const OptimizedContextFeed = () => {
  const { items } = useContextFeed();
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });
  const sentinelRef = useRef<HTMLDivElement>(null);
  
  // Use Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleRange(prev => ({
            start: prev.start,
            end: Math.min(prev.end + 20, items.length)
          }));
        }
      },
      { threshold: 0.1 }
    );
    
    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }
    
    return () => observer.disconnect();
  }, [items.length]);
  
  // Memoize visible items
  const visibleItems = useMemo(
    () => items.slice(visibleRange.start, visibleRange.end),
    [items, visibleRange]
  );
  
  return (
    <FeedContainer>
      {visibleItems.map((item, index) => (
        <MemoizedContextCard
          key={item.id}
          item={item}
          index={index}
        />
      ))}
      <div ref={sentinelRef} style={{ height: 1 }} />
    </FeedContainer>
  );
};

// Memoized card component
const MemoizedContextCard = React.memo(
  ({ item, index }: { item: ContextItem; index: number }) => (
    <ContextCard item={item} />
  ),
  (prevProps, nextProps) => {
    // Only re-render if item data changes
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.relevance === nextProps.item.relevance &&
      prevProps.index === nextProps.index
    );
  }
);
```

### Debounced Layout Persistence

```tsx
const useLayoutPersistence = () => {
  const [layout] = useAtom(layoutStateAtom);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  
  // Debounce layout saves
  const saveLayout = useDebouncedCallback(
    (layoutToSave: LayoutState) => {
      try {
        localStorage.setItem(
          'documentKnowledgeBase:layout',
          JSON.stringify(layoutToSave)
        );
        console.log('Layout saved');
      } catch (error) {
        console.error('Failed to save layout:', error);
      }
    },
    1000 // Wait 1 second after last change
  );
  
  // Save on layout changes
  useEffect(() => {
    saveLayout(layout);
  }, [layout, saveLayout]);
  
  // Save immediately on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // Save synchronously on unmount
      localStorage.setItem(
        'documentKnowledgeBase:layout',
        JSON.stringify(layout)
      );
    };
  }, [layout]);
};
```

## Testing Examples

### Component Testing with Playwright

```typescript
// tests/layout/dockable-panel.spec.tsx
import { test, expect } from '@playwright/experimental-ct-react';
import { DockablePanel } from './DockablePanel';

test.describe('DockablePanel', () => {
  test('should dock to all edges', async ({ mount, page }) => {
    const onDock = sinon.stub();
    
    const component = await mount(
      <DockablePanel
        id="test"
        title="Test Panel"
        defaultPosition={{ x: 400, y: 300 }}
        onDock={onDock}
      >
        <div>Test Content</div>
      </DockablePanel>
    );
    
    // Drag to left edge
    const header = component.locator('header');
    await header.dragTo(page.locator('body'), {
      targetPosition: { x: 10, y: 300 }
    });
    
    expect(onDock).toHaveBeenCalledWith('left');
    
    // Visual regression test
    await expect(component).toHaveScreenshot('docked-left.png');
  });
  
  test('should handle keyboard navigation', async ({ mount }) => {
    const component = await mount(
      <LayoutContainer>
        <DockablePanel id="panel1" title="Panel 1">Content 1</DockablePanel>
        <DockablePanel id="panel2" title="Panel 2">Content 2</DockablePanel>
      </LayoutContainer>
    );
    
    // Focus first panel
    await component.locator('#panel1').focus();
    
    // Press F6 to navigate to next panel
    await component.press('F6');
    
    // Check focus moved to panel2
    await expect(component.locator('#panel2')).toBeFocused();
  });
});
```

## Accessibility Testing

```typescript
// tests/layout/accessibility.spec.tsx
test.describe('Layout Accessibility', () => {
  test('should announce layout changes', async ({ page }) => {
    await page.goto('/document/test');
    
    // Listen for announcements
    const announcements: string[] = [];
    await page.exposeFunction('captureAnnouncement', (text: string) => {
      announcements.push(text);
    });
    
    await page.evaluate(() => {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.target.getAttribute('role') === 'status') {
            window.captureAnnouncement(mutation.target.textContent || '');
          }
        });
      });
      
      const liveRegion = document.querySelector('[role="status"]');
      if (liveRegion) {
        observer.observe(liveRegion, { childList: true });
      }
    });
    
    // Change layout
    await page.click('[data-testid="layout-preset-review"]');
    
    // Check announcement was made
    expect(announcements).toContain('Layout changed to Review Mode');
  });
});
```

## Migration Example: Step by Step

### Step 1: Update Dependencies

```json
{
  "dependencies": {
    "@dnd-kit/core": "^6.0.0",
    "@dnd-kit/sortable": "^7.0.0",
    "react-resizable-panels": "^0.0.55",
    "framer-motion": "^10.16.0",
    "@tanstack/react-virtual": "^3.0.0"
  }
}
```

### Step 2: Create Feature Flag

```typescript
// config/features.ts
export const FEATURES = {
  NEW_LAYOUT_SYSTEM: process.env.REACT_APP_NEW_LAYOUT === 'true'
};

// DocumentKnowledgeBase.tsx
export const DocumentKnowledgeBase = (props) => {
  if (FEATURES.NEW_LAYOUT_SYSTEM) {
    return <NewDocumentKnowledgeBase {...props} />;
  }
  return <LegacyDocumentKnowledgeBase {...props} />;
};
```

### Step 3: Gradual Migration

```typescript
// Start with one panel at a time
const MigratedChatPanel = () => {
  const { chat } = useLegacyPanels();
  
  return (
    <DockablePanel
      id="chat"
      title="Chat"
      defaultPosition="right"
      defaultSize={{ width: 400, height: '100%' }}
    >
      {/* Reuse existing ChatTray component */}
      <ChatTray {...chat.props} />
    </DockablePanel>
  );
};
```

This implementation guide provides concrete examples of how to build and use the new layout system, making it easier for developers to understand and implement the refactor. 