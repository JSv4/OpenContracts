import { useState, useCallback } from "react";

interface UseUISettingsProps {
  /**
   * Optional external control for sidebar visibility
   */
  sidebarVisible?: boolean;
  /**
   * Optional external control for toggling sidebar
   */
  onSidebarToggle?: () => void;
  /**
   * Optional initial width for sidebar in pixels
   */
  width?: number;
}

/**
 * Types for query loading states
 */
type QueryLoadingStates = {
  analyses: boolean;
  annotations: boolean;
  relationships: boolean;
  datacells: boolean;
};

/**
 * Types for query errors
 */
type QueryErrors = {
  analyses?: Error;
  annotations?: Error;
  relationships?: Error;
  datacells?: Error;
};

/**
 * Custom hook for managing UI settings including zoom and sidebar state
 * @param props - Optional external controls for sidebar
 * @returns UI settings and control functions
 */
export function useUISettings(props?: UseUISettingsProps) {
  // Zoom state
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Sidebar state - use external control if provided
  const [internalSidebarVisible, setInternalSidebarVisible] =
    useState<boolean>(true);
  const [sidebarWidth, setSidebarWidth] = useState<number>(props?.width ?? 300);

  // Use external visibility if provided, otherwise use internal state
  const isSidebarVisible = props?.sidebarVisible ?? internalSidebarVisible;

  // Progress state
  const [progress, setProgress] = useState<number>(0);

  // Query loading states
  /**
   * State for tracking loading status of different queries
   */
  const [queryLoadingStates, setQueryLoadingStates] =
    useState<QueryLoadingStates>({
      analyses: false,
      annotations: false,
      relationships: false,
      datacells: false,
    });

  // Query errors
  /**
   * State for tracking errors from different queries
   */
  const [queryErrors, setQueryErrors] = useState<QueryErrors>({});

  // Zoom controls
  const zoomIn = useCallback(() => {
    setZoomLevel((level) => Math.min(level + 0.1, 3));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomLevel((level) => Math.max(level - 0.1, 0.3));
  }, []);

  const resetZoom = useCallback(() => {
    setZoomLevel(1);
  }, []);

  // Sidebar controls
  const toggleSidebar = useCallback(() => {
    if (props?.onSidebarToggle) {
      props.onSidebarToggle();
    } else {
      setInternalSidebarVisible((visible) => !visible);
    }
  }, [props?.onSidebarToggle]);

  const setSidebarVisible = useCallback(
    (visible: boolean) => {
      if (props?.onSidebarToggle) {
        // If external control exists, call it only when state would change
        if (visible !== props.sidebarVisible) {
          props.onSidebarToggle();
        }
      } else {
        setInternalSidebarVisible(visible);
      }
    },
    [props?.onSidebarToggle, props?.sidebarVisible]
  );

  return {
    // Zoom controls
    zoomLevel,
    setZoomLevel,
    zoomIn,
    zoomOut,
    resetZoom,

    // Sidebar controls
    isSidebarVisible,
    sidebarWidth,
    setSidebarWidth,
    toggleSidebar,
    setSidebarVisible,

    // Progress state
    progress,
    setProgress,

    // Query loading states and errors
    queryLoadingStates,
    setQueryLoadingStates,
    queryErrors,
    setQueryErrors,
  };
}
