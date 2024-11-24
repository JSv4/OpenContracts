/**
 * Atom-based state management for UI settings, annotation selection,
 * and display settings using Jotai.
 */

import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { RelationGroup } from "../types/annotations";
import {
  AnnotationLabelType,
  LabelDisplayBehavior,
} from "../../../types/graphql-api";

/**
 * Types for query loading states and errors.
 */
export type QueryLoadingStates = {
  analyses: boolean;
  annotations: boolean;
  relationships: boolean;
  datacells: boolean;
};

export type QueryErrors = {
  analyses?: Error;
  annotations?: Error;
  relationships?: Error;
  datacells?: Error;
};

/**
 * UI Settings Atoms
 */
export const zoomLevelAtom = atom<number>(1);
export const isSidebarVisibleAtom = atom<boolean>(true);
export const sidebarWidthAtom = atom<number>(300);
export const progressAtom = atom<number>(0);

/**
 * Query State Atoms
 */
export const queryLoadingStatesAtom = atom<QueryLoadingStates>({
  analyses: false,
  annotations: false,
  relationships: false,
  datacells: false,
});
export const queryErrorsAtom = atom<QueryErrors>({});

/**
 * Annotation Selection Atoms
 */
export const selectedAnnotationsAtom = atom<string[]>([]);
export const selectedRelationsAtom = atom<RelationGroup[]>([]);
export const hoveredAnnotationIdAtom = atom<string | null>(null);

/**
 * Annotation Display Atoms
 */
export const showAnnotationBoundingBoxesAtom = atom<boolean>(true);
export const showAnnotationLabelsAtom = atom<LabelDisplayBehavior>(
  LabelDisplayBehavior.ON_HOVER
);
export const showStructuralAnnotationsAtom = atom<boolean>(true);
export const showSelectedAnnotationOnlyAtom = atom<boolean>(false);
export const hideLabelsAtom = atom<boolean>(false);

/**
 * Annotation Control Atoms
 */
export const activeSpanLabelAtom = atom<AnnotationLabelType | undefined>(
  undefined
);
export const spanLabelsToViewAtom = atom<AnnotationLabelType[] | null>(null);
export const activeRelationLabelAtom = atom<AnnotationLabelType | undefined>(
  undefined
);
export const useFreeFormAnnotationsAtom = atom<boolean>(false);
export const relationModalVisibleAtom = atom<boolean>(false);

/**
 * Atom for onSidebarToggle callback.
 */
export const onSidebarToggleAtom = atom<(() => void) | undefined>(undefined);

/**
 * Hook to initialize UI settings atoms with initial values.
 * @param params Initial values for the UI settings.
 */
export function useInitializeUISettingsAtoms(params: {
  sidebarVisible?: boolean;
  onSidebarToggle?: () => void;
  initialWidth?: number;
}) {
  const { sidebarVisible = true, onSidebarToggle, initialWidth = 300 } = params;

  const setIsSidebarVisible = useSetAtom(isSidebarVisibleAtom);
  const setSidebarWidth = useSetAtom(sidebarWidthAtom);
  const setOnSidebarToggle = useSetAtom(onSidebarToggleAtom);

  useEffect(() => {
    setIsSidebarVisible(sidebarVisible);
    setSidebarWidth(initialWidth);
    setOnSidebarToggle(() => onSidebarToggle);
  }, [
    sidebarVisible,
    onSidebarToggle,
    initialWidth,
    setIsSidebarVisible,
    setSidebarWidth,
    setOnSidebarToggle,
  ]);
}

/**
 * Custom hooks for zoom controls.
 */
export function useZoomLevel() {
  const [zoomLevel, setZoomLevel] = useAtom(zoomLevelAtom);

  const zoomIn = useCallback(() => {
    setZoomLevel((level) => Math.min(level + 0.1, 3));
  }, [setZoomLevel]);

  const zoomOut = useCallback(() => {
    setZoomLevel((level) => Math.max(level - 0.1, 0.3));
  }, [setZoomLevel]);

  const resetZoom = useCallback(() => {
    setZoomLevel(1);
  }, [setZoomLevel]);

  return {
    zoomLevel,
    setZoomLevel,
    zoomIn,
    zoomOut,
    resetZoom,
  };
}

/**
 * Custom hooks for sidebar controls.
 */
