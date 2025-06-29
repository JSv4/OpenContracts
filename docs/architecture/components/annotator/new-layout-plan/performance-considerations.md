# Performance Considerations for New Layout System

## Executive Summary

The new layout system introduces significant complexity with drag-and-drop, real-time context feeds, and dynamic panel management. This document outlines performance considerations, optimization strategies, and monitoring approaches to ensure the system maintains excellent performance even with large documents and many annotations.

## Performance Goals

### Target Metrics
- **Initial Load**: < 1 second to interactive
- **Layout Changes**: < 100ms response time
- **Panel Drag/Resize**: 60fps (16ms per frame)
- **Context Feed Updates**: < 50ms for relevance calculation
- **Memory Usage**: < 200MB baseline, < 500MB with large documents
- **CPU Usage**: < 30% during idle, < 60% during interactions

### User Experience Targets
- No perceptible lag during interactions
- Smooth animations and transitions
- Instant feedback for all actions
- Stable performance with 1000+ annotations
- Efficient handling of 500+ page PDFs

## Critical Performance Areas

### 1. Layout Rendering

#### Challenge
Multiple panels with complex layouts can cause expensive reflows and repaints.

#### Optimization Strategies

```typescript
// Use CSS containment to isolate layout changes
const PanelContainer = styled.div`
  contain: layout style paint;
  will-change: transform;
`;

// Use transform instead of position for animations
const animatePanel = (panel: HTMLElement, x: number, y: number) => {
  panel.style.transform = `translate3d(${x}px, ${y}px, 0)`;
};

// Batch DOM updates
const batchedUpdates = unstable_batchedUpdates || ((fn) => fn());

const updateMultiplePanels = (updates: PanelUpdate[]) => {
  batchedUpdates(() => {
    updates.forEach(update => {
      updatePanel(update.id, update.state);
    });
  });
};

// Use ResizeObserver with debouncing
const useResizeObserver = (ref: RefObject<HTMLElement>, callback: (entry: ResizeObserverEntry) => void) => {
  const debouncedCallback = useDebouncedCallback(callback, 100);
  
  useEffect(() => {
    if (!ref.current) return;
    
    const observer = new ResizeObserver((entries) => {
      entries.forEach(debouncedCallback);
    });
    
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, debouncedCallback]);
};
```

### 2. Context Feed Performance

#### Challenge
Calculating relevance for hundreds of items in real-time can block the UI thread.

#### Optimization Strategies

```typescript
// Web Worker for relevance calculation
// relevance-worker.ts
self.addEventListener('message', (e) => {
  const { items, viewport, factors } = e.data;
  
  const scored = items.map(item => ({
    ...item,
    relevance: calculateRelevance(item, viewport, factors)
  }));
  
  self.postMessage(scored);
});

// Main thread
const relevanceWorker = new Worker('/relevance-worker.js');

const calculateRelevanceAsync = (items: ContextItem[], viewport: ViewportContext) => {
  return new Promise<ContextItem[]>((resolve) => {
    relevanceWorker.postMessage({ items, viewport, factors });
    relevanceWorker.onmessage = (e) => resolve(e.data);
  });
};

// Virtual scrolling for feed
import { VirtualList } from '@tanstack/react-virtual';

const ContextFeedList = ({ items }: { items: ContextItem[] }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // Estimated item height
    overscan: 5
  });
  
  return (
    <div ref={parentRef} style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`
            }}
          >
            <ContextCard item={items[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
};

// Memoize expensive calculations
const memoizedRelevance = memoizeOne(
  (item: ContextItem, viewport: ViewportContext) => 
    calculateRelevance(item, viewport),
  (newArgs, lastArgs) => 
    newArgs[0].id === lastArgs[0].id &&
    newArgs[1].currentPage === lastArgs[1].currentPage
);
```

### 3. State Management Optimization

#### Challenge
Frequent state updates can cause unnecessary re-renders across the component tree.

#### Optimization Strategies

```typescript
// Split atoms to minimize re-renders
export const layoutAtoms = {
  // Separate atoms for different aspects
  panelPositions: atom<Record<string, Position>>({}),
  panelSizes: atom<Record<string, Size>>({}),
  panelVisibility: atom<Record<string, boolean>>({}),
  activePanel: atom<string | null>(null)
};

// Use atom families for panel-specific state
export const panelStateFamily = atomFamily(
  (panelId: string) => atom({
    position: 'right',
    size: { width: 300, height: '100%' },
    visible: true,
    minimized: false
  })
);

// Selective subscriptions
const usePanelPosition = (panelId: string) => {
  const positionAtom = useMemo(
    () => atom((get) => get(layoutAtoms.panelPositions)[panelId]),
    [panelId]
  );
  return useAtom(positionAtom);
};

// Batched updates
const updateLayout = useCallback((updates: LayoutUpdate[]) => {
  unstable_batchedUpdates(() => {
    updates.forEach(({ type, panelId, value }) => {
      switch (type) {
        case 'position':
          setPanelPositions(prev => ({ ...prev, [panelId]: value }));
          break;
        case 'size':
          setPanelSizes(prev => ({ ...prev, [panelId]: value }));
          break;
        case 'visibility':
          setPanelVisibility(prev => ({ ...prev, [panelId]: value }));
          break;
      }
    });
  });
}, [setPanelPositions, setPanelSizes, setPanelVisibility]);
```

### 4. Memory Management

#### Challenge
Long-running sessions can accumulate memory from event listeners, cached data, and retained references.

#### Optimization Strategies

```typescript
// Cleanup hooks
const useCleanup = () => {
  const cleanupFns = useRef<(() => void)[]>([]);
  
  const registerCleanup = useCallback((fn: () => void) => {
    cleanupFns.current.push(fn);
  }, []);
  
  useEffect(() => {
    return () => {
      cleanupFns.current.forEach(fn => fn());
      cleanupFns.current = [];
    };
  }, []);
  
  return registerCleanup;
};

// Memory-efficient caching
class LRUCache<T> {
  private cache = new Map<string, { value: T; timestamp: number }>();
  private maxSize: number;
  private maxAge: number;
  
  constructor(maxSize = 100, maxAge = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.maxAge = maxAge;
  }
  
  set(key: string, value: T) {
    // Remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldest = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp)[0];
      this.cache.delete(oldest[0]);
    }
    
    this.cache.set(key, { value, timestamp: Date.now() });
  }
  
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Check if expired
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }
  
  clear() {
    this.cache.clear();
  }
}

