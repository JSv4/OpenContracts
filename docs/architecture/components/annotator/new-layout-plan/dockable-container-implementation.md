# DockableContainer Implementation Example

## Overview

The DockableContainer is a flexible panel component that can be docked to edges, floated freely, or minimized. This document provides implementation examples and best practices.

## Basic Implementation

### Component Structure

```tsx
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Resizable } from 'react-resizable-panels';
import styled from 'styled-components';

interface DockableContainerProps {
  id: string;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  
  // Position & Size
  defaultPosition?: DockPosition | FloatPosition;
  defaultSize?: PanelSize;
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
  
  // Behavior
  draggable?: boolean;
  resizable?: boolean;
  collapsible?: boolean;
  closable?: boolean;
  alwaysOnTop?: boolean;
  
  // Callbacks
  onDock?: (position: DockPosition) => void;
  onFloat?: (position: FloatPosition) => void;
  onResize?: (size: PanelSize) => void;
  onClose?: () => void;
  onFocus?: () => void;
  
  // Styling
  className?: string;
}

export const DockableContainer: React.FC<DockableContainerProps> = ({
  id,
  title,
  icon,
  children,
  defaultPosition = 'right',
  defaultSize = { width: 300, height: '100%' },
  minSize = { width: 200, height: 200 },
  maxSize = { width: 800, height: 800 },
  draggable = true,
  resizable = true,
  collapsible = true,
  closable = false,
  alwaysOnTop = false,
  onDock,
  onFloat,
  onResize,
  onClose,
  onFocus,
  className
}) => {
  const [position, setPosition] = useState<DockPosition | FloatPosition>(defaultPosition);
  const [size, setSize] = useState<PanelSize>(defaultSize);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [zIndex, setZIndex] = useState(1);
  
  const panelRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);
  
  // Determine if panel is floating
  const isFloating = typeof position === 'object' && 'x' in position;
  
  // Handle drag start
  const handleDragStart = useCallback((event: React.PointerEvent) => {
    if (!draggable || !isFloating) return;
    
    setIsDragging(true);
    onFocus?.();
    setZIndex(9999); // Bring to front while dragging
    
    const startX = event.clientX - (position as FloatPosition).x;
    const startY = event.clientY - (position as FloatPosition).y;
    
    const handleDragMove = (e: PointerEvent) => {
      const newX = e.clientX - startX;
      const newY = e.clientY - startY;
      
      // Check docking zones
      const dockZone = checkDockingZone(newX, newY, size);
      if (dockZone) {
        // Show docking preview
        showDockingPreview(dockZone);
      } else {
        hideDockingPreview();
        setPosition({ 
          x: newX, 
          y: newY,
          width: (position as FloatPosition).width,
          height: (position as FloatPosition).height
        });
      }
    };
    
    const handleDragEnd = (e: PointerEvent) => {
      setIsDragging(false);
      setZIndex(alwaysOnTop ? 9998 : 1);
      
      const finalX = e.clientX - startX;
      const finalY = e.clientY - startY;
      const dockZone = checkDockingZone(finalX, finalY, size);
      
      if (dockZone) {
        setPosition(dockZone);
        onDock?.(dockZone);
      } else {
        const finalPosition = { 
          x: finalX, 
          y: finalY,
          width: (position as FloatPosition).width,
          height: (position as FloatPosition).height
        };
        setPosition(finalPosition);
        onFloat?.(finalPosition);
      }
      
      hideDockingPreview();
      document.removeEventListener('pointermove', handleDragMove);
      document.removeEventListener('pointerup', handleDragEnd);
    };
    
    document.addEventListener('pointermove', handleDragMove);
    document.addEventListener('pointerup', handleDragEnd);
  }, [draggable, isFloating, position, size, alwaysOnTop, onDock, onFloat, onFocus]);
  
  // Handle resize
  const handleResize = useCallback((newSize: PanelSize) => {
    setSize(newSize);
    onResize?.(newSize);
  }, [onResize]);
  
  // Handle minimize/maximize
  const toggleMinimize = useCallback(() => {
    setIsMinimized(!isMinimized);
  }, [isMinimized]);
  
  // Handle close
  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);
  
  // Calculate position styles
  const getPositionStyles = (): React.CSSProperties => {
    if (isFloating) {
      const pos = position as FloatPosition;
      return {
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: pos.width || size.width,
        height: pos.height || size.height,
        zIndex
      };
    } else {
      const dock = position as DockPosition;
      switch (dock) {
        case 'left':
          return {
            position: 'fixed',
            left: 0,
            top: 0,
            width: size.width,
            height: '100%',
            zIndex
          };
        case 'right':
          return {
            position: 'fixed',
            right: 0,
            top: 0,
            width: size.width,
            height: '100%',
            zIndex
          };
        case 'top':
          return {
            position: 'fixed',
            left: 0,
            top: 0,
            width: '100%',
            height: size.height,
            zIndex
          };
        case 'bottom':
          return {
            position: 'fixed',
            left: 0,
            bottom: 0,
            width: '100%',
            height: size.height,
            zIndex
          };
        case 'center':
          return {
            position: 'relative',
            width: '100%',
            height: '100%',
            zIndex: 0
          };
      }
    }
  };
  
  return (
    <AnimatePresence>
      <Container
        ref={panelRef}
        className={className}
        style={getPositionStyles()}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ 
          opacity: 1, 
          scale: 1,
          height: isMinimized ? 40 : undefined
        }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        onClick={() => onFocus?.()}
      >
        <Header 
          ref={dragHandleRef}
          onPointerDown={handleDragStart}
          $isDragging={isDragging}
          $isFloating={isFloating}
        >
          <HeaderLeft>
            {icon && <IconWrapper>{icon}</IconWrapper>}
            <Title>{title}</Title>
          </HeaderLeft>
          <HeaderRight>
            {collapsible && (
              <ActionButton onClick={toggleMinimize}>
                {isMinimized ? '□' : '−'}
              </ActionButton>
            )}
            {isFloating && (
              <ActionButton onClick={() => {
                setPosition('right');
                onDock?.('right');
              }}>
                ⊟
              </ActionButton>
            )}
            {closable && (
              <ActionButton onClick={handleClose} $destructive>
                ×
              </ActionButton>
            )}
          </HeaderRight>
        </Header>
        
        {!isMinimized && (
          <Content>
            {resizable && isFloating ? (
              <ResizableWrapper
                minWidth={minSize.width}
                minHeight={minSize.height}
                maxWidth={maxSize.width}
                maxHeight={maxSize.height}
                width={size.width}
                height={size.height}
                onResize={(e, data) => handleResize({ 
                  width: data.size.width, 
                  height: data.size.height 
                })}
              >
                {children}
              </ResizableWrapper>
            ) : (
              children
            )}
          </Content>
        )}
      </Container>
    </AnimatePresence>
  );
};
```

