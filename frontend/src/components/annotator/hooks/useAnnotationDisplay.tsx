import { useAtom } from "jotai";
import {
  showAnnotationBoundingBoxesAtom,
  showAnnotationLabelsAtom,
  showStructuralAnnotationsAtom,
  showSelectedAnnotationOnlyAtom,
  hideLabelsAtom,
} from "../context/UISettingsAtom";
import { LabelDisplayBehavior } from "../../../types/graphql-api";
import { useCallback } from "react";

/**
 * Hook to manage annotation display settings.
 */
export function useAnnotationDisplay() {
  const [boundingBoxes, setBoundingBoxes] = useAtom(
    showAnnotationBoundingBoxesAtom
  );
  const [labelDisplay, setLabelDisplay] = useAtom(showAnnotationLabelsAtom);
  const [structuralAnnotations, setStructuralAnnotations] = useAtom(
    showStructuralAnnotationsAtom
  );
  const [selectedOnly, setSelectedOnly] = useAtom(
    showSelectedAnnotationOnlyAtom
  );
  const [hideLabels, setHideLabels] = useAtom(hideLabelsAtom);

  // Toggles
  const toggleBoundingBoxes = useCallback(() => {
    setBoundingBoxes((prev) => !prev);
  }, [setBoundingBoxes]);

  const toggleLabelDisplay = useCallback(() => {
    setLabelDisplay((behavior: LabelDisplayBehavior) => behavior);
  }, [setLabelDisplay]);

  const toggleStructuralAnnotations = useCallback(() => {
    setStructuralAnnotations((prev) => !prev);
  }, [setStructuralAnnotations]);

  const toggleSelectedOnly = useCallback(() => {
    setSelectedOnly((prev) => !prev);
  }, [setSelectedOnly]);

  const toggleHideLabels = useCallback(() => {
    setHideLabels((prev) => !prev);
  }, [setHideLabels]);

  return {
    states: {
      showBoundingBoxes: boundingBoxes,
      showAnnotationLabels: labelDisplay,
      showStructuralAnnotations: structuralAnnotations,
      showSelectedAnnotationOnly: selectedOnly,
      hideLabels,
    },
    toggles: {
      toggleBoundingBoxes,
      toggleLabelDisplay,
      toggleStructuralAnnotations,
      toggleSelectedOnly,
      toggleHideLabels,
    },
  };
}
