import { RelationGroup } from "../types/annotations";
import { useAtom } from "jotai";
import { useEffect, useRef, useCallback } from "react";
import {
  selectedAnnotationsAtom,
  selectedRelationsAtom,
  hoveredAnnotationIdAtom,
} from "../context/UISettingsAtom";

interface UseAnnotationSelectionProps {
  /**
   * Callback when the selection changes.
   */
  onSelectionChange?: (selectedAnnotations: string[]) => void;
}

/**
 * Hook to manage annotation selection state using Jotai atoms.
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

  // Handle selection changes
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(selectedAnnotations);
    }
  }, [onSelectionChange, selectedAnnotations]);

  // Event handlers
  const handleAnnotationSelect = useCallback(
    (annotationId: string) => {
      setSelectedAnnotations((prev) => {
        // If the annotation is already selected, deselect it
        if (prev.includes(annotationId)) {
          return [];
        }
        // Otherwise, select it
        return [annotationId];
      });
    },
    [setSelectedAnnotations]
  );

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

  const handleAnnotationHover = useCallback(
    (annotationId: string | null) => {
      setHoveredAnnotationId(annotationId);
    },
    [setHoveredAnnotationId]
  );

  const clearSelections = useCallback(() => {
    setSelectedAnnotations([]);
    setSelectedRelations([]);
  }, [setSelectedAnnotations, setSelectedRelations]);

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
