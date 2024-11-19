import { useState, useCallback, useRef, useEffect } from "react";
import { RelationGroup } from "../types/annotations";

interface UseAnnotationSelectionProps {
  onSelectionChange?: (selectedIds: string[]) => void;
}

export function useAnnotationSelection({
  onSelectionChange,
}: UseAnnotationSelectionProps = {}) {
  const [selectedAnnotations, setSelectedAnnotations] = useState<string[]>([]);
  const [selectedRelations, setSelectedRelations] = useState<RelationGroup[]>(
    []
  );
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(
    null
  );

  // Track timeout for hover state management
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    [onSelectionChange]
  );

  const handleRelationSelect = useCallback((relation: RelationGroup) => {
    setSelectedRelations((prev) => {
      const isSelected = prev.some((r) => r.id === relation.id);
      return isSelected
        ? prev.filter((r) => r.id !== relation.id)
        : [...prev, relation];
    });
  }, []);

  const handleAnnotationHover = useCallback((annotationId: string | null) => {
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
  }, []);

  const clearSelections = useCallback(() => {
    setSelectedAnnotations([]);
    setSelectedRelations([]);
    onSelectionChange?.([]);
  }, [onSelectionChange]);

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