### Styled Components

```tsx
const Container = styled(motion.div)`
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  
  &:focus-within {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  }
`;

const Header = styled.div<{ $isDragging: boolean; $isFloating: boolean }>`
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: ${props => props.$isFloating ? 'move' : 'default'};
  user-select: none;
  
  ${props => props.$isDragging && `
    opacity: 0.8;
  `}
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
`;

const IconWrapper = styled.div`
  display: flex;
  align-items: center;
  color: #64748b;
`;

const Title = styled.h3`
  margin: 0;
  font-size: 0.875rem;
  font-weight: 600;
  color: #1e293b;
`;

const ActionButton = styled.button<{ $destructive?: boolean }>`
  background: transparent;
  border: none;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: ${props => props.$destructive ? '#ef4444' : '#64748b'};
  transition: all 0.2s;
  
  &:hover {
    background: ${props => props.$destructive ? '#fee2e2' : '#f1f5f9'};
    color: ${props => props.$destructive ? '#dc2626' : '#475569'};
  }
`;

const Content = styled.div`
  flex: 1;
  overflow: auto;
  padding: 1rem;
`;

const ResizableWrapper = styled.div`
  width: 100%;
  height: 100%;
  position: relative;
`;
```

### Docking Zone Detection

```tsx
interface DockingZone {
  position: DockPosition;
  bounds: DOMRect;
  preview: HTMLElement;
}

const DOCK_THRESHOLD = 50; // pixels from edge

function checkDockingZone(x: number, y: number, size: PanelSize): DockPosition | null {
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  
  // Check left edge
  if (x < DOCK_THRESHOLD) {
    return 'left';
  }
  
  // Check right edge
  if (x + (typeof size.width === 'number' ? size.width : 300) > windowWidth - DOCK_THRESHOLD) {
    return 'right';
  }
  
  // Check top edge
  if (y < DOCK_THRESHOLD) {
    return 'top';
  }
  
  // Check bottom edge
  if (y + (typeof size.height === 'number' ? size.height : 300) > windowHeight - DOCK_THRESHOLD) {
    return 'bottom';
  }
  
  return null;
}

function showDockingPreview(position: DockPosition) {
  let preview = document.getElementById('docking-preview');
  if (!preview) {
    preview = document.createElement('div');
    preview.id = 'docking-preview';
    preview.style.cssText = `
      position: fixed;
      background: rgba(66, 153, 225, 0.2);
      border: 2px dashed #4299e1;
      pointer-events: none;
      transition: all 0.2s ease;
      z-index: 9999;
    `;
    document.body.appendChild(preview);
  }
  
  switch (position) {
    case 'left':
      preview.style.left = '0';
      preview.style.top = '0';
      preview.style.width = '300px';
      preview.style.height = '100%';
      break;
    case 'right':
      preview.style.right = '0';
      preview.style.left = 'auto';
      preview.style.top = '0';
      preview.style.width = '300px';
      preview.style.height = '100%';
      break;
    case 'top':
      preview.style.left = '0';
      preview.style.top = '0';
      preview.style.width = '100%';
      preview.style.height = '200px';
      break;
    case 'bottom':
      preview.style.left = '0';
      preview.style.top = 'auto';
      preview.style.bottom = '0';
      preview.style.width = '100%';
      preview.style.height = '200px';
      break;
  }
  
  preview.style.opacity = '1';
}

function hideDockingPreview() {
  const preview = document.getElementById('docking-preview');
  if (preview) {
    preview.style.opacity = '0';
    setTimeout(() => preview.remove(), 200);
  }
}
```

