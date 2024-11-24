import { useCallback, useRef, useEffect } from "react";
import { RelationGroup } from "../types/annotations";
import { useAtom } from "jotai";
import {
  selectedAnnotationsAtom,
  selectedRelationsAtom,
  hoveredAnnotationIdAtom,
} from "../context/UISettingsAtom";

interface UseAnnotationSelectionProps {
  /**
   * Callback function invoked when the selection changes.
   * @param selectedIds - Array of selected annotation IDs.
   */
  onSelectionChange?: (selectedIds: string[]) => void;
}

/**
 * Hook to manage annotation selection state using Jotai atoms.
 * @param props - Optional selection change callback.
 * @returns Selection state and control functions.
 */
export function useAnnotationSelection({
  onSelectionChange,
}: UseAnnotationSelectionProps = {}) {
  const [selectedAnnotations, setSelectedAnnotations] = useAtom(
    selectedAnnotationsAtom
  );
  const [selectedRelations, setSelectedRelations] = useAtom(
    selectedRelationsAtom
  );
  const [hoveredAnnotationId, setHoveredAnnotationId] = useAtom(
    hoveredAnnotationIdAtom
  );

  // Track timeout for hover state management
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Handle selection of an annotation.
   * @param annotationId - ID of the annotation to select/deselect.
   */
  const handleAnnotationSelect = useCallback(
    (annotationId: string) => {
      setSelectedAnnotations((prev) => {
        const newSelection = prev.includes(annotationId)
          ? prev.filter((id) => id !== annotationId)
          : [...prev, annotationId];

        onSelectionChange?.(newSelection);
        return newSelection;
      });
    },
    [setSelectedAnnotations, onSelectionChange]
  );

  /**
   * Handle selection of a relation.
   * @param relation - RelationGroup to select/deselect.
   */
  const handleRelationSelect = useCallback(
    (relation: RelationGroup) => {
      setSelectedRelations((prev) => {
        const isSelected = prev.some((r) => r.id === relation.id);
        return isSelected
          ? prev.filter((r) => r.id !== relation.id)
          : [...prev, relation];
      });
    },
    [setSelectedRelations]
  );

  /**
   * Handle hover over an annotation.
   * @param annotationId - ID of the hovered annotation or null.
   */
  const handleAnnotationHover = useCallback(
    (annotationId: string | null) => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }

      if (annotationId === null) {
        hoverTimeoutRef.current = setTimeout(() => {
          setHoveredAnnotationId(null);
        }, 200); // Delay to prevent flickering
      } else {
        setHoveredAnnotationId(annotationId);
      }
    },
    [setHoveredAnnotationId]
  );

  /**
   * Clear all selections.
   */
  const clearSelections = useCallback(() => {
    setSelectedAnnotations([]);
    setSelectedRelations([]);
    onSelectionChange?.([]);
  }, [setSelectedAnnotations, setSelectedRelations, onSelectionChange]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  return {
    selectedAnnotations,
    selectedRelations,
    hoveredAnnotationId,
    handleAnnotationSelect,
    handleRelationSelect,
    handleAnnotationHover,
    clearSelections,
    setSelectedAnnotations,
    setSelectedRelations,
  };
}