const relevanceCache = new LRUCache<number>(1000, 30000); // 1000 items, 30s TTL

// Weak references for DOM elements
const elementCache = new WeakMap<HTMLElement, CachedData>();

// Periodic cleanup
useEffect(() => {
  const cleanup = setInterval(() => {
    // Clear old cache entries
    relevanceCache.clear();
    
    // Force garbage collection hint
    if ('gc' in window) {
      (window as any).gc();
    }
  }, 5 * 60 * 1000); // Every 5 minutes
  
  return () => clearInterval(cleanup);
}, []);
```

### 5. Animation Performance

#### Challenge
Complex animations during panel transitions can cause jank.

#### Optimization Strategies

```typescript
// Use CSS animations where possible
const optimizedTransition = css`
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
  
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

// RAF for smooth animations
const animateWithRAF = (
  element: HTMLElement,
  from: Position,
  to: Position,
  duration: number
) => {
  const start = performance.now();
  
  const animate = (now: number) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = easeOutCubic(progress);
    
    const x = from.x + (to.x - from.x) * eased;
    const y = from.y + (to.y - from.y) * eased;
    
    element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };
  
  requestAnimationFrame(animate);
};

// Disable animations during rapid updates
const useReducedMotion = () => {
  const [reducedMotion, setReducedMotion] = useState(false);
  const lastInteraction = useRef(Date.now());
  
  useEffect(() => {
    const checkMotion = () => {
      const now = Date.now();
      const timeSinceLastInteraction = now - lastInteraction.current;
      
      // Reduce motion if many interactions in short time
      if (timeSinceLastInteraction < 100) {
        setReducedMotion(true);
        setTimeout(() => setReducedMotion(false), 1000);
      }
      
      lastInteraction.current = now;
    };
    
    window.addEventListener('pointermove', checkMotion);
    return () => window.removeEventListener('pointermove', checkMotion);
  }, []);
  
  return reducedMotion;
};
```

## Monitoring and Profiling

### Performance Monitoring Setup

```typescript
// Performance observer
const performanceObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.entryType === 'measure') {
      console.log(`${entry.name}: ${entry.duration}ms`);
      
      // Send to analytics
      if (window.analytics) {
        window.analytics.track('Performance Metric', {
          metric: entry.name,
          duration: entry.duration,
          timestamp: entry.startTime
        });
      }
    }
  }
});

performanceObserver.observe({ entryTypes: ['measure'] });

// Custom performance markers
export const measurePerformance = (name: string, fn: () => void) => {
  performance.mark(`${name}-start`);
  fn();
  performance.mark(`${name}-end`);
  performance.measure(name, `${name}-start`, `${name}-end`);
};

// React DevTools Profiler
import { Profiler } from 'react';

const onRenderCallback = (
  id: string,
  phase: 'mount' | 'update',
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number
) => {
  console.log(`${id} (${phase}) took ${actualDuration}ms`);
};

<Profiler id="LayoutContainer" onRender={onRenderCallback}>
  <LayoutContainer />
</Profiler>
```

### Memory Monitoring

