# PDF Annotation System Overview

## Table of Contents

1. [Key Questions](#key-questions)
2. [High-level Architecture](#high-level-architecture)
3. [Virtualized Rendering System](#virtualized-rendering-system)
4. [Component Hierarchy](#component-hierarchy)
5. [Specific Component Deep Dives](#specific-component-deep-dives)

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
- Annotations are transformed and stored in Jotai atoms:
  - `pdfAnnotationsAtom` - main annotation state
  - `structuralAnnotationsAtom` - structural annotations
  - Computed atoms like `allAnnotationsAtom` provide derived state

### 3. Where is the PAWLS layer loaded?
- PAWLS data is loaded alongside the PDF in `DocumentKnowledgeBase`
- The `getPawlsLayer` function fetches the token data from `document.pawlsParseFile`
- PAWLS data provides token-level information for each page, enabling precise text selection and annotation

## High-level Architecture

The PDF annotation system uses a sophisticated architecture combining:

1. **Virtualized Rendering**: Only visible pages are rendered for performance
2. **State Management with Jotai**: Centralized, reactive state management
3. **Computed Derivations**: Automatic updates when dependencies change
4. **Unified Filtering**: Single source of truth for annotation visibility

### Core Components

- **DocumentKnowledgeBase**: Top-level component managing document viewing and knowledge extraction
- **PDF**: Implements virtualized page rendering and scroll management
- **PDFPage**: Renders individual pages with annotations when visible
- **Annotation State**: Managed through Jotai atoms with automatic derivations
- **Filtering System**: `useVisibleAnnotations` provides consistent filtering logic

## Virtualized Rendering System

The PDF component implements a sophisticated virtualization system to handle large documents efficiently:

### How It Works

1. **Page Height Calculation**
   - On mount and zoom changes, the system calculates the height of each page
   - Heights are cached per zoom level to avoid recalculation
   - A cumulative array stores the top position of each page for quick lookups

2. **Visible Range Detection**
   - The system tracks scroll position of the container (or window)
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

### Code Example

```typescript
// The visible range calculation in PDF.tsx
const calcRange = useCallback(() => {
  const scroll = /* get scroll position */;
  const viewH = /* get viewport height */;
  
  // Binary search for first/last visible pages
  // Add overscan for smooth scrolling
  const overscan = 2;
  let start = Math.max(0, firstVisible - overscan);
  let end = Math.min(pageCount - 1, lastVisible + overscan);
  
  // Ensure selected annotation's page is included
  if (selectedPageIdx !== undefined) {
    start = Math.min(start, selectedPageIdx);
    end = Math.max(end, selectedPageIdx);
  }
  
  setRange([start, end]);
}, [/* dependencies */]);
```

## Component Hierarchy

```
DocumentKnowledgeBase
├── PDF (Virtualization Layer)
│   └── PDFPage (Rendered only when visible)
│       ├── Canvas (PDF content)
│       ├── SelectionLayer (User interactions)
│       ├── Selection (Annotation display)
│       ├── SearchResult (Search highlights)
│       └── ChatSourceResult (Chat source highlights)
├── ViewSettingsPopup (Annotation filters)
├── LabelSelector (Active annotation label)
└── Various Sidebars/Panels
```

## Specific Component Deep Dives

### DocumentKnowledgeBase.tsx

The main container component that:
- Manages the overall layout with resizable panels
- Handles data fetching via GraphQL
- Coordinates between knowledge base view and document annotation view
- Manages chat conversations, notes, and document relationships

Key features:
- Resizable right panel for chat/notes/annotations
- Layer switching between "knowledge" and "document" views
- Integration with LLM chat functionality
- Document analysis and extract management

### PDF.tsx

The virtualization engine that:
- Calculates which pages should be visible based on scroll position
- Manages page height calculations and caching
- Coordinates scrolling to specific annotations/search results
- Provides the container structure for all PDF pages

Key algorithms:
- Binary search for visible page detection
- Cumulative height arrays for positioning
- Smart range expansion for selected items
- Scroll event throttling with requestAnimationFrame

### PDFPage.tsx

Renders individual PDF pages when visible:
- Manages its own canvas and PDF rendering
- Displays all annotations for the page
- Handles user selection and annotation creation
- Integrates search results and chat source highlights

Performance optimizations:
- Only renders when in viewport
- Caches rendered content at current zoom level
- Efficiently updates when zoom changes
- Manages its own lifecycle independently

### State Management with Jotai

The annotation system uses Jotai atoms for state management:

```typescript
// Core atoms in AnnotationAtoms.tsx
pdfAnnotationsAtom          // Main annotation state
structuralAnnotationsAtom   // Structural annotations
allAnnotationsAtom         // Computed: all annotations deduplicated
perPageAnnotationsAtom     // Computed: annotations indexed by page

// The atoms automatically update when dependencies change
```

### Filtering System

The `useVisibleAnnotations` hook provides centralized filtering:

1. **Forced Visibility**: Selected annotations and those in relationships
2. **Structural Filter**: Show/hide structural annotations
3. **Label Filter**: Filter by annotation labels
4. **Consistent Logic**: Same filtering everywhere in the app

This ensures that annotation visibility is consistent across all components and views.

### Scroll-to-Annotation System

The system implements a sophisticated two-phase approach for scrolling to annotations on load:

1. **Phase 1**: Page-level scrolling ensures the target page is visible
2. **Phase 2**: Element-level scrolling centers the specific annotation

See [scroll-to-annotation-flow.md](./scroll-to-annotation-flow.md) for detailed documentation of this system. 