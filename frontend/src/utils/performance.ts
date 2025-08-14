/**
 * Performance monitoring utilities for tracking navigation and data loading
 */

interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, any>;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private enabled: boolean = process.env.NODE_ENV === "development";

  /**
   * Start tracking a performance metric
   */
  startMetric(name: string, metadata?: Record<string, any>) {
    if (!this.enabled) return;

    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      metadata,
    };

    this.metrics.set(name, metric);
    console.debug(`[Performance] Started: ${name}`, metadata);
  }

  /**
   * End tracking a performance metric
   */
  endMetric(name: string, additionalMetadata?: Record<string, any>) {
    if (!this.enabled) return;

    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`[Performance] No metric found for: ${name}`);
      return;
    }

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;
    metric.metadata = { ...metric.metadata, ...additionalMetadata };

    console.debug(
      `[Performance] Completed: ${name} in ${metric.duration.toFixed(2)}ms`,
      metric.metadata
    );

    // Send to analytics if needed
    this.reportMetric(metric);
  }

  /**
   * Track a async operation with automatic timing
   */
  async trackAsync<T>(
    name: string,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    this.startMetric(name, metadata);
    try {
      const result = await operation();
      this.endMetric(name, { success: true });
      return result;
    } catch (error) {
      this.endMetric(name, { success: false, error: error?.toString() });
      throw error;
    }
  }

  /**
   * Get all metrics
   */
  getMetrics(): PerformanceMetric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Clear all metrics
   */
  clearMetrics() {
    this.metrics.clear();
  }

  /**
   * Report metric to analytics service
   */
  private reportMetric(metric: PerformanceMetric) {
    // In production, you would send this to your analytics service
    // For now, just log to console in development
    if (process.env.NODE_ENV === "development" && metric.duration) {
      // Log slow operations
      if (metric.duration > 1000) {
        console.warn(
          `[Performance] Slow operation detected: ${
            metric.name
          } took ${metric.duration.toFixed(2)}ms`
        );
      }
    }
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * React hook for performance tracking
 */
export function usePerformanceTracking(metricName: string) {
  return {
    start: (metadata?: Record<string, any>) =>
      performanceMonitor.startMetric(metricName, metadata),
    end: (metadata?: Record<string, any>) =>
      performanceMonitor.endMetric(metricName, metadata),
    track: <T>(operation: () => Promise<T>, metadata?: Record<string, any>) =>
      performanceMonitor.trackAsync(metricName, operation, metadata),
  };
}

/**
 * Navigation timing utilities
 */
export const navigationTiming = {
  /**
   * Track route navigation timing
   */
  trackNavigation(from: string, to: string) {
    performanceMonitor.startMetric("navigation", { from, to });
  },

  /**
   * Complete navigation tracking
   */
  completeNavigation(success: boolean = true) {
    performanceMonitor.endMetric("navigation", { success });
  },

  /**
   * Track slug resolution
   */
  trackSlugResolution(slugType: string, slugValue: string) {
    return performanceMonitor.startMetric(`slug-resolution-${slugType}`, {
      slug: slugValue,
    });
  },

  /**
   * Complete slug resolution tracking
   */
  completeSlugResolution(slugType: string, found: boolean) {
    performanceMonitor.endMetric(`slug-resolution-${slugType}`, { found });
  },
};
