# Accessibility Guide for DocumentKnowledgeBase Layout System

## Overview

This guide outlines accessibility requirements and implementation strategies for the new flexible layout system. Our goal is to ensure the interface is usable by everyone, regardless of their abilities or the assistive technologies they use.

## WCAG 2.1 AA Compliance

We target WCAG 2.1 Level AA compliance as our baseline, with some AAA features where feasible.

## Key Accessibility Features

### 1. Keyboard Navigation

#### Full Keyboard Access
All interactive elements must be keyboard accessible without requiring a mouse.

```typescript
// Keyboard navigation map
export const KEYBOARD_SHORTCUTS = {
  // Global shortcuts
  'Ctrl+Shift+F': 'Toggle context feed',
  'Ctrl+Shift+C': 'Toggle chat panel',
  'Ctrl+Shift+L': 'Cycle layout presets',
  'Ctrl+Shift+?': 'Show keyboard shortcuts',
  
  // Panel navigation
  'F6': 'Move focus to next panel',
  'Shift+F6': 'Move focus to previous panel',
  'Ctrl+M': 'Minimize/restore focused panel',
  'Ctrl+X': 'Maximize/restore focused panel',
  
  // Within panels
  'Tab': 'Next focusable element',
  'Shift+Tab': 'Previous focusable element',
  'Arrow Keys': 'Navigate within lists/grids',
  'Enter/Space': 'Activate element',
  'Escape': 'Close dialog/cancel operation',
  
  // Drag and drop alternatives
  'Ctrl+Arrow': 'Move panel in direction',
  'Ctrl+Shift+Arrow': 'Resize panel in direction',
  'Alt+D': 'Open dock menu for focused panel',
};
```

#### Focus Management
```typescript
// Focus trap for modal dialogs
const useFocusTrap = (containerRef: RefObject<HTMLElement>) => {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };
    
    container.addEventListener('keydown', handleKeyDown);
    firstElement?.focus();
    
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, [containerRef]);
};
```

### 2. Screen Reader Support

#### ARIA Landmarks
```tsx
<div role="application" aria-label="Document Knowledge Base">
  <header role="banner" aria-label="Document header">
    {/* Header content */}
  </header>
  
  <nav role="navigation" aria-label="Main panels">
    {/* Tab navigation */}
  </nav>
  
  <main role="main" aria-label="Document viewer">
    {/* PDF/text viewer */}
  </main>
  
  <aside role="complementary" aria-label="Context feed">
    {/* Context feed panel */}
  </aside>
</div>
```

#### Live Regions for Updates
```tsx
// Announce layout changes
<div 
  role="status" 
  aria-live="polite" 
  aria-atomic="true"
  className="sr-only"
>
  {layoutChangeMessage}
</div>

// Announce drag operations
<div 
  role="status" 
  aria-live="assertive" 
  aria-atomic="true"
  className="sr-only"
>
  {dragOperationMessage}
</div>
```

#### Descriptive Labels
```tsx
<DockablePanel
  id="annotations"
  aria-label="Annotations panel"
  aria-describedby="annotations-help"
>
  <span id="annotations-help" className="sr-only">
    Contains all document annotations. Use arrow keys to navigate.
  </span>
  {/* Panel content */}
</DockablePanel>
```

### 3. Visual Accessibility

#### Color Contrast
- Text: minimum 4.5:1 contrast ratio
- Large text: minimum 3:1 contrast ratio
- Interactive elements: minimum 3:1 contrast ratio

```css
/* High contrast mode support */
@media (prefers-contrast: high) {
  .panel {
    border: 2px solid currentColor;
  }
  
  .panel-header {
    background: Canvas;
    color: CanvasText;
    border-bottom: 1px solid currentColor;
  }
  
  .button {
    border: 2px solid ButtonText;
    background: ButtonFace;
    color: ButtonText;
  }
}
```

#### Focus Indicators
```css
/* Visible focus indicators */
*:focus {
  outline: none;
}

*:focus-visible {
  outline: 3px solid #4A90E2;
  outline-offset: 2px;
}

/* Custom focus styles for different elements */
.panel:focus-within {
  box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.3);
}

.draggable-handle:focus {
  background-color: #E3F2FD;
}
```

### 4. Motion and Animation

#### Reduced Motion Support
```typescript
const useReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
  
  return prefersReducedMotion;
};

// Usage in components
const prefersReducedMotion = useReducedMotion();

<motion.div
  animate={prefersReducedMotion ? false : { x: position.x }}
  transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3 }}
>
  {/* Content */}
</motion.div>
```

### 5. Drag and Drop Accessibility

#### Keyboard Alternatives
```typescript
const useKeyboardDrag = (panelId: string) => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!e.ctrlKey) return;
    
    const step = e.shiftKey ? 50 : 10; // Larger steps with Shift
    
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        movePanel(panelId, { x: 0, y: -step });
        announcePosition(panelId);
        break;
      case 'ArrowDown':
        e.preventDefault();
        movePanel(panelId, { x: 0, y: step });
        announcePosition(panelId);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        movePanel(panelId, { x: -step, y: 0 });
        announcePosition(panelId);
        break;
      case 'ArrowRight':
        e.preventDefault();
        movePanel(panelId, { x: step, y: 0 });
        announcePosition(panelId);
        break;
    }
  };
  
  return { handleKeyDown };
};
```

