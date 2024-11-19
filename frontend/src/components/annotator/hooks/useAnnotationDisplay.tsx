import { useState, useCallback } from "react";
import { useReactiveVar } from "@apollo/client";
import {
  showAnnotationBoundingBoxes,
  showAnnotationLabels,
  showStructuralAnnotations,
  showSelectedAnnotationOnly,
} from "../../../graphql/cache";
import { LabelDisplayBehavior } from "../../../types/graphql-api";

export function useAnnotationDisplay() {
  const boundingBoxes = useReactiveVar(showAnnotationBoundingBoxes);
  const labelDisplay = useReactiveVar(showAnnotationLabels);
  const structuralAnnotations = useReactiveVar(showStructuralAnnotations);
  const selectedOnly = useReactiveVar(showSelectedAnnotationOnly);

  const [hideLabels, setHideLabels] = useState(false);

  const toggleBoundingBoxes = useCallback(() => {
    showAnnotationBoundingBoxes(!boundingBoxes);
  }, [boundingBoxes]);

  const toggleLabelDisplay = useCallback((behavior: LabelDisplayBehavior) => {
    showAnnotationLabels(behavior);
  }, []);

  const toggleStructuralAnnotations = useCallback(() => {
    showStructuralAnnotations(!structuralAnnotations);
  }, [structuralAnnotations]);

  const toggleSelectedOnly = useCallback(() => {
    showSelectedAnnotationOnly(!selectedOnly);
  }, [selectedOnly]);

  const toggleHideLabels = useCallback(() => {
    setHideLabels((prev) => !prev);
  }, []);

  return {
    displaySettings: {
      showAnnotationBoundingBoxes: boundingBoxes,
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
