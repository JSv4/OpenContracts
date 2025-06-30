# PDF Annotation System Overview

## Table of Contents

1. [Key Questions](#key-questions)
2. [High-level Architecture](#high-level-architecture)
3. [Layer System](#layer-system)
4. [Component Hierarchy](#component-hierarchy)
5. [Major Features](#major-features)
6. [Virtualized Rendering System](#virtualized-rendering-system)
7. [State Management](#state-management)
8. [Specific Component Deep Dives](#specific-component-deep-dives)

## Key Questions

### 1. How is the PDF loaded?
- The PDF is loaded in the `DocumentKnowledgeBase` component when it receives document data from the GraphQL query
- The component uses `pdfjs-dist` to load the PDF file specified by `document.pdfFile`
- Loading progress is tracked and displayed to the user
- Once loaded, the PDF document proxy and PAWLS parsing data are combined to create `PDFPageInfo` objects for each page

### 2. Where and how are annotations loaded?
- Annotations are loaded via the `GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS` GraphQL query in `DocumentKnowledgeBase`
- The query fetches:
  - Document metadata and file paths
  - All annotations (text and structural)
  - Document type annotations
  - Annotation relationships
  - Corpus label information
  - Document notes and relationships
  - Summary version history
- Annotations are transformed and stored in Jotai atoms:
  - `pdfAnnotationsAtom` - main annotation state
  - `structuralAnnotationsAtom` - structural annotations
  - Computed atoms like `allAnnotationsAtom` provide derived state

### 3. Where is the PAWLS layer loaded?
- PAWLS data is loaded alongside the PDF in `DocumentKnowledgeBase`
- The `getPawlsLayer` function fetches the token data from `document.pawlsParseFile`
- PAWLS data provides token-level information for each page, enabling precise text selection and annotation

## High-level Architecture

The PDF annotation system uses a sophisticated dual-layer architecture:

1. **Document Layer**: Traditional PDF/text viewing with annotations
2. **Knowledge Layer**: Summary view with version history and editing

Key architectural components:

1. **Virtualized Rendering**: Only visible pages are rendered for performance
2. **State Management with Jotai**: Centralized, reactive state management
3. **Computed Derivations**: Automatic updates when dependencies change
4. **Unified Feed System**: Combines notes, annotations, relationships in one view
5. **Summary Versioning**: Git-like version control for document summaries
6. **Resizable Panels**: Flexible layout with chat panel width management

## Layer System

The `DocumentKnowledgeBase` implements a dual-layer architecture:

### Document Layer
- PDF/text document viewing with annotations
- Search functionality
- Annotation creation and editing
- Extract and analysis results
- Traditional document interaction

### Knowledge Layer
- Document summary viewing and editing
- Version history browsing
- Markdown-based content
- Knowledge synthesis view

Users can switch between layers based on their current task, with some features (like chat) available in both layers.

## Component Hierarchy

```
DocumentKnowledgeBase
├── Layer Management (activeLayer: "knowledge" | "document")
├── Tab Navigation System
│   ├── Summary (knowledge layer)
│   ├── Chat (both layers)
│   ├── Notes (both layers)
│   ├── Relationships (both layers)
│   ├── Annotations (document layer)
│   ├── Relations (document layer)
│   ├── Search (document layer)
│   ├── Analyses (document layer)
│   └── Extracts (document layer)
├── Document Layer Components
│   ├── PDF (Virtualization Layer)
│   │   └── PDFPage (Rendered only when visible)
│   ├── TxtAnnotatorWrapper (for text files)
│   ├── FloatingDocumentControls
│   ├── FloatingDocumentInput
│   └── ZoomControls
├── Knowledge Layer Components
│   ├── UnifiedKnowledgeLayer
│   ├── VersionHistorySidebar
│   └── Markdown Editor/Viewer
├── Shared Components
│   ├── UnifiedContentFeed (feed mode)
│   ├── ChatTray
│   ├── FloatingSummaryPreview (PiP view)
│   └── UnifiedLabelSelector
└── Resizable Right Panel System
```

## Major Features

### 1. Unified Feed System

**Components**: `UnifiedContentFeed`, `SidebarControlBar` (references in `4:1940-1973` and `4:1988-2042`)

The unified feed combines multiple content types into a single, filterable view:
- Notes
- Annotations
- Relationships
- Search results

Features:
- Filter by content type
- Sort by page order or chronologically
- Seamless switching between chat mode and feed mode
- Real-time updates as content changes

### 2. Summary Version History

**Hook**: `useSummaryVersions` (referenced in `4:1704-1713`)

Git-like version control for document summaries:
- View all previous versions
- Compare changes between versions
- Create new versions when editing
- Author and timestamp tracking
- Revert to previous versions

### 3. Floating Summary Preview

**Component**: `FloatingSummaryPreview` (referenced in `4:2099-2124`)

Picture-in-picture style preview that:
- Shows current summary while in document layer
- Allows quick switching to knowledge layer
- Updates in real-time
- Can be minimized or expanded

### 4. Chat Panel Width Management

**Hook**: `useChatPanelWidth` (referenced in `4:280-291`)

Sophisticated resizable panel system:
- Preset sizes: quarter (25%), half (50%), full (90%)
- Custom width with drag handle
- Auto-minimize when hovering over document
- Persistent width preferences
- Smooth animations

### 5. Tab-based Navigation

**Array**: `allTabs` (defined in `4:1223-1272`)

Organized sidebar navigation with:
- Icons and labels for each feature
- Layer-aware tabs (some only in document layer)
- Visual indicators for active tab
- Collapsible sidebar on hover

### 6. Note Management System

**Components**: `NoteModal`, `NotesGrid`, `PostItNote` (imported in `4:147`)

Rich note-taking features:
- Sticky note visual style
- Markdown content support
- Edit and create capabilities
- Author attribution
- Chronological organization

### 7. Extract and Analysis Management

**Components**: `ExtractTraySelector`, `AnalysisTraySelector` (imported in `4:139-140`)

Document analysis features:
- Run custom analyzers on documents
- View extract results in structured format
- Create new extracts with fieldsets
- Single document results view

### 8. Floating Controls

**Components**: `FloatingDocumentControls`, `FloatingDocumentInput`, `ZoomControls`

Modern floating UI elements:
- Zoom in/out controls
- Quick chat/search input
- Document action buttons
- Context-aware visibility

## Virtualized Rendering System

The PDF component implements a sophisticated virtualization system to handle large documents efficiently:

### How It Works

1. **Page Height Calculation**
   - On mount and zoom changes, the system calculates the height of each page
   - Heights are cached per zoom level to avoid recalculation
   - A cumulative array stores the top position of each page for quick lookups

2. **Visible Range Detection**
   - The system tracks scroll position of the container
   - Binary search determines which pages intersect the viewport
   - An overscan of 2 pages is added above and below for smooth scrolling

3. **Smart Range Expansion**
   - If an annotation is selected, its page is forced to be in the visible range
   - Same logic applies for search results and chat source highlights
   - This ensures important content is always rendered when needed

4. **Absolute Positioning**
   - All pages are absolutely positioned based on cumulative heights
   - Only pages within the visible range actually render their content
   - A spacer div at the bottom maintains correct scroll height

## State Management

The system uses Jotai atoms for reactive state management:

### Core Atoms
- `pdfAnnotationsAtom` - Main annotation state
- `structuralAnnotationsAtom` - Structural annotations  
- `allAnnotationsAtom` - Computed, de-duplicated list
- `perPageAnnotationsAtom` - Page-indexed annotation map
- `selectedAnnotationIdsAtom` - Currently selected annotations
- `chatSourceStateAtom` - Chat message source tracking

### UI State
- `activeLayer` - Current layer (knowledge/document)
- `activeTab` - Currently selected tab
- `showRightPanel` - Right panel visibility
- `zoomLevel` - PDF zoom level
- `sidebarViewMode` - Chat vs feed mode

### Computed State
- Annotations automatically filter based on user preferences
- Visible pages calculate based on scroll position
- Summary versions update when changes are saved

## Specific Component Deep Dives

### DocumentKnowledgeBase.tsx

The main container component that:
- Manages the overall layout with resizable panels
- Handles data fetching via GraphQL
- Coordinates between knowledge base view and document annotation view
- Manages chat conversations, notes, and document relationships
- Controls layer switching and tab navigation
- Handles initial annotation selection from props or URL

Key responsibilities:
- Data loading and transformation (referenced in `4:419-590`)
- Panel resize management (referenced in `4:1356-1403`)
- Tab click handling (referenced in `4:1899-1924`)
- Layer switching logic
- URL parameter synchronization

### PDF.tsx

The virtualization engine that:
- Calculates which pages should be visible based on scroll position
- Manages page height calculations and caching
- Coordinates scrolling to specific annotations/search results
- Provides the container structure for all PDF pages

### PDFPage.tsx

Renders individual PDF pages when visible:
- Manages its own canvas and PDF rendering
- Displays all annotations for the page
- Handles user selection and annotation creation
- Integrates search results and chat source highlights

### UnifiedContentFeed

New component that provides a unified view of all document content:
- Combines notes, annotations, relationships, and search results
- Sortable by page order or chronologically
- Filterable by content type
- Provides consistent interaction patterns

### FloatingSummaryPreview

Picture-in-picture style component that:
- Shows document summary while in document layer
- Allows quick navigation to knowledge layer
- Displays current version information
- Can be expanded to show more content

This architecture creates a flexible, highly performant system for both document annotation and knowledge management, with smooth transitions between different viewing modes and consistent state management across the application.
