# Layout System API Reference

## Core Components

### LayoutContainer

The root container that manages the overall layout system.

```typescript
interface LayoutContainer {
  // Props
  children: React.ReactNode;
  initialLayout?: LayoutPreset | CustomLayout;
  onLayoutChange?: (layout: LayoutState) => void;
  enablePersistence?: boolean;
  persistenceKey?: string;
  className?: string;
  
  // Layout presets
  layoutPresets?: {
    research: LayoutConfig;
    review: LayoutConfig;
    collaboration: LayoutConfig;
    focus: LayoutConfig;
    custom?: LayoutConfig;
  };
  
  // Responsive behavior
  breakpoints?: {
    mobile: number;    // default: 768
    tablet: number;    // default: 1024
    desktop: number;   // default: 1440
  };
  
  // Animation settings
  animationDuration?: number;  // ms, default: 300
  enableAnimations?: boolean;  // default: true
}

// Layout state structure
interface LayoutState {
  panels: Record<string, PanelState>;
  activePanel: string | null;
  layout: LayoutPreset | 'custom';
  version: string;
}

interface PanelState {
  id: string;
  position: DockPosition | FloatPosition;
  size: PanelSize;
  visible: boolean;
  minimized: boolean;
  zIndex: number;
}
```

#### Usage Example

```tsx
<LayoutContainer
  initialLayout="research"
  enablePersistence={true}
  persistenceKey="doc-knowledge-base"
  onLayoutChange={(layout) => console.log('Layout changed:', layout)}
>
  <DockablePanel id="viewer" defaultPosition="center">
    <DocumentViewer />
  </DockablePanel>
  
  <DockablePanel id="feed" defaultPosition="right">
    <ContextFeed />
  </DockablePanel>
  
  <DockablePanel id="chat" defaultPosition="bottom">
    <ChatPanel />
  </DockablePanel>
</LayoutContainer>
```

### DockablePanel

A panel that can be docked to edges or floated freely.

```typescript
interface DockablePanel {
  // Identity
  id: string;
  title?: string;
  icon?: React.ReactNode;
  
  // Positioning
  defaultPosition: DockPosition;
  defaultSize?: PanelSize;
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
  
  // Behavior
  draggable?: boolean;         // default: true
  resizable?: boolean;         // default: true
  collapsible?: boolean;       // default: true
  closable?: boolean;          // default: false
  alwaysOnTop?: boolean;       // default: false
  
  // State callbacks
  onDock?: (position: DockPosition) => void;
  onFloat?: (position: FloatPosition) => void;
  onResize?: (size: PanelSize) => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  onFocus?: () => void;
  
  // Styling
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  
  // Advanced
  dockingZones?: DockingZone[];  // Custom docking areas
  resizeHandles?: ResizeHandle[]; // Which edges can resize
  
  children: React.ReactNode;
}

type DockPosition = 'left' | 'right' | 'top' | 'bottom' | 'center';

interface FloatPosition {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

interface PanelSize {
  width: number | string;  // px or %
  height: number | string; // px or %
}
```

### ContextFeed

The unified feed component that aggregates and displays contextual information.

