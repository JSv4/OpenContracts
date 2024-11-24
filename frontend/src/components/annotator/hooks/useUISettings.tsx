import {
  useZoomLevel,
  useSidebar,
  useProgress,
  useQueryLoadingStates,
  useQueryErrors,
  useInitializeUISettingsAtoms,
} from "../context/UISettingsAtom";

interface UseUISettingsProps {
  /**
   * Optional external control for sidebar visibility.
   */
  sidebarVisible?: boolean;
  /**
   * Optional external control for toggling sidebar.
   */
  onSidebarToggle?: () => void;
  /**
   * Optional initial width for sidebar in pixels.
   */
  width?: number;
}

/**
 * Hook to manage UI settings including zoom and sidebar state using Jotai atoms.
 * @param props - Optional external controls for sidebar.
 * @returns UI settings and control functions.
 */
export function useUISettings(props?: UseUISettingsProps) {
  // Initialize UI settings atoms if needed
  if (props) {
    const { sidebarVisible, onSidebarToggle, width } = props;
    useInitializeUISettingsAtoms({
      sidebarVisible,
      onSidebarToggle,
      initialWidth: width,
    });
  }

  // Zoom controls
  const { zoomLevel, setZoomLevel, zoomIn, zoomOut, resetZoom } =
    useZoomLevel();

  // Sidebar controls
  const {
    isSidebarVisible,
    setSidebarVisible,
    sidebarWidth,
    setSidebarWidth,
    toggleSidebar,
  } = useSidebar();

  // Progress state
  const { progress, setProgress } = useProgress();

  // Query loading states and errors
  const { queryLoadingStates, setQueryLoadingStates } = useQueryLoadingStates();
  const { queryErrors, setQueryErrors } = useQueryErrors();

  return {
    // Zoom controls
    zoomLevel,
    setZoomLevel,
    zoomIn,
    zoomOut,
    resetZoom,

    // Sidebar controls
    isSidebarVisible,
    setSidebarVisible,
    sidebarWidth,
    setSidebarWidth,
    toggleSidebar,

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
