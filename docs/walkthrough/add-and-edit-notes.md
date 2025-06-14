# Adding and Editing Notes

This guide walks you through the note-taking features in OpenContracts, including creating notes, editing them, and managing version history.

## Overview

Notes in OpenContracts are markdown-based annotations that can be attached to specific locations in documents. Each note maintains a complete version history, allowing you to track changes over time and revert to previous versions if needed.

## Creating a New Note

There are two ways to create a new note:

### 1. Using the Floating Action Button
- Look for the **floating "+" button** in the bottom-right corner of the document viewer
- Click it to open the new note creation modal
- Enter a title and content for your note
- Click **Create Note** to save

### 2. From the Document Context
- Right-click on any text selection or annotation in the document
- Select **Add Note** from the context menu
- The note will be automatically linked to that location

## Editing Existing Notes

### Opening the Editor
To edit an existing note:
- **Double-click** on any note card in the knowledge base
- Or click the **edit icon** that appears when hovering over a note
- The note editor will open with the current content

### Editor Interface

The note editor provides a split-screen interface:

#### Left Panel - Markdown Editor
- Write your notes using standard Markdown syntax
- Real-time syntax highlighting
- Auto-save indicator shows when you have unsaved changes

#### Right Panel - Live Preview
- See how your markdown will be rendered
- Updates as you type
- Supports tables, lists, code blocks, and more

#### Header Information
The editor header displays:
- **Document name** - Which document this note belongs to
- **Current version** - The active version number
- **Last modified** - When the note was last updated

## Version History

### Viewing History
1. Click the **Show History** button in the editor's action bar
2. The version history panel slides out from the right
3. Each version shows:
   - Version number and status (Current/Latest)
   - Author email
   - Creation timestamp

### Exploring Versions
- Click on any version to expand and view its content
- The selected version's content appears in a preview box
- Current version is highlighted in blue
- Selected versions are highlighted in purple

### Version Actions

Each historical version offers two actions:

#### Reapply as New Version
- **One-click restoration** of a previous version
- Creates a new version with the old content
- Preserves the complete history chain
- Use when you want to quickly revert changes

#### Edit from This Version
- Loads the historical content into the editor
- Allows you to make modifications before saving
- Useful for branching from an older version
- Editor shows "Editing from v[X]" indicator

## Saving and Version Creation

### Automatic Versioning
- Every save creates a new version automatically
- No manual version management required
- Complete content snapshots preserved

### Save Indicators
- **Green dot** appears next to Save button when changes exist
- **"Unsaved changes"** badge in the header
- **Warning on close** if you have unsaved work

### Save Workflow
1. Make your changes in the editor
2. Click **Save Changes** or use keyboard shortcut
3. New version is created with your changes
4. Success toast confirms the version number
5. Version history updates automatically

## Advanced Features

### Editing from Specific Versions
When editing from a historical version:
- The editor loads that version's content
- An indicator shows which version you're editing from
- Saving creates a new version, branching from that point
- Original version remains unchanged

### Keyboard Shortcuts
- `Ctrl/Cmd + S` - Save changes
- `Esc` - Close editor (with confirmation if unsaved)

### Performance Features
- Virtualized scrolling for long content
- Responsive layout adapts to screen size
- History panel width adjusts on smaller screens

## Best Practices

1. **Write Descriptive Content**: Since notes support full Markdown, use headings, lists, and formatting to organize information clearly

2. **Regular Saves**: While the editor tracks changes, save regularly to create version checkpoints

3. **Version Exploration**: Use the version history to understand how a note evolved over time

4. **Meaningful Titles**: Choose clear, descriptive titles that help identify notes at a glance

## Troubleshooting

### Unsaved Changes Warning
If you see "Save current changes first" when trying to edit from a version:
- Save your current changes first
- Then retry the version action

### Permission Errors
- Only the note creator can edit their notes
- Contact the note owner if you need changes made

### Large Content Performance
- For very long notes, the editor uses virtualized rendering
- If experiencing lag, try breaking content into multiple notes

## Technical Details

### Storage
- Notes are stored with full version history in the database
- Each version contains a complete content snapshot

### Markdown Support
- CommonMark specification
- GitHub-flavored markdown extensions
- Safe rendering (no arbitrary HTML/scripts)

### Version Limits
- No hard limit on number of versions
- Older versions may be archived in future releases
- All versions remain accessible through the API 