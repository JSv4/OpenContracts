/**
 * Context Feed Example Implementation
 * 
 * This example demonstrates how the Context Feed component would work,
 * including viewport tracking, relevance scoring, and smooth animations.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { FixedSizeList as List } from 'react-window';
import { AnimatePresence, motion } from 'framer-motion';
import { debounce, throttle } from 'lodash';
import { 
  allAnnotationsAtom, 
  viewportAtom, 
  contextualContentAtom,
  selectedAnnotationIdAtom,
  relationshipsAtom,
  searchResultsAtom,
  notesAtom
} from '../atoms/AnnotationAtoms';

// Types
interface ContextItem {
  id: string;
  type: 'annotation' | 'relationship' | 'search' | 'note';
  pageNumber: number;
  score: number;
  distance: number;
  data: any;
  lastInteraction?: Date;
}

interface ViewportState {
  scrollTop: number;
  visiblePageRange: [number, number];
  documentHeight: number;
  viewportHeight: number;
}

// Context Feed Component
export const ContextFeed: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [filter, setFilter] = useState<ContextItem['type'] | 'all'>('all');
  const contextItems = useAtomValue(contextualContentAtom);
  const [selectedId] = useAtom(selectedAnnotationIdAtom);
  
  // Filter and sort items
  const displayItems = useMemo(() => {
    let items = contextItems;
    
    // Apply type filter
    if (filter !== 'all') {
      items = items.filter(item => item.type === filter);
    }
    
    // Sort by relevance score
    return [...items].sort((a, b) => {
      // Selected item always first
      if (a.id === selectedId) return -1;
      if (b.id === selectedId) return 1;
      
      // Then by score
      return b.score - a.score;
    });
  }, [contextItems, filter, selectedId]);
  
  return (
    <motion.div
      className="context-feed"
      initial={{ x: 320 }}
      animate={{ x: isExpanded ? 0 : 280 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <ContextFeedHeader 
        onToggle={() => setIsExpanded(!isExpanded)}
        isExpanded={isExpanded}
        filter={filter}
        onFilterChange={setFilter}
      />
      
      <div className="context-feed-content">
        <AnimatePresence mode="popLayout">
          {displayItems.length > 0 ? (
            <VirtualizedItemList items={displayItems} />
          ) : (
            <EmptyState filter={filter} />
          )}
        </AnimatePresence>
      </div>
      
      <ContextFeedFooter itemCount={displayItems.length} />
    </motion.div>
  );
};

// Virtualized list for performance
const VirtualizedItemList: React.FC<{ items: ContextItem[] }> = ({ items }) => {
  const listRef = useRef<List>(null);
  const [selectedId] = useAtom(selectedAnnotationIdAtom);
  
  // Auto-scroll to selected item
  useEffect(() => {
    if (selectedId && listRef.current) {
      const index = items.findIndex(item => item.id === selectedId);
      if (index !== -1) {
        listRef.current.scrollToItem(index, 'smart');
      }
    }
  }, [selectedId, items]);
  
  return (
    <List
      ref={listRef}
      height={window.innerHeight - 120} // Adjust based on header/footer
      itemCount={items.length}
      itemSize={80} // Estimated item height
      overscanCount={5}
      className="context-feed-list"
    >
      {({ index, style }) => (
        <div style={style}>
          <ContextFeedItem item={items[index]} />
        </div>
      )}
    </List>
  );
};

// Individual feed item
const ContextFeedItem: React.FC<{ item: ContextItem }> = ({ item }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [selectedId, setSelectedId] = useAtom(selectedAnnotationIdAtom);
  const isSelected = selectedId === item.id;
  
  const handleClick = () => {
    setSelectedId(item.id);
    // Scroll document to item's page
    scrollToPage(item.pageNumber);
  };
  
  return (
    <motion.div
      className={`context-feed-item ${item.type} ${isSelected ? 'selected' : ''}`}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      onClick={handleClick}
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="item-indicator">
        <ItemTypeIcon type={item.type} />
        <ProximityIndicator distance={item.distance} />
      </div>
      
      <div className="item-content">
        <div className="item-header">
          <span className="item-page">Page {item.pageNumber}</span>
          <span className="item-score">{item.score}</span>
        </div>
        
        <div className="item-preview">
          {renderItemPreview(item)}
        </div>
        
        {item.distance > 0 && (
          <div className="item-distance">
            {item.distance} page{item.distance > 1 ? 's' : ''} away
          </div>
        )}
      </div>
      
      {isHovered && (
        <motion.div
          className="item-actions"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <button className="action-edit">Edit</button>
          <button className="action-delete">Delete</button>
        </motion.div>
      )}
    </motion.div>
  );
};

// Viewport tracking hook
export const useViewportTracking = (containerRef: React.RefObject<HTMLElement>) => {
  const setViewport = useSetAtom(viewportAtom);
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    
    // Throttled scroll handler
    const handleScroll = throttle(() => {
      const { scrollTop, clientHeight, scrollHeight } = container;
      
      // Calculate visible page range
      const pageHeight = getAveragePageHeight();
      const firstPage = Math.floor(scrollTop / pageHeight);
      const lastPage = Math.ceil((scrollTop + clientHeight) / pageHeight);
      
      setViewport({
        scrollTop,
        visiblePageRange: [firstPage, lastPage],
        documentHeight: scrollHeight,
        viewportHeight: clientHeight,
      });
    }, 100);
    
    // Intersection Observer for precise tracking
    const pageObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            // Page entered viewport
            trackPageVisibility(entry.target, true);
          } else {
            // Page left viewport
            trackPageVisibility(entry.target, false);
          }
        });
      },
      {
        root: container,
        rootMargin: '100px', // Pre-load buffer
        threshold: [0, 0.1, 0.9, 1.0]
      }
    );
    
    // Observe all page elements
    const pages = container.querySelectorAll('.pdf-page');
    pages.forEach(page => pageObserver.observe(page));
    
    container.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial calculation
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      pageObserver.disconnect();
    };
  }, [containerRef, setViewport]);
};

// Relevance calculation hook
export const useRelevanceCalculation = () => {
  const viewport = useAtomValue(viewportAtom);
  const allAnnotations = useAtomValue(allAnnotationsAtom);
  const relationships = useAtomValue(relationshipsAtom);
  const searchResults = useAtomValue(searchResultsAtom);
  const notes = useAtomValue(notesAtom);
  
  return useMemo(() => {
    const items: ContextItem[] = [];
    
    // Process annotations
    allAnnotations.forEach(annotation => {
      const score = calculateItemRelevance(annotation, viewport);
      items.push({
        id: annotation.id,
        type: 'annotation',
        pageNumber: annotation.page,
        score: score.value,
        distance: score.distance,
        data: annotation,
        lastInteraction: annotation.lastModified,
      });
    });
    
    // Process relationships
    relationships.forEach(relationship => {
      // Calculate relevance based on connected items
      const connectedPages = [
        relationship.source.page,
        relationship.target.page
      ];
      const score = calculateMultiPageRelevance(connectedPages, viewport);
      
      items.push({
        id: relationship.id,
        type: 'relationship',
        pageNumber: Math.min(...connectedPages),
        score: score.value,
        distance: score.distance,
        data: relationship,
      });
    });
    
    // Process search results
    searchResults.forEach(result => {
      items.push({
        id: result.id,
        type: 'search',
        pageNumber: result.page,
        score: 90, // High score for active search
        distance: calculateDistance(result.page, viewport.visiblePageRange),
        data: result,
      });
    });
    
    // Process notes
    notes.forEach(note => {
      const score = note.pageRef 
        ? calculateItemRelevance(note, viewport)
        : { value: 30, distance: Infinity }; // Document-wide notes
        
      items.push({
        id: note.id,
        type: 'note',
        pageNumber: note.pageRef || 0,
        score: score.value,
        distance: score.distance,
        data: note,
        lastInteraction: note.lastModified,
      });
    });
    
    return items;
  }, [viewport, allAnnotations, relationships, searchResults, notes]);
};

// Relevance scoring function
const calculateItemRelevance = (
  item: { page: number; lastModified?: Date },
  viewport: ViewportState
): { value: number; distance: number } => {
  const [firstVisible, lastVisible] = viewport.visiblePageRange;
  let score = 0;
  let distance = 0;
  
  // Check if on visible page
  if (item.page >= firstVisible && item.page <= lastVisible) {
    score = 100;
    distance = 0;
  } else {
    // Calculate distance from viewport
    distance = item.page < firstVisible 
      ? firstVisible - item.page 
      : item.page - lastVisible;
    
    // Score based on proximity
    if (distance <= 2) {
      score = 80 - (distance * 15);
    } else if (distance <= 5) {
      score = 50 - ((distance - 2) * 5);
    } else {
      score = 20;
    }
  }
  
  // Boost for recent interaction
  if (item.lastModified) {
    const minutesAgo = (Date.now() - item.lastModified.getTime()) / 60000;
    if (minutesAgo < 5) {
      score += 20;
    } else if (minutesAgo < 30) {
      score += 10;
    }
  }
  
  return { value: Math.min(100, score), distance };
};

// Helper components
const ItemTypeIcon: React.FC<{ type: ContextItem['type'] }> = ({ type }) => {
  const icons = {
    annotation: '📝',
    relationship: '🔗',
    search: '🔍',
    note: '📌',
  };
  
  return <span className="item-icon">{icons[type]}</span>;
};

const ProximityIndicator: React.FC<{ distance: number }> = ({ distance }) => {
  if (distance === 0) {
    return <div className="proximity-indicator visible">●</div>;
  }
  
  const opacity = Math.max(0.2, 1 - (distance * 0.15));
  return (
    <div 
      className="proximity-indicator" 
      style={{ opacity }}
      title={`${distance} pages away`}
    >
      ○
    </div>
  );
};

// Render preview based on item type
const renderItemPreview = (item: ContextItem) => {
  switch (item.type) {
    case 'annotation':
      return (
        <div className="annotation-preview">
          <span className="label">{item.data.label}</span>
          <span className="text">{truncate(item.data.text, 50)}</span>
        </div>
      );
      
    case 'relationship':
      return (
        <div className="relationship-preview">
          <span className="source">{item.data.source.label}</span>
          <span className="arrow">→</span>
          <span className="target">{item.data.target.label}</span>
        </div>
      );
      
    case 'search':
      return (
        <div className="search-preview">
          <span className="match">{item.data.snippet}</span>
        </div>
      );
      
    case 'note':
      return (
        <div className="note-preview">
          {truncate(item.data.content, 60)}
        </div>
      );
  }
};

// Utility functions
const truncate = (text: string, length: number) => {
  return text.length > length ? text.slice(0, length) + '...' : text;
};

const scrollToPage = (pageNumber: number) => {
  // Implementation to scroll the document viewer to specific page
  const event = new CustomEvent('scrollToPage', { detail: { pageNumber } });
  window.dispatchEvent(event);
};

// Additional helper functions
const getAveragePageHeight = (): number => {
  // Get average height from PDF viewer state
  const pageElements = document.querySelectorAll('.pdf-page');
  if (pageElements.length === 0) return 800; // Default fallback
  
  const totalHeight = Array.from(pageElements).reduce((sum, el) => {
    return sum + el.getBoundingClientRect().height;
  }, 0);
  
  return totalHeight / pageElements.length;
};

const trackPageVisibility = (element: Element, isVisible: boolean) => {
  const pageNumber = parseInt(element.getAttribute('data-page-number') || '0');
  
  if (isVisible) {
    // Track page enter event
    analytics.track('page_entered_viewport', { pageNumber });
  } else {
    // Track page exit event
    analytics.track('page_exited_viewport', { pageNumber });
  }
};

const calculateDistance = (page: number, visibleRange: [number, number]): number => {
  const [start, end] = visibleRange;
  if (page >= start && page <= end) return 0;
  if (page < start) return start - page;
  return page - end;
};

const calculateMultiPageRelevance = (
  pages: number[], 
  viewport: ViewportState
): { value: number; distance: number } => {
  const distances = pages.map(page => 
    calculateDistance(page, viewport.visiblePageRange)
  );
  const minDistance = Math.min(...distances);
  
  // Score based on closest page
  let score = 0;
  if (minDistance === 0) {
    score = 100;
  } else if (minDistance <= 2) {
    score = 80 - (minDistance * 15);
  } else if (minDistance <= 5) {
    score = 50 - ((minDistance - 2) * 5);
  } else {
    score = 20;
  }
  
  return { value: score, distance: minDistance };
};

// Mock analytics object for tracking
const analytics = {
  track: (event: string, properties: any) => {
    console.log(`Analytics: ${event}`, properties);
    // In real implementation, send to analytics service
  }
}; 