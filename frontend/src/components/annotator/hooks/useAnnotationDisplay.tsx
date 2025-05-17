import { useAtom } from "jotai";
import {
  showAnnotationBoundingBoxesAtom,
  showAnnotationLabelsAtom,
  showStructuralAnnotationsAtom,
  showSelectedAnnotationOnlyAtom,
  hideLabelsAtom,
  showStructuralRelationshipsAtom,
} from "../context/UISettingsAtom";
import { useCallback } from "react";

/**
 * Hook to manage annotation display settings.
 */
export function useAnnotationDisplay() {
  const [boundingBoxes, setBoundingBoxes] = useAtom(
    showAnnotationBoundingBoxesAtom
  );
  const [labelDisplay, setLabelDisplay] = useAtom(showAnnotationLabelsAtom);
  const [structuralAnnotationsView, setStructuralAnnotationsView] = useAtom(
    // Renamed for clarity
    showStructuralAnnotationsAtom
  );
  const [selectedOnly, setSelectedOnly] = useAtom(
    showSelectedAnnotationOnlyAtom
  );
  const [hideLabelsFlag, setHideLabelsFlag] = useAtom(hideLabelsAtom); // Renamed to avoid conflict

  // New state for structural relationships
  const [structuralRelationshipsView, setStructuralRelationshipsView] = useAtom(
    // Renamed for clarity
    showStructuralRelationshipsAtom
  );

  // Toggles
  const toggleBoundingBoxes = useCallback(() => {
    setBoundingBoxes((prev) => !prev);
  }, [setBoundingBoxes]);

  // setLabelDisplay is used directly by ViewSettingsPopup

  const toggleStructuralAnnotations = useCallback(() => {
    setStructuralAnnotationsView((prev) => !prev);
  }, [setStructuralAnnotationsView]);

  const toggleSelectedOnly = useCallback(() => {
    setSelectedOnly((prev) => !prev);
  }, [setSelectedOnly]);

  const toggleHideLabels = useCallback(() => {
    setHideLabelsFlag((prev) => !prev);
  }, [setHideLabelsFlag]);

  // New toggle for structural relationships
  const toggleStructuralRelationships = useCallback(() => {
    setStructuralRelationshipsView((prev) => !prev);
  }, [setStructuralRelationshipsView]);

  return {
    // States (matching pattern used by ViewSettingsPopup if applicable)
    showBoundingBoxes: boundingBoxes,
    showLabels: labelDisplay, // Corresponds to 'showAnnotationLabels' in ViewSettingsPopup
    showStructural: structuralAnnotationsView, // General structural annotations visibility
    showSelectedOnly: selectedOnly,
    hideLabels: hideLabelsFlag, // Used in ViewSettingsPopup

    // Setters (for ViewSettingsPopup style handlers)
    setShowBoundingBoxes: setBoundingBoxes,
    setShowLabels: setLabelDisplay,
    setShowStructural: setStructuralAnnotationsView,
    setShowSelectedOnly: setSelectedOnly,
    setHideLabels: setHideLabelsFlag,

    // New properties for structural relationships
    showStructuralRelationships: structuralRelationshipsView,
    setShowStructuralRelationships: setStructuralRelationshipsView, // Expose setter

    // Toggles (can be used directly if preferred)
    // Keeping the original structure of returning state values and setters primarily
    // toggleBoundingBoxes,
    // toggleStructuralAnnotations,
    // toggleSelectedOnly,
    // toggleHideLabels,
    toggleStructuralRelationships, // Make this available if needed
  };
}
