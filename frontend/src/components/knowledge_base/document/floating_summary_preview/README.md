# Floating Summary Preview

A beautiful, unobtrusive floating widget for viewing and managing document summaries with version control.

## Architecture

### Overview

The Floating Summary Preview acts as a "picture-in-picture" view of the document's knowledge layer. It provides:

- Quick access to document summaries while viewing the document itself
- Version history with visual preview cards
- One-click switching between document and knowledge layers
- Full markdown editing capabilities

### Components

1. **FloatingSummaryPreview** - Main container component

   - Manages expanded/collapsed states
   - Handles layer switching when versions are clicked
   - Coordinates edit/history modals

2. **SummaryVersionStack** - Manages the stack of version cards

   - Displays up to 3 versions in a visually stacked arrangement
   - Supports fan-out animation on hover
   - Shows "more versions" indicator

3. **SummaryPreviewCard** - Individual version preview

   - Miniaturized markdown rendering
   - Author and timestamp metadata
   - Click to switch to knowledge layer

4. **SummaryEditorModal** - Full markdown editor

   - Live preview
   - Unsaved changes detection
   - Version tracking

5. **SummaryHistoryModal** - Version history browser
   - Full version list
   - Revert capabilities (coming soon)

### Layer Interaction

The floating summary serves as the primary way to access the knowledge layer:

- **In Document Layer**: The widget is always visible as a floating button/preview
- **Click Version**: Switches to knowledge layer to show full summary
- **View Full Button**: Switches to knowledge layer
- **Back Button**: In knowledge layer, a "Back to Document" button appears to return

### Hooks

- **useSummaryVersions** - GraphQL data management
- **useSummaryAnimation** - Animation state (expand/collapse/fan)

### Backend Integration

Requires the following GraphQL operations:

- `GET_DOCUMENT_SUMMARY_VERSIONS` - Fetch version history
- `UPDATE_DOCUMENT_SUMMARY` - Create new versions

### Permissions Model

Document summaries are **corpus-scoped**, meaning:

- Each corpus can have its own summary for the same document
- Summaries are linked to both the document AND the corpus
- Different corpuses can have different summaries for shared documents

Permission rules:

- **Creating a new summary**: User must have update permission on the corpus OR it must be a public corpus
- **Editing existing summary**: Only the original author can edit their summary versions
- **Viewing summaries**: Anyone with corpus access can view all summaries

This model allows collaborative annotation while preserving authorship:

- In public corpuses, anyone can contribute their own summary
- Each author maintains control over their own contributions
- Corpus maintainers can curate which summaries to feature

### Features

- **Glass-morphism design** with backdrop blur effects
- **Spring animations** using Framer Motion
- **Version badges** showing current version number
- **3D perspective** stack view for multiple versions
- **Miniaturized markdown** in preview cards
- **Permission-based** editing (requires update_document permission)

### Usage

```tsx
<FloatingSummaryPreview
  documentId={documentId}
  corpusId={corpusId}
  documentTitle={metadata.title}
  isVisible={true}
  onSwitchToKnowledge={() => {
    // Handle switching to knowledge layer
    setActiveLayer("knowledge");
  }}
/>
```

## Features

- **Beautiful animations**: Smooth transitions using Framer Motion
- **Version management**: Full history with diff tracking
- **Responsive design**: Adapts to different screen sizes
- **Keyboard shortcuts**: ESC to close modals
- **Auto-save detection**: Warns on unsaved changes
- **Miniaturized preview**: Scaled-down markdown rendering

## Future Enhancements

- Diff visualization between versions
- Collaborative editing indicators
- Version comparison view
- Export version history
- Keyboard navigation in history
