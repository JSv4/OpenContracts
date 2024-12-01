import {
  useZoomLevel,
  useSidebar,
  useProgress,
  useQueryLoadingStates,
  useQueryErrors,
  useInitializeUISettingsAtoms,
  useAdditionalUIStates,
} from "../context/UISettingsAtom";
import { useCallback, useMemo } from "react";

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
  // Destructure props with default values
  const { sidebarVisible, onSidebarToggle, width } = props ?? {};

  // Initialize UI settings atoms unconditionally
  useInitializeUISettingsAtoms({
    sidebarVisible,
    onSidebarToggle,
    initialWidth: width,
  });

  // Zoom controls
  const { zoomLevel, setZoomLevel, zoomIn, zoomOut, resetZoom } =
    useZoomLevel();

  // Sidebar controls
  const {
    isSidebarVisible,
    setSidebarVisible,
    sidebarWidth,
    setSidebarWidth,
    toggleSidebar: originalToggleSidebar,
  } = useSidebar();

  // Memoize toggleSidebar
  const toggleSidebar = useCallback(() => {
    originalToggleSidebar();
  }, [originalToggleSidebar]);

  // Progress state
  const { progress, setProgress } = useProgress();

  // Query loading states and errors
  const { queryLoadingStates, setQueryLoadingStates } = useQueryLoadingStates();
  const { queryErrors, setQueryErrors } = useQueryErrors();

  // Additional UI states
  const {
    modalOpen,
    setModalOpen,
    readOnly,
    setReadOnly,
    loadingMessage,
    setLoadingMessage,
    shiftDown,
    setShiftDown,
  } = useAdditionalUIStates();

  // Memoize the returned object
  const uiSettings = useMemo(
    () => ({
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

      // Additional UI states
      modalOpen,
      setModalOpen,
      readOnly,
      setReadOnly,
      loadingMessage,
      setLoadingMessage,
      shiftDown,
      setShiftDown,
    }),
    [
      zoomLevel,
      setZoomLevel,
      zoomIn,
      zoomOut,
      resetZoom,
      isSidebarVisible,
      setSidebarVisible,
      sidebarWidth,
      setSidebarWidth,
      toggleSidebar,
      progress,
      setProgress,
      queryLoadingStates,
      setQueryLoadingStates,
      queryErrors,
      setQueryErrors,
      modalOpen,
      setModalOpen,
      readOnly,
      setReadOnly,
      loadingMessage,
      setLoadingMessage,
      shiftDown,
      setShiftDown,
    ]
  );

  return uiSettings;
}
