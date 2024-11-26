import { useEffect } from "react";
import { usePdfAnnotations } from "../hooks/AnnotationHooks";
import {
  useAnnotationControls,
  useAnnotationDisplay,
  useAnnotationSelection,
} from "../context/UISettingsAtom";

export const UndoAnnotation = () => {
  // Interesting... this is triggered on META+z (Apple logo + z and, on most browsers
  // in windows, windows + z, tho apparently that can't be guaranteed).

  const { pdfAnnotations, setPdfAnnotations } = usePdfAnnotations();

  useEffect(() => {
    const handleUndo = (e: KeyboardEvent) => {
      if (e.metaKey && e.keyCode === 90) {
        setPdfAnnotations(pdfAnnotations.undoAnnotation());
      }
    };

    window.addEventListener("keydown", handleUndo);
    return () => {
      window.removeEventListener("keydown", handleUndo);
    };
  }, [pdfAnnotations, setPdfAnnotations]);

  return null;
};

export const HideAnnotationLabels = () => {
  // Shows or hides the labels of annotations on pressing ctrl.
  // This makes it easier to do detailed annotations.

  const { hideLabels, setHideLabels } = useAnnotationDisplay();

  // Toggle state on key down.
  useEffect(() => {
    const hideLabelsOnKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey) {
        setHideLabels(!hideLabels);
      }
    };
    window.addEventListener("keydown", hideLabelsOnKeyDown);
    return () => {
      window.removeEventListener("keydown", hideLabelsOnKeyDown);
    };
  }, [hideLabels, setHideLabels]);

  return null;
};

interface HandleAnnotationSelectionProps {
  setModalVisible: (v: boolean) => void;
}
export const HandleAnnotationSelection = ({
  setModalVisible,
}: HandleAnnotationSelectionProps) => {
  const { selectedAnnotations, setSelectedAnnotations } =
    useAnnotationSelection();
  const { activeRelationLabel } = useAnnotationControls();

  useEffect(() => {
    const onShiftUp = (e: KeyboardEvent) => {
      const shift = e.keyCode === 16;
      const somethingSelected = selectedAnnotations.length !== 0;
      const hasRelations = activeRelationLabel !== undefined;
      // Shift key up, the user has selected something,
      // and this annotation project has relation labels.
      if (shift && somethingSelected && hasRelations) {
        setModalVisible(true);
      }
      // Otherwise we just clear the selection,
      // if there is something selected, because
      // there are no relations to annotate.
      else if (shift && somethingSelected) {
        setSelectedAnnotations([]);
      }
    };

    window.addEventListener("keyup", onShiftUp);
    return () => {
      window.removeEventListener("keyup", onShiftUp);
    };
  }, [activeRelationLabel, selectedAnnotations, setModalVisible]);

  return null;
};