```typescript
interface ContextFeed {
  // Data source configuration
  sources?: {
    annotations?: boolean;
    relationships?: boolean;
    notes?: boolean;
    search?: boolean;
    analyses?: boolean;
    extracts?: boolean;
  };
  
  // Viewport awareness
  viewportTracking?: boolean;        // default: true
  viewportBuffer?: number;           // pages, default: 1
  
  // Content settings
  maxItems?: number;                 // default: 100
  itemsPerPage?: number;             // default: 20
  groupByType?: boolean;             // default: false
  
  // Sorting & filtering
  defaultSort?: SortStrategy;
  defaultFilters?: FilterState;
  onFilterChange?: (filters: FilterState) => void;
  onSortChange?: (sort: SortStrategy) => void;
  
  // Relevance scoring
  relevanceFactors?: {
    spatial?: number;      // weight: 0-1
    temporal?: number;     // weight: 0-1
    semantic?: number;     // weight: 0-1
    interaction?: number;  // weight: 0-1
  };
  
  // Display options
  viewMode?: 'list' | 'grid' | 'compact';
  showTimestamps?: boolean;
  showAuthors?: boolean;
  showActions?: boolean;
  
  // Interaction callbacks
  onItemClick?: (item: ContextItem) => void;
  onItemHover?: (item: ContextItem) => void;
  onAction?: (action: ContextAction, item: ContextItem) => void;
  
  // Performance
  virtualizeList?: boolean;          // default: true
  debounceDelay?: number;           // ms, default: 150
  
  // Custom rendering
  renderItem?: (item: ContextItem) => React.ReactNode;
  renderEmptyState?: () => React.ReactNode;
  renderLoadingState?: () => React.ReactNode;
}

interface ContextItem {
  id: string;
  type: 'annotation' | 'relationship' | 'note' | 'search' | 'analysis';
  source: {
    documentId: string;
    pageNumber?: number;
    bounds?: BoundingBox;
  };
  content: {
    title?: string;
    text: string;
    metadata?: Record<string, any>;
  };
  relevance: number;         // 0-1
  timestamp: Date;
  author?: User;
  actions: ContextAction[];
  tags?: string[];
  color?: string;
}
```

## Layout Hooks

### useLayout

Main hook for accessing and controlling the layout system.

```typescript
function useLayout(): {
  // State
  layout: LayoutState;
  activePanel: string | null;
  
  // Panel management
  showPanel: (panelId: string) => void;
  hidePanel: (panelId: string) => void;
  togglePanel: (panelId: string) => void;
  focusPanel: (panelId: string) => void;
  
  // Layout management
  setLayout: (preset: LayoutPreset) => void;
  saveLayout: (name: string) => void;
  resetLayout: () => void;
  
  // Panel positioning
  dockPanel: (panelId: string, position: DockPosition) => void;
  floatPanel: (panelId: string, position?: FloatPosition) => void;
  
  // Panel sizing
  resizePanel: (panelId: string, size: PanelSize) => void;
  minimizePanel: (panelId: string) => void;
  maximizePanel: (panelId: string) => void;
  
  // Utilities
  isPanelVisible: (panelId: string) => boolean;
  getPanelState: (panelId: string) => PanelState | null;
}
```

### useViewportContext

Hook for accessing viewport information for context-aware features.

```typescript
function useViewportContext(): {
  // Current viewport
  currentPage: number;
  visiblePages: number[];
  scrollPosition: number;
  viewportBounds: BoundingBox;
  
  // Document info
  totalPages: number;
  zoomLevel: number;
  
  // User interaction
  selectedText: TextSelection | null;
  hoveredElement: Element | null;
  activeAnnotations: string[];
  
  // Utilities
  isInViewport: (bounds: BoundingBox) => boolean;
  getDistanceFromViewport: (bounds: BoundingBox) => number;
  scrollToPosition: (position: number | BoundingBox) => void;
}
```

## Performance Guidelines

### Optimization Strategies

```typescript
// Memoize expensive calculations
const memoizedRelevance = useMemo(
  () => calculateRelevance(item, viewport, userActivity),
  [item.id, viewport.currentPage, userActivity.lastInteraction]
);

// Debounce rapid updates
const debouncedLayoutChange = useDebouncedCallback(
  (layout: LayoutState) => {
    onLayoutChange?.(layout);
    saveLayoutToStorage(layout);
  },
  300
);

// Virtual scrolling for large lists
<VirtualList
  items={feedItems}
  itemHeight={80}
  overscan={5}
  renderItem={(item) => <ContextCard item={item} />}
/>
```

## Type Definitions

### Core Types

