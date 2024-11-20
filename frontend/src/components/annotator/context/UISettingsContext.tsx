import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
} from "react";

interface UISettingsContextValue {
  // Zoom controls
  getZoomLevel: () => number;
  setZoomLevel: (level: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;

  // Sidebar controls
  getIsSidebarVisible: () => boolean;
  getSidebarWidth: () => number;
  setSidebarWidth: (width: number) => void;
  toggleSidebar: () => void;
  setSidebarVisible: (visible: boolean) => void;

  // Progress state
  getProgress: () => number;
  setProgress: (progress: number) => void;

  // Query states
  getQueryLoadingStates: () => QueryLoadingStates;
  setQueryLoadingStates: (states: QueryLoadingStates) => void;
  getQueryErrors: () => QueryErrors;
  setQueryErrors: (errors: QueryErrors) => void;
}

type QueryLoadingStates = {
  analyses: boolean;
  annotations: boolean;
  relationships: boolean;
  datacells: boolean;
};

type QueryErrors = {
  analyses?: Error;
  annotations?: Error;
  relationships?: Error;
  datacells?: Error;
};

const UISettingsContext = createContext<UISettingsContextValue | null>(null);

interface UISettingsProviderProps {
  children: React.ReactNode;
  sidebarVisible?: boolean;
  onSidebarToggle?: () => void;
  initialWidth?: number;
}

export function UISettingsProvider({
  children,
  sidebarVisible,
  onSidebarToggle,
  initialWidth = 300,
}: UISettingsProviderProps) {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [internalSidebarVisible, setInternalSidebarVisible] =
    useState<boolean>(true);
  const [sidebarWidth, setSidebarWidth] = useState<number>(initialWidth);
  const [progress, setProgress] = useState<number>(0);
  const [queryLoadingStates, setQueryLoadingStates] =
    useState<QueryLoadingStates>({
      analyses: false,
      annotations: false,
      relationships: false,
      datacells: false,
    });
  const [queryErrors, setQueryErrors] = useState<QueryErrors>({});

  const isSidebarVisible = sidebarVisible ?? internalSidebarVisible;

  const value = useMemo(
    () => ({
      // Zoom controls
      getZoomLevel: () => zoomLevel,
      setZoomLevel,
      zoomIn: () => setZoomLevel((level) => Math.min(level + 0.1, 3)),
      zoomOut: () => setZoomLevel((level) => Math.max(level - 0.1, 0.3)),
      resetZoom: () => setZoomLevel(1),

      // Sidebar controls
      getIsSidebarVisible: () => isSidebarVisible,
      getSidebarWidth: () => sidebarWidth,
      setSidebarWidth,
      toggleSidebar: () => {
        if (onSidebarToggle) {
          onSidebarToggle();
        } else {
          setInternalSidebarVisible((visible) => !visible);
        }
      },
      setSidebarVisible: (visible: boolean) => {
        if (onSidebarToggle) {
          if (visible !== sidebarVisible) {
            onSidebarToggle();
          }
        } else {
          setInternalSidebarVisible(visible);
        }
      },

      // Progress state
      getProgress: () => progress,
      setProgress,

      // Query states
      getQueryLoadingStates: () => queryLoadingStates,
      setQueryLoadingStates,
      getQueryErrors: () => queryErrors,
      setQueryErrors,
    }),
    [
      zoomLevel,
      isSidebarVisible,
      sidebarWidth,
      progress,
      queryLoadingStates,
      queryErrors,
      onSidebarToggle,
      sidebarVisible,
    ]
  );

  return (
    <UISettingsContext.Provider value={value}>
      {children}
    </UISettingsContext.Provider>
  );
}

export function useUISettings() {
  const context = useContext(UISettingsContext);
  if (!context) {
    throw new Error("useUISettings must be used within a UISettingsProvider");
  }
  return context;
}
