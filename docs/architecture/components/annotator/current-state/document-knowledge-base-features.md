# DocumentKnowledgeBase Advanced Features

This document details the advanced features implemented in `DocumentKnowledgeBase.tsx` that extend beyond basic PDF annotation functionality.

## Table of Contents

1. [Dual-Layer Architecture](#dual-layer-architecture)
2. [Unified Content Feed](#unified-content-feed)
3. [Summary Version History](#summary-version-history)
4. [Resizable Panel System](#resizable-panel-system)
5. [Floating UI Components](#floating-ui-components)
6. [Tab Navigation System](#tab-navigation-system)
7. [Note Management](#note-management)
8. [Integration Points](#integration-points)

## Dual-Layer Architecture

The DocumentKnowledgeBase implements a sophisticated dual-layer system that allows users to switch between two distinct viewing modes:

### Document Layer
The traditional annotation-focused view that includes:
- PDF/text document rendering with virtualization
- Annotation creation, editing, and filtering
- Search functionality with text highlighting
- Extract and analysis results display
- Real-time collaboration features

### Knowledge Layer
A summary-focused view designed for knowledge synthesis:
- Markdown-based document summaries
- Version history with Git-like branching
- Rich text editing capabilities
- Author attribution and timestamps
- Clean reading experience without distractions

### Layer Switching Logic

```typescript
// Layer state management (referenced in 4:270)
const [activeLayer, setActiveLayer] = useState<"knowledge" | "document">("document");

// Automatic layer switching based on user actions (4:382-388)
useEffect(() => {
  if (selectedAnalysis || (selectedAnnotations?.length ?? 0) > 0) {
    setActiveLayer("document");
  }
}, [selectedAnalysis, selectedAnnotations]);
```

The system intelligently switches layers based on context:
- Selecting an annotation switches to document layer
- Clicking summary tab switches to knowledge layer
- Some tabs (like chat) maintain the current layer

## Unified Content Feed

The unified feed system (`UnifiedContentFeed` component) provides a consolidated view of all document-related content:

### Features
- **Multi-content type support**: Notes, annotations, relationships, search results
- **Advanced filtering**: Filter by content type, structural annotations, relationship types
- **Flexible sorting**: By page order or chronological order
- **Real-time updates**: Content updates immediately when changes occur
- **Consistent UI**: Unified interaction patterns across content types

### Implementation Details

```typescript
// Feed state management (4:1940-1949)
const [sidebarViewMode, setSidebarViewMode] = useState<SidebarViewMode["mode"]>("chat");
const [feedFilters, setFeedFilters] = useState<ContentFilters>({
  contentTypes: new Set(["note", "annotation", "relationship", "search"]),
  annotationFilters: { showStructural: false },
  relationshipFilters: { showStructural: false },
});
const [feedSortBy, setFeedSortBy] = useState<SortOption>("page");
```

### Control Bar
The `SidebarControlBar` provides UI controls for:
- Switching between chat and feed modes
- Managing content filters
- Changing sort order
- Indicating active search state

## Summary Version History

The summary versioning system provides Git-like version control for document summaries:

### Core Features
- **Version tracking**: Each edit creates a new version with incrementing numbers
- **Author attribution**: Tracks who made each change with email and timestamp
- **Content snapshots**: Full content stored for each version
- **Diff generation**: Changes tracked between versions
- **Version browsing**: UI to view and switch between versions

### Implementation

```typescript
// Version management hook usage (4:1704-1713)
const {
  versions: summaryVersions,
  currentVersion: currentSummaryVersion,
  currentContent: currentSummaryContentFromHook,
  loading: summaryLoading,
  updateSummary,
  refetch: refetchSummary,
} = useSummaryVersions(documentId, corpusId);
```

### Version History UI
- Collapsible sidebar showing all versions
- Visual indicators for current version
- Metadata display (author, timestamp)
- One-click version switching
- Warning when viewing historical versions

## Resizable Panel System

The chat panel implements sophisticated width management:

### Width Modes
- **Quarter** (25%): Compact view for minimal distraction
- **Half** (50%): Standard balanced view
- **Full** (90%): Wide view for detailed chat conversations
- **Custom**: User-defined width via drag handle

### Advanced Features

```typescript
// Width management hook (4:280-291)
const {
  mode,
  customWidth,
  autoMinimize,
  setMode,
  setCustomWidth,
  toggleAutoMinimize,
  minimize,
  restore,
} = useChatPanelWidth();
```

### Auto-minimize Behavior
- Panel minimizes when user hovers over document
- Restores when hovering back over panel
- Can be toggled on/off via settings menu
- Smooth animations for all transitions

### Resize Handle Implementation
- Drag handle for manual resizing
- Snap-to-preset functionality
- Real-time width preview during drag
- Persistent width preferences

## Floating UI Components

Several floating components enhance the user experience:

### FloatingSummaryPreview
Picture-in-picture style preview that:
- Shows summary while in document layer
- Allows quick context switching
- Expandable/collapsible design
- Real-time content updates
- Smart positioning to avoid overlap

### FloatingDocumentControls
Contextual action buttons that:
- Float over the document
- Show/hide based on current layer
- Provide quick access to common actions
- Maintain consistent positioning

### FloatingDocumentInput
Unified input for chat and search:
- Toggle between chat and search modes
- Submit messages directly to chat
- Quick search functionality
- Keyboard shortcuts support

### ZoomControls
Simple zoom interface:
- Zoom in/out buttons
- Current zoom level display
- Smooth zoom transitions
- Keyboard shortcuts (Ctrl +/-)

## Tab Navigation System

The sidebar implements a sophisticated tab system:

### Tab Configuration

```typescript
// Tab definitions with layer associations (4:1223-1272)
const allTabs: NavTab[] = [
  { key: "summary", label: "Summary View", icon: <BookOpen />, layer: "knowledge" },
  { key: "chat", label: "Chat", icon: <MessageSquare />, layer: "both" },
  { key: "notes", label: "Notes", icon: <Notebook />, layer: "both" },
  // ... more tabs
];
```

### Features
- **Layer-aware tabs**: Some tabs only available in specific layers
- **Collapsible sidebar**: Hover to expand, auto-collapse when not in use
- **Visual feedback**: Active tab highlighting and hover effects
- **Smart panel management**: Right panel shows/hides based on tab selection

## Note Management

The note system provides rich functionality for document annotations:

### Components
- **NoteModal**: View/edit individual notes
- **NotesGrid**: Sticky note style grid layout
- **PostItNote**: Individual note display with animations
- **NoteEditor**: Rich text editing interface
- **NewNoteModal**: Note creation interface

### Features
- Markdown content support via `SafeMarkdown`
- Double-click to edit functionality
- Author and timestamp tracking
- Visual sticky note aesthetic
- Smooth animations and transitions

## Integration Points

### GraphQL Data Loading
The component uses a comprehensive query to load all necessary data:

```typescript
// Main data query (4:646-697)
const { data: combinedData, loading, error: queryError, refetch } = useQuery<
  GetDocumentKnowledgeAndAnnotationsOutput,
  GetDocumentKnowledgeAndAnnotationsInput
>(GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS, {
  variables: { documentId, corpusId, analysisId: undefined },
  // ... configuration
});
```

### URL Synchronization
- Annotation selection synced with URL parameters
- Deep linking support for specific annotations
- Browser back/forward navigation support

### Global State Updates
- Updates Jotai atoms for application-wide state
- Maintains cache consistency
- Triggers re-renders only where necessary

### Permission Management
- Integrates with permission system
- Shows/hides features based on user rights
- Graceful degradation for limited permissions

This architecture creates a comprehensive document management system that goes beyond simple PDF annotation, providing rich knowledge management capabilities while maintaining high performance and user experience standards. 