#### Screen Reader Announcements
```typescript
// DND-Kit accessibility configuration
const announcements = {
  onDragStart(id: string) {
    return `Picked up ${getPanelName(id)}. Use arrow keys to move.`;
  },
  onDragOver(id: string, overId: string) {
    if (overId) {
      return `${getPanelName(id)} is over ${getDropZoneName(overId)}`;
    }
    return `${getPanelName(id)} is not over a drop zone`;
  },
  onDragEnd(id: string, overId: string) {
    if (overId) {
      return `${getPanelName(id)} dropped in ${getDropZoneName(overId)}`;
    }
    return `${getPanelName(id)} dropped`;
  },
  onDragCancel(id: string) {
    return `Drag cancelled. ${getPanelName(id)} returned to original position`;
  },
};
```

### 6. Form Accessibility

#### Label Association
```tsx
<div className="form-group">
  <label htmlFor="search-input" id="search-label">
    Search annotations
  </label>
  <input
    id="search-input"
    type="search"
    aria-labelledby="search-label"
    aria-describedby="search-help"
    aria-autocomplete="list"
    aria-controls="search-results"
  />
  <span id="search-help" className="help-text">
    Type to search through all annotations
  </span>
</div>
```

#### Error Handling
```tsx
<input
  aria-invalid={hasError}
  aria-errormessage="email-error"
  aria-describedby={hasError ? "email-error" : "email-help"}
/>
{hasError && (
  <span id="email-error" role="alert" aria-live="polite">
    Please enter a valid email address
  </span>
)}
```

### 7. Testing Checklist

#### Automated Testing
- [ ] axe-core integration in Playwright tests
- [ ] ESLint a11y plugin configured
- [ ] Color contrast validation
- [ ] ARIA attribute validation

#### Manual Testing
- [ ] Keyboard-only navigation
- [ ] Screen reader testing (NVDA, JAWS, VoiceOver)
- [ ] 200% zoom functionality
- [ ] High contrast mode
- [ ] Reduced motion preferences
- [ ] Focus order verification

#### Screen Reader Testing Matrix
| Feature | NVDA | JAWS | VoiceOver | TalkBack |
|---------|------|------|-----------|----------|
| Panel navigation | ✓ | ✓ | ✓ | ✓ |
| Drag announcements | ✓ | ✓ | ✓ | ✓ |
| Context feed | ✓ | ✓ | ✓ | ✓ |
| Form inputs | ✓ | ✓ | ✓ | ✓ |

### 8. Implementation Examples

#### Accessible Panel Header
```tsx
const PanelHeader: React.FC<PanelHeaderProps> = ({ 
  title, 
  panelId, 
  isMinimized 
}) => {
  return (
    <div 
      className="panel-header"
      role="heading"
      aria-level={2}
    >
      <button
        className="drag-handle"
        aria-label={`Move ${title} panel`}
        aria-describedby={`${panelId}-drag-help`}
        tabIndex={0}
      >
        <span aria-hidden="true">⋮⋮</span>
      </button>
      
      <span className="panel-title">{title}</span>
      
      <div className="panel-controls" role="group" aria-label="Panel controls">
        <button
          aria-label={isMinimized ? `Expand ${title}` : `Minimize ${title}`}
          aria-pressed={isMinimized}
        >
          <span aria-hidden="true">{isMinimized ? '□' : '−'}</span>
        </button>
      </div>
      
      <span id={`${panelId}-drag-help`} className="sr-only">
        Press Space to start dragging, use arrow keys to move, 
        press Space again to drop
      </span>
    </div>
  );
};
```

#### Accessible Context Feed Item
```tsx
const ContextFeedItem: React.FC<ItemProps> = ({ item, index }) => {
  return (
    <article
      className="feed-item"
      aria-label={`${item.type} on page ${item.pageNumber}`}
      aria-posinset={index + 1}
      aria-setsize={totalItems}
      tabIndex={0}
      role="listitem"
    >
      <div className="item-header">
        <span className="item-type" aria-label={`Type: ${item.type}`}>
          <ItemIcon type={item.type} aria-hidden="true" />
        </span>
        <span className="item-location">
          Page {item.pageNumber}
        </span>
        {item.distance > 0 && (
          <span 
            className="item-distance" 
            aria-label={`${item.distance} pages away from current view`}
          >
            {item.distance} pages away
          </span>
        )}
      </div>
      
      <div className="item-content">
        {item.content}
      </div>
      
      <div className="item-actions" role="group" aria-label="Item actions">
        <button aria-label={`Edit ${item.type}`}>Edit</button>
        <button aria-label={`Delete ${item.type}`}>Delete</button>
      </div>
    </article>
  );
};
```

## Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM Screen Reader Testing](https://webaim.org/articles/screenreader_testing/)
- [DND-Kit Accessibility](https://docs.dndkit.com/guides/accessibility)

## Compliance Statement

This layout system is designed to meet WCAG 2.1 Level AA standards. We are committed to maintaining and improving accessibility. If you encounter any barriers, please report them through our issue tracker. 