```typescript
// Layout types
type LayoutPreset = 'research' | 'review' | 'collaboration' | 'focus';

interface CustomLayout {
  name: string;
  config: LayoutConfig;
}

interface LayoutConfig {
  panels: PanelConfig[];
  globalSettings?: GlobalLayoutSettings;
}

interface PanelConfig {
  id: string;
  position: DockPosition | FloatPosition;
  size: PanelSize;
  order?: number;
}

interface GlobalLayoutSettings {
  spacing?: number;
  animationDuration?: number;
  showGrid?: boolean;
}

// Docking types
interface DockingZone {
  id: string;
  position: DockPosition;
  accepts?: string[];
  maxPanels?: number;
}

interface ResizeHandle {
  position: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
  enabled: boolean;
  minSize?: number;
  maxSize?: number;
}

// Context feed types
interface FilterState {
  types: Set<ContextItem['type']>;
  dateRange?: { start: Date; end: Date };
  authors?: string[];
  keywords?: string[];
  pageRange?: { start: number; end: number };
}

type SortStrategy = 
  | 'relevance' 
  | 'date-asc' 
  | 'date-desc' 
  | 'page-asc' 
  | 'page-desc'
  | 'type';

interface ContextAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  handler: (item: ContextItem) => void;
  disabled?: boolean;
  destructive?: boolean;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
}

// Viewport types
interface ViewportState {
  scrollTop: number;
  visiblePageRange: [number, number];
  documentHeight: number;
  viewportHeight: number;
  currentPage: number;
}

interface TextSelection {
  text: string;
  startPage: number;
  endPage: number;
  bounds: BoundingBox[];
}

// State management types
interface PanelVisibility {
  [panelId: string]: boolean;
}

interface PanelPositions {
  [panelId: string]: DockPosition | FloatPosition;
}

// Event types
interface LayoutChangeEvent {
  type: 'dock' | 'float' | 'resize' | 'reorder' | 'toggle';
  panelId: string;
  previousState: PanelState;
  newState: PanelState;
  timestamp: Date;
}

interface DragEvent {
  active: {
    id: string;
    data: any;
  };
  over?: {
    id: string;
    data: any;
  };
  delta: {
    x: number;
    y: number;
  };
}

// Utility types
type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

type Without<T, K> = Pick<T, Exclude<keyof T, K>>;

type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];
```

### Component Props Types

```typescript
// Base props for all panels
interface BasePanelProps {
  id: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  onError?: (error: Error) => void;
}

// Extended props for specific panels
interface AnnotationsPanelProps extends BasePanelProps {
  annotations: Annotation[];
  onAnnotationClick?: (annotation: Annotation) => void;
  onAnnotationEdit?: (annotation: Annotation) => void;
  onAnnotationDelete?: (annotation: Annotation) => void;
}

interface ChatPanelProps extends BasePanelProps {
  documentId: string;
  corpusId: string;
  initialMessages?: Message[];
  onMessageSent?: (message: Message) => void;
}

// Hook return types
interface LayoutHookReturn {
  layout: LayoutState;
  actions: LayoutActions;
  helpers: LayoutHelpers;
}

interface LayoutActions {
  showPanel: (panelId: string) => void;
  hidePanel: (panelId: string) => void;
  togglePanel: (panelId: string) => void;
  focusPanel: (panelId: string) => void;
  setLayout: (preset: LayoutPreset) => void;
  saveLayout: (name: string) => void;
  resetLayout: () => void;
  dockPanel: (panelId: string, position: DockPosition) => void;
  floatPanel: (panelId: string, position?: FloatPosition) => void;
  resizePanel: (panelId: string, size: PanelSize) => void;
  minimizePanel: (panelId: string) => void;
  maximizePanel: (panelId: string) => void;
}

interface LayoutHelpers {
  isPanelVisible: (panelId: string) => boolean;
  getPanelState: (panelId: string) => PanelState | null;
  canDockTo: (panelId: string, position: DockPosition) => boolean;
  getAvailableDockPositions: (panelId: string) => DockPosition[];
}
```

### Constants

```typescript
// Default values
export const DEFAULT_PANEL_SIZE: PanelSize = {
  width: '300px',
  height: '400px'
};

export const DEFAULT_ANIMATION_DURATION = 300;

export const DEFAULT_OVERSCAN_COUNT = 5;

export const PANEL_MIN_SIZE = {
  width: 200,
  height: 150
};

export const PANEL_MAX_SIZE = {
  width: 800,
  height: 600
};

// Z-index hierarchy
export const Z_INDEX = {
  BASE: 0,
  DOCKED_PANEL: 10,
  FLOATING_PANEL: 100,
  DRAGGING_PANEL: 1000,
  MODAL: 2000,
  TOOLTIP: 3000
};
``` 