```typescript
// Memory usage tracking
const trackMemoryUsage = () => {
  if ('memory' in performance) {
    const memory = (performance as any).memory;
    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit
    };
  }
  return null;
};

// Periodic memory checks
useEffect(() => {
  const checkMemory = setInterval(() => {
    const usage = trackMemoryUsage();
    if (usage && usage.usedJSHeapSize > 400 * 1024 * 1024) { // 400MB
      console.warn('High memory usage detected', usage);
      // Trigger cleanup
      cleanupOldData();
    }
  }, 30000); // Every 30 seconds
  
  return () => clearInterval(checkMemory);
}, []);
```

## Bundle Size Optimization

### Code Splitting

```typescript
// Lazy load heavy components
const ContextFeed = lazy(() => 
  import(/* webpackChunkName: "context-feed" */ './ContextFeed')
);

const ChatPanel = lazy(() => 
  import(/* webpackChunkName: "chat-panel" */ './ChatPanel')
);

// Dynamic imports for optional features
const loadPdfWorker = () => 
  import(/* webpackChunkName: "pdf-worker" */ 'pdfjs-dist/build/pdf.worker.entry');

// Route-based splitting
const routes = [
  {
    path: '/document/:id',
    component: lazy(() => import('./DocumentKnowledgeBase'))
  }
];
```

### Tree Shaking

```typescript
// Use specific imports
import { debounce } from 'lodash-es/debounce'; // Not entire lodash

// Mark side-effect free
/*#__PURE__*/ 
const heavyCalculation = () => {
  // This will be removed if unused
};

// Production-only code removal
if (process.env.NODE_ENV === 'development') {
  // Development-only debugging
}
```

## Performance Testing

### Automated Performance Tests

```typescript
// Playwright performance tests
test('layout change performance', async ({ page }) => {
  await page.goto('/document/test');
  
  // Start performance measurement
  await page.evaluate(() => performance.mark('layout-change-start'));
  
  // Trigger layout change
  await page.click('[data-testid="layout-preset-research"]');
  
  // End measurement
  const duration = await page.evaluate(() => {
    performance.mark('layout-change-end');
    performance.measure('layout-change', 'layout-change-start', 'layout-change-end');
    const measure = performance.getEntriesByName('layout-change')[0];
    return measure.duration;
  });
  
  expect(duration).toBeLessThan(100); // Should complete in under 100ms
});

// Load testing
test('handles 1000 annotations', async ({ page }) => {
  await page.goto('/document/large');
  
  const renderTime = await page.evaluate(async () => {
    const start = performance.now();
    
    // Generate 1000 annotations
    const annotations = Array.from({ length: 1000 }, (_, i) => ({
      id: `ann-${i}`,
      text: `Annotation ${i}`,
      page: Math.floor(i / 10),
      bounds: { x: 100, y: 100 * (i % 10), width: 200, height: 50 }
    }));
    
    // Trigger render
    window.dispatchEvent(new CustomEvent('load-annotations', { detail: annotations }));
    
    // Wait for render
    await new Promise(resolve => requestAnimationFrame(resolve));
    
    return performance.now() - start;
  });
  
  expect(renderTime).toBeLessThan(500); // Should render in under 500ms
});
```

### Performance Budgets

```javascript
// webpack.config.js
module.exports = {
  performance: {
    hints: 'error',
    maxEntrypointSize: 250000, // 250KB
    maxAssetSize: 200000, // 200KB
    assetFilter: function(assetFilename) {
      return assetFilename.endsWith('.js');
    }
  }
};
```

## Optimization Checklist

### Pre-Launch
- [ ] Profile initial load performance
- [ ] Measure layout change response times
- [ ] Test with 1000+ annotations
- [ ] Verify memory usage stays under limits
- [ ] Check bundle sizes meet budgets
- [ ] Test on low-end devices
- [ ] Verify 60fps during animations
- [ ] Profile with React DevTools
- [ ] Run Lighthouse audits
- [ ] Test with slow network conditions

### Post-Launch Monitoring
- [ ] Set up Real User Monitoring (RUM)
- [ ] Configure performance alerts
- [ ] Track Core Web Vitals
- [ ] Monitor memory leaks in production
- [ ] Analyze user session recordings
- [ ] Track performance regressions
- [ ] Monitor bundle size growth
- [ ] Review performance dashboards weekly

## Performance SLAs

### Critical User Journeys
1. **Document Load**: 95th percentile < 3s
2. **Panel Toggle**: 99th percentile < 100ms
3. **Context Feed Update**: 95th percentile < 200ms
4. **Search**: 95th percentile < 500ms
5. **Annotation Creation**: 99th percentile < 50ms

### Monitoring Dashboard
- Real-time performance metrics
- Historical trends
- Anomaly detection
- User segment analysis
- Geographic performance data 