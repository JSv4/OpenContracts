# Unified Content Feed

## Overview

The Unified Content Feed is a new feature that consolidates all document-related content (Notes, Annotations, Relationships, and Search Results) into a single, virtualized feed sorted by page number. This replaces the previous tab-based approach with a more streamlined experience.

## Components

### UnifiedContentFeed

The main component that aggregates and displays all content types in a virtualized list. Features:

- Aggregates notes, annotations, relationships, and search results
- Sorts by page number (default), content type, or date
- Implements virtualization for performance with large datasets
- Supports filtering by content type and text search within the feed

### SidebarControlBar

Control bar at the top of the sidebar that provides:

- Toggle between Chat mode and Feed mode
- Content type filters (Notes, Annotations, Relations, Search)
- Search input for filtering content
- Sort options (Page, Type, Date)
- **Content-specific filters**: When annotations are selected, additional filters appear:
  - Label display behavior (Always/On Hover/Hide)
  - Label selector for filtering by specific annotation labels

### ContentItemRenderer

Renders individual items in the feed using the appropriate component for each type:

- Notes: Sticky note aesthetic with markdown support
- Annotations: Uses existing HighlightItem component
- Relationships: Uses existing RelationItem component
- Search Results: Custom card design with page indicators

### FloatingDocumentInput (New)

A unified floating input that combines search and chat functionality:

- **Toggle modes**: Switch between search and chat with animated mode indicators
- **Search mode**:
  - Real-time document search with debouncing
  - Shows match count (e.g., "3 of 12")
  - Press Enter to navigate through results
- **Chat mode**:
  - Expandable textarea for longer messages
  - Auto-resizes as you type
  - Submits with Enter (Shift+Enter for new line)
- **Smart positioning**: Centered at bottom of screen, expands on interaction
- **Seamless integration**: Chat submissions automatically open the chat panel

### FloatingDocumentControls

Visualization settings that appear on hover in the document view:

- Show Only Selected annotations
- Show Bounding Boxes
- Show Structural annotations
- Positioned bottom-right with smooth expand/collapse animation

### ZoomControls

Simplified zoom-only controls replacing the search functionality previously in DocNavigation:

- Clean zoom in/out buttons with current zoom level display
- Positioned top-left of document view
- Min zoom: 50%, Max zoom: 400%

## Architecture Changes

### Separation of Concerns

1. **Feed Filters** (in sidebar): Control what content appears in the unified feed
2. **Visualization Controls** (floating over document): Control how annotations appear on the PDF
3. **Input Controls** (floating at bottom): Unified search/chat interface

### Removed Components

- **DocNavigation**: Search functionality moved to FloatingDocumentInput
- **ViewSettingsPopup**: Visualization controls moved to FloatingDocumentControls

## Usage

The unified feed is integrated into the DocumentKnowledgeBase component. When the right sidebar is open:

1. Use the toggle at the top to switch between Chat and Content Feed
2. In Feed mode, use filters to show/hide content types
3. Use the search box to filter content by text
4. Click on items to select them and navigate to their location in the document

### New Input Flow

1. Click the floating input at the bottom of the screen
2. Toggle between search (🔍) and chat (💬) modes
3. In search mode: Type to search, press Enter to navigate results
4. In chat mode: Type your message, press Enter to send and open chat panel

## Page Assignment Logic

- **Notes**: Always assigned to page 1
- **Annotations**: Use their actual page number from the annotation data
- **Relationships**: Use the minimum page number from all involved annotations
- **Search Results**: Use the start page of the search result

## Performance

The feed uses virtualization similar to the existing AnnotationList component:

- Only visible items (plus overscan) are rendered
- Row heights are measured and cached dynamically
- Smooth scrolling with requestAnimationFrame optimization

## Future Improvements

1. Add more sort options (e.g., by creator, by label)
2. Implement advanced filters (date ranges, specific users)
3. Add export functionality for filtered content
4. Support for bulk operations on multiple items
5. Voice input for chat mode
6. Command palette integration (e.g., "/" commands)
