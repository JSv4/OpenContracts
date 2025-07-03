# Annotator System: Data Flow and State Management

## Table of Contents

1. [Overview](#overview)
2. [Component Hierarchy](#component-hierarchy)
3. [State Management with Jotai](#state-management-with-jotai)
4. [Data Flow](#data-flow)
5. [Key Components](#key-components)
6. [Annotation Filtering System](#annotation-filtering-system)
7. [Performance Optimizations](#performance-optimizations)

## Overview

The Annotator system uses a modern architecture combining Jotai for state management with virtualized rendering for performance. It efficiently manages and displays annotations on PDF documents while maintaining responsive user experience even with large documents and numerous annotations.

## Component Hierarchy

```
DocumentKnowledgeBase (Data fetching & top-level state)
├── PDF (Virtualization engine)
│   └── PDFPage (Individual page renderer)
│       ├── Canvas (PDF content)
│       ├── SelectionLayer (User interactions)
│       ├── Selection (Annotation display)
│       ├── SearchResult (Search highlights)
│       └── ChatSourceResult (Chat source highlights)
├── Sidebars/Panels (UI for managing annotations)
├── ViewSettingsPopup (Annotation visibility controls)
└── LabelSelector (Active annotation label selection)
```

## State Management with Jotai

The system uses Jotai atoms for reactive state management, providing efficient updates and computed derivations:

### Core Atoms (AnnotationAtoms.tsx)

```typescript
// Primary annotation state
export const pdfAnnotationsAtom = atom<PdfAnnotations>(
  new PdfAnnotations([], [], [])
);

// Structural annotations (separate for filtering)
export const structuralAnnotationsAtom = atom<ServerTokenAnnotation[]>([]);

// Computed atom: All annotations deduplicated
export const allAnnotationsAtom = atom<(ServerTokenAnnotation | ServerSpanAnnotation)[]>((get) => {
  const { annotations } = get(pdfAnnotationsAtom);
  const structural = get(structuralAnnotationsAtom);

  // Deduplicate and combine
  const seen = new Set<string>();
  const out = [];

  for (const a of [...annotations, ...structural]) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      out.push(a);
    }
  }
  return out;
});

// Computed atom: Annotations indexed by page
export const perPageAnnotationsAtom = atom((get) => {
  const all = get(allAnnotationsAtom);
  const map = new Map<number, (ServerTokenAnnotation | ServerSpanAnnotation)[]>();

  for (const a of all) {
    const pageIdx = a.page ?? 0;
    if (!map.has(pageIdx)) map.set(pageIdx, []);
    map.get(pageIdx)!.push(a);
  }
  return map;
});
```

### UI State Atoms (UISettingsAtom.tsx)

- `zoomLevelAtom` - Current PDF zoom level
- `selectedAnnotationIdsAtom` - Currently selected annotations
- `showStructuralAtom` - Whether to show structural annotations
- `spanLabelsToViewAtom` - Which labels to display

### Document State Atoms (DocumentAtom.tsx)

- `scrollContainerRefAtom` - Reference to scrolling container
- `pendingScrollAnnotationIdAtom` - Annotation to scroll to
- `textSearchStateAtom` - Current search results and selection

## Data Flow

### 1. Initial Data Loading

```mermaid
graph TD
    A[DocumentKnowledgeBase] -->|GraphQL Query| B[GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS]
    B --> C[Process Annotations]
    C --> D[Update Jotai Atoms]
    D --> E[pdfAnnotationsAtom]
    D --> F[structuralAnnotationsAtom]
    E --> G[allAnnotationsAtom<br/>(computed)]
    F --> G
    G --> H[perPageAnnotationsAtom<br/>(computed)]
    G --> I[useVisibleAnnotations<br/>(filtered)]
    I --> J[PDFPage Components]
```

### 2. User Interactions

When a user selects an annotation:
1. `selectedAnnotationIdsAtom` is updated
2. `useVisibleAnnotations` ensures selected annotations are visible
3. PDF component expands visible range to include annotation's page
4. PDFPage scrolls the specific annotation into view

### 3. Filtering Updates

When filter settings change:
1. UI atoms (showStructural, spanLabelsToView) are updated
2. `useVisibleAnnotations` recomputes based on new filters
3. Only affected PDFPage components re-render
4. No network requests needed - all filtering is local

## Key Components

### DocumentKnowledgeBase

- **Purpose**: Top-level container managing document viewing and knowledge extraction
- **Responsibilities**:
  - Fetches document and annotation data via GraphQL
  - Initializes Jotai atoms with fetched data
  - Manages layout and panel switching
  - Coordinates between different viewing modes

### PDF Component

- **Purpose**: Implements virtualized rendering for performance
- **Key Features**:
  - Calculates visible page range using binary search
  - Manages page height caching per zoom level
  - Ensures selected items' pages are always rendered
  - Handles scroll-to-annotation coordination

### PDFPage Component

- **Purpose**: Renders individual PDF pages with annotations
- **Optimizations**:
  - Only renders when in viewport
  - Manages its own PDF rendering lifecycle
  - Filters annotations to show only those on current page
  - Handles annotation selection and creation

### useVisibleAnnotations Hook

```typescript
export function useVisibleAnnotations() {
  const allAnnotations = useAllAnnotations();
  const { showStructural } = useAnnotationDisplay();
  const { spanLabelsToView } = useAnnotationControls();
  const { selectedAnnotations, selectedRelations } = useAnnotationSelection();

  return useMemo(() => {
    // Force visibility for selected items
    const forcedIds = new Set([
      ...selectedAnnotations,
      ...selectedRelations.flatMap(r => [...r.sourceIds, ...r.targetIds])
    ]);

    // Apply filters
    return allAnnotations.filter(annot => {
      if (forcedIds.has(annot.id)) return true;
      if (annot.structural && !showStructural) return false;
      if (labelFilter && !labelFilter.has(annot.label.id)) return false;
      return true;
    });
  }, [/* dependencies */]);
}
```

## Annotation Filtering System

The system provides centralized, consistent filtering through `useVisibleAnnotations`:

1. **Forced Visibility**
   - Selected annotations always visible
   - Annotations in selected relationships always visible
   - Overrides all other filters

2. **Structural Filter**
   - Toggle visibility of structural annotations
   - When enabled, shows annotations in relationships

3. **Label Filter**
   - Filter by specific annotation labels
   - Multi-select capability
   - Only applies to non-forced annotations

4. **Page-Level Filtering**
   - PDFPage components further filter to show only annotations on their page
   - Efficient - no unnecessary rendering of off-page annotations

## Performance Optimizations

### 1. Virtualized Rendering
- Only visible PDF pages (+overscan) are rendered
- Dramatic performance improvement for large documents
- Smart range expansion for selected items

### 2. Computed Atoms
- Derivations only recalculate when dependencies change
- No manual state synchronization needed
- Automatic memoization built-in

### 3. Granular Updates
- Component-level filtering prevents unnecessary re-renders
- Page components operate independently
- Zoom changes only affect visible pages

### 4. Efficient Data Structures
- Page-indexed annotation map for O(1) lookups
- Set-based deduplication
- Binary search for visible page detection

### 5. Scroll Optimization
- RequestAnimationFrame for smooth scrolling
- Throttled scroll event handling
- Smart scroll-to-annotation with precedence system

## Best Practices

1. **Always use hooks** for accessing annotation state
   - `useAllAnnotations()` for all annotations
   - `useVisibleAnnotations()` for filtered annotations
   - `usePdfAnnotations()` for raw PdfAnnotations object

2. **Leverage computed atoms** instead of manual calculations
   - They automatically update when dependencies change
   - Provide built-in memoization

3. **Keep filtering logic centralized** in `useVisibleAnnotations`
   - Ensures consistency across all components
   - Single source of truth for visibility

4. **Use proper atom updates** to maintain immutability
   - Always create new objects/arrays when updating
   - Jotai relies on referential equality for updates