export function useSidebar() {
  const [isSidebarVisible, setIsSidebarVisible] = useAtom(isSidebarVisibleAtom);
  const [sidebarWidth, setSidebarWidth] = useAtom(sidebarWidthAtom);
  const onSidebarToggle = useAtomValue(onSidebarToggleAtom);

  const toggleSidebar = useCallback(() => {
    if (onSidebarToggle) {
      onSidebarToggle();
    } else {
      setIsSidebarVisible((visible) => !visible);
    }
  }, [onSidebarToggle, setIsSidebarVisible]);

  const setSidebarVisible = useCallback(
    (visible: boolean) => {
      if (onSidebarToggle) {
        if (visible !== isSidebarVisible) {
          onSidebarToggle();
        }
      } else {
        setIsSidebarVisible(visible);
      }
    },
    [onSidebarToggle, isSidebarVisible, setIsSidebarVisible]
  );

  return {
    isSidebarVisible,
    setSidebarVisible,
    sidebarWidth,
    setSidebarWidth,
    toggleSidebar,
  };
}

/**
 * Custom hooks for progress state.
 */
export function useProgress() {
  const [progress, setProgress] = useAtom(progressAtom);
  return { progress, setProgress };
}

/**
 * Custom hooks for query loading states.
 */
export function useQueryLoadingStates() {
  const [queryLoadingStates, setQueryLoadingStates] = useAtom(
    queryLoadingStatesAtom
  );
  return { queryLoadingStates, setQueryLoadingStates };
}

/**
 * Custom hooks for query errors.
 */
export function useQueryErrors() {
  const [queryErrors, setQueryErrors] = useAtom(queryErrorsAtom);
  return { queryErrors, setQueryErrors };
}

/**
 * Custom hook for managing annotation label controls
 * @param params Configuration parameters for annotation labels
 */
export function useAnnotationControls(params: {
  humanSpanLabelChoices: AnnotationLabelType[];
  relationLabels: AnnotationLabelType[];
}) {
  const { humanSpanLabelChoices, relationLabels } = params;

  const [activeSpanLabel, setActiveSpanLabel] = useAtom(activeSpanLabelAtom);
  const [spanLabelsToView, setSpanLabelsToView] = useAtom(spanLabelsToViewAtom);
  const [activeRelationLabel, setActiveRelationLabel] = useAtom(
    activeRelationLabelAtom
  );
  const [useFreeFormAnnotations, setUseFreeFormAnnotations] = useAtom(
    useFreeFormAnnotationsAtom
  );
  const [relationModalVisible, setRelationModalVisible] = useAtom(
    relationModalVisibleAtom
  );

  // Initialize default values
  useEffect(() => {
    if (humanSpanLabelChoices.length > 0 && !activeSpanLabel) {
      setActiveSpanLabel(humanSpanLabelChoices[0]);
    }
    if (relationLabels.length > 0 && !activeRelationLabel) {
      setActiveRelationLabel(relationLabels[0]);
    }
  }, [
    humanSpanLabelChoices,
    relationLabels,
    activeSpanLabel,
    activeRelationLabel,
    setActiveSpanLabel,
    setActiveRelationLabel,
  ]);

  const toggleUseFreeFormAnnotations = useCallback(() => {
    setUseFreeFormAnnotations((prev) => !prev);
  }, [setUseFreeFormAnnotations]);

  return {
    activeSpanLabel,
    setActiveSpanLabel,
    spanLabelsToView,
    setSpanLabelsToView,
    activeRelationLabel,
    setActiveRelationLabel,
    useFreeFormAnnotations,
    toggleUseFreeFormAnnotations,
    relationModalVisible,
    setRelationModalVisible,
  };
}

/**
 * Custom hook for managing annotation display settings
 * @returns Object containing annotation display states and their setters
 */
export function useAnnotationDisplay() {
  const [showBoundingBoxes, setShowBoundingBoxes] = useAtom(
    showAnnotationBoundingBoxesAtom
  );
  const [showLabels, setShowLabels] = useAtom(showAnnotationLabelsAtom);
  const [showStructural, setShowStructural] = useAtom(
    showStructuralAnnotationsAtom
  );
  const [showSelectedOnly, setShowSelectedOnly] = useAtom(
    showSelectedAnnotationOnlyAtom
  );
  const [hideLabels, setHideLabels] = useAtom(hideLabelsAtom);

  return {
    showBoundingBoxes,
    setShowBoundingBoxes,
    showLabels,
    setShowLabels,
    showStructural,
    setShowStructural,
    showSelectedOnly,
    setShowSelectedOnly,
    hideLabels,
    setHideLabels,
  };
}

/**
 * Custom hook for managing annotation selection and hover states
 * @returns Object containing selection and hover states and their setters
 */
export function useAnnotationSelection() {
  const [selectedAnnotations, setSelectedAnnotations] = useAtom(
    selectedAnnotationsAtom
  );
  const [selectedRelations, setSelectedRelations] = useAtom(
    selectedRelationsAtom
  );
  const [hoveredAnnotationId, setHoveredAnnotationId] = useAtom(
    hoveredAnnotationIdAtom
  );

  return {
    selectedAnnotations,
    setSelectedAnnotations,
    selectedRelations,
    setSelectedRelations,
    hoveredAnnotationId,
    setHoveredAnnotationId,
  };
}