## Advanced Features

### Persistence

```tsx
// Save layout to localStorage
const saveLayout = (id: string, state: PanelState) => {
  const layouts = JSON.parse(localStorage.getItem('panel-layouts') || '{}');
  layouts[id] = state;
  localStorage.setItem('panel-layouts', JSON.stringify(layouts));
};

// Load layout from localStorage
const loadLayout = (id: string): PanelState | null => {
  const layouts = JSON.parse(localStorage.getItem('panel-layouts') || '{}');
  return layouts[id] || null;
};

// In component
useEffect(() => {
  const saved = loadLayout(id);
  if (saved) {
    setPosition(saved.position);
    setSize(saved.size);
    setIsMinimized(saved.minimized);
  }
}, [id]);

useEffect(() => {
  saveLayout(id, {
    id,
    position,
    size,
    visible: true,
    minimized: isMinimized,
    zIndex
  });
}, [id, position, size, isMinimized, zIndex]);
```

### Keyboard Navigation

```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (!panelRef.current?.contains(document.activeElement)) return;
    
    switch (e.key) {
      case 'Escape':
        if (isFloating) {
          setPosition('right');
          onDock?.('right');
        }
        break;
      case 'ArrowLeft':
        if (e.shiftKey && isFloating) {
          setPosition(prev => ({
            ...prev as FloatPosition,
            x: Math.max(0, (prev as FloatPosition).x - 10)
          }));
        }
        break;
      case 'ArrowRight':
        if (e.shiftKey && isFloating) {
          setPosition(prev => ({
            ...prev as FloatPosition,
            x: Math.min(window.innerWidth - 300, (prev as FloatPosition).x + 10)
          }));
        }
        break;
    }
  };
  
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [isFloating, onDock]);
```

### Animation Variants

```tsx
const panelVariants = {
  docked: {
    scale: 1,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30
    }
  },
  floating: {
    scale: 1,
    opacity: 1,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 30
    }
  },
  minimized: {
    height: 40,
    transition: {
      duration: 0.2
    }
  },
  dragging: {
    scale: 1.02,
    opacity: 0.8,
    transition: {
      duration: 0.1
    }
  }
};

// Usage
<Container
  variants={panelVariants}
  animate={
    isDragging ? 'dragging' : 
    isMinimized ? 'minimized' : 
    isFloating ? 'floating' : 'docked'
  }
/>
```

## Usage Examples

### Basic Docked Panel

```tsx
<DockableContainer
  id="annotations"
  title="Annotations"
  icon={<FileText size={16} />}
  defaultPosition="right"
  defaultSize={{ width: 300, height: '100%' }}
>
  <AnnotationList />
</DockableContainer>
```

### Floating Chat Panel

```tsx
<DockableContainer
  id="chat"
  title="Chat"
  icon={<MessageSquare size={16} />}
  defaultPosition={{ x: 100, y: 100, width: 400, height: 500 }}
  minSize={{ width: 300, height: 400 }}
  maxSize={{ width: 600, height: 800 }}
  closable
  onClose={() => console.log('Chat closed')}
>
  <ChatPanel />
</DockableContainer>
```

### Context-Aware Feed Panel

```tsx
<DockableContainer
  id="context-feed"
  title="Context Feed"
  icon={<Layers size={16} />}
  defaultPosition="right"
  defaultSize={{ width: 350, height: '100%' }}
  onDock={(position) => {
    // Update feed layout based on dock position
    if (position === 'bottom') {
      setFeedLayout('horizontal');
    } else {
      setFeedLayout('vertical');
    }
  }}
>
  <ContextFeed layout={feedLayout} />
</DockableContainer>
```

