import { useAtom } from "jotai";
import {
  showAnnotationBoundingBoxesAtom,
  showAnnotationLabelsAtom,
  showStructuralAnnotationsAtom,
  showSelectedAnnotationOnlyAtom,
  hideLabelsAtom,
} from "../context/UISettingsAtom";
import { LabelDisplayBehavior } from "../../../types/graphql-api";

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

  const toggleBoundingBoxes = () => {
    setBoundingBoxes(!boundingBoxes);
  };

  const toggleLabelDisplay = (behavior: LabelDisplayBehavior) => {
    setLabelDisplay(behavior);
  };

  const toggleStructuralAnnotations = () => {
    setStructuralAnnotations(!structuralAnnotations);
  };

  const toggleSelectedOnly = () => {
    setSelectedOnly(!selectedOnly);
  };

  const toggleHideLabels = () => {
    setHideLabels((prev) => !prev);
  };

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
