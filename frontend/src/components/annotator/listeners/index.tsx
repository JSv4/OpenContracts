import { useEffect, useContext } from "react";
import { AnnotationStore } from "../context";

export const UndoAnnotation = () => {
  // Interesting... this is triggered on META+z (Apple logo + z and, on most browsers
  // in windows, windows + z, tho apparently that can't be guaranteed).

  const annotationStore = useContext(AnnotationStore);
  const { pdfAnnotations, setPdfAnnotations } = annotationStore;
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

  const annotationStore = useContext(AnnotationStore);
  const { hideLabels, setHideLabels } = annotationStore;

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
  const annotationStore = useContext(AnnotationStore);
  const { selectedAnnotations, setSelectedAnnotations, activeRelationLabel } =
    annotationStore;
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

interface WithSha {
  sha: string;
}

interface WithOCContext {
  documentId: string;
  corpusId: string;
}