## Testing

### Component Tests

```tsx
import { render, fireEvent, waitFor } from '@testing-library/react';
import { DockableContainer } from './DockableContainer';

describe('DockableContainer', () => {
  it('should render with default props', () => {
    const { getByText } = render(
      <DockableContainer id="test" title="Test Panel">
        <div>Content</div>
      </DockableContainer>
    );
    
    expect(getByText('Test Panel')).toBeInTheDocument();
    expect(getByText('Content')).toBeInTheDocument();
  });
  
  it('should handle minimize/maximize', async () => {
    const { getByText, queryByText } = render(
      <DockableContainer id="test" title="Test Panel" collapsible>
        <div>Content</div>
      </DockableContainer>
    );
    
    const minimizeButton = getByText('−');
    fireEvent.click(minimizeButton);
    
    await waitFor(() => {
      expect(queryByText('Content')).not.toBeInTheDocument();
    });
  });
  
  it('should handle drag to dock', async () => {
    const onDock = jest.fn();
    const { getByText } = render(
      <DockableContainer 
        id="test" 
        title="Test Panel"
        defaultPosition={{ x: 400, y: 300 }}
        onDock={onDock}
      >
        <div>Content</div>
      </DockableContainer>
    );
    
    const header = getByText('Test Panel').parentElement;
    
    // Simulate drag to left edge
    fireEvent.pointerDown(header, { clientX: 400, clientY: 300 });
    fireEvent.pointerMove(document, { clientX: 10, clientY: 300 });
    fireEvent.pointerUp(document, { clientX: 10, clientY: 300 });
    
    await waitFor(() => {
      expect(onDock).toHaveBeenCalledWith('left');
    });
  });
});
```

### Playwright Tests

```typescript
import { test, expect } from '@playwright/test';

test.describe('DockableContainer', () => {
  test('should dock to all edges', async ({ page }) => {
    await page.goto('/test/dockable-container');
    
    const panel = page.locator('[data-testid="dockable-panel"]');
    const header = panel.locator('.header');
    
    // Test docking to left
    await header.dragTo(page.locator('body'), {
      targetPosition: { x: 10, y: 300 }
    });
    await expect(panel).toHaveCSS('left', '0px');
    
    // Test docking to right
    await header.dragTo(page.locator('body'), {
      targetPosition: { x: window.innerWidth - 10, y: 300 }
    });
    await expect(panel).toHaveCSS('right', '0px');
  });
  
  test('should resize when floating', async ({ page }) => {
    await page.goto('/test/dockable-container');
    
    const panel = page.locator('[data-testid="dockable-panel"]');
    const resizeHandle = panel.locator('.resize-handle-se');
    
    const initialSize = await panel.boundingBox();
    
    await resizeHandle.dragTo(page.locator('body'), {
      targetPosition: { 
        x: initialSize.x + initialSize.width + 100,
        y: initialSize.y + initialSize.height + 100
      }
    });
    
    const newSize = await panel.boundingBox();
    expect(newSize.width).toBeGreaterThan(initialSize.width);
    expect(newSize.height).toBeGreaterThan(initialSize.height);
  });
});
```

## Performance Optimization

### Memoization

```tsx
// Memoize expensive position calculations
const positionStyles = useMemo(() => getPositionStyles(), [position, size, zIndex]);

// Memoize child components
const MemoizedContent = React.memo(({ children }) => (
  <Content>{children}</Content>
), (prev, next) => prev.children === next.children);
```

### Debounced Updates

```tsx
// Debounce resize events
const debouncedResize = useDebouncedCallback((newSize: PanelSize) => {
  handleResize(newSize);
}, 100);

// Throttle drag updates
const throttledDragUpdate = useThrottledCallback((x: number, y: number) => {
  setPosition({ x, y, width: size.width, height: size.height });
}, 16); // 60fps
```

## Accessibility

```tsx
// Add ARIA attributes
<Container
  role="dialog"
  aria-label={title}
  aria-expanded={!isMinimized}
  tabIndex={-1}
>
  <Header
    role="banner"
    aria-label="Panel header"
  >
    <Title id={`${id}-title`}>{title}</Title>
    <ActionButton
      aria-label={isMinimized ? 'Maximize panel' : 'Minimize panel'}
      onClick={toggleMinimize}
    >
      {isMinimized ? '□' : '−'}
    </ActionButton>
  </Header>
  
  <Content
    role="main"
    aria-labelledby={`${id}-title`}
  >
    {children}
  </Content>
</Container>
``` 