import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { LabelDisplayBehavior } from "../../../types/graphql-api";
import { ViewState } from "../types/enums";

interface UIContextType {
  // Window/viewport state
  isMobile: boolean;
  windowWidth: number;

  // Zoom controls
  zoomLevel: number;
  setZoomLevel: (level: number) => void;

  // Keyboard state
  shiftDown: boolean;
  setShiftDown: (down: boolean) => void;

  // Annotation scroll tracking
  hasScrolledToAnnotation: string | null;
  setHasScrolledToAnnotation: (annotationId: string | null) => void;

  // Annotation display controls
  showAnnotationBoundingBoxes: boolean;
  setShowAnnotationBoundingBoxes: (show: boolean) => void;
  showAnnotationLabels: LabelDisplayBehavior;
  setShowAnnotationLabels: (behavior: LabelDisplayBehavior) => void;
  showStructuralAnnotations: boolean;
  setShowStructuralAnnotations: (show: boolean) => void;
  showSelectedAnnotationOnly: boolean;
  setShowSelectedAnnotationOnly: (show: boolean) => void;

  // Loading state
  loadingMessage: string | undefined;
  setLoadingMessage: (message: string | undefined) => void;

  // Sidebar visibility
  hideSidebar: boolean;
  setHideSidebar: (hide: boolean) => void;

  // View state
  viewState: ViewState;
  setViewState: (state: ViewState) => void;
}

export const UIContext = createContext<UIContextType | undefined>(undefined);

export const useUIContext = (): UIContextType => {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error("useUIContext must be used within a UIContextProvider");
  }
  return context;
};

export const createUIContextValue = (
  windowWidth: number,
  setWindowWidth: (width: number) => void,
  isMobile: boolean,
  setIsMobile: (mobile: boolean) => void,
  zoomLevel: number,
  setZoomLevel: (level: number) => void,
  shiftDown: boolean,
  setShiftDown: (down: boolean) => void,
  hasScrolledToAnnotation: string | null,
  setHasScrolledToAnnotation: (annotationId: string | null) => void,
  showAnnotationBoundingBoxes: boolean,
  setShowAnnotationBoundingBoxes: (show: boolean) => void,
  showAnnotationLabels: LabelDisplayBehavior,
  setShowAnnotationLabels: (behavior: LabelDisplayBehavior) => void,
  showStructuralAnnotations: boolean,
  setShowStructuralAnnotations: (show: boolean) => void,
  showSelectedAnnotationOnly: boolean,
  setShowSelectedAnnotationOnly: (show: boolean) => void,
  loadingMessage: string | undefined,
  setLoadingMessage: (message: string | undefined) => void,
  hideSidebar: boolean,
  setHideSidebar: (hide: boolean) => void,
  viewState: ViewState,
  setViewState: (state: ViewState) => void
): UIContextType => {
  return {
    isMobile,
    windowWidth,
    zoomLevel,
    setZoomLevel,
    shiftDown,
    setShiftDown,
    hasScrolledToAnnotation,
    setHasScrolledToAnnotation,
    showAnnotationBoundingBoxes,
    setShowAnnotationBoundingBoxes,
    showAnnotationLabels,
    setShowAnnotationLabels,
    showStructuralAnnotations,
    setShowStructuralAnnotations,
    showSelectedAnnotationOnly,
    setShowSelectedAnnotationOnly,
    loadingMessage,
    setLoadingMessage,
    hideSidebar,
    setHideSidebar,
    viewState,
    setViewState,
  };
};
