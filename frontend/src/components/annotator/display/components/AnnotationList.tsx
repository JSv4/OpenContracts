import { useMemo } from "react";

import _ from "lodash";

import "../../sidebar/AnnotatorSidebar.css";
import { FetchMoreOnVisible } from "../../../widgets/infinite_scroll/FetchMoreOnVisible";
import { PlaceholderCard } from "../../../placeholders/PlaceholderCard";
import { useAnnotationRefs } from "../../hooks/useAnnotationRefs";
import {
  useAnnotationControls,
  useAnnotationDisplay,
  useAnnotationSelection,
} from "../../context/UISettingsAtom";
import {
  useDeleteAnnotation,
  usePdfAnnotations,
} from "../../hooks/AnnotationHooks";
import { HighlightItem } from "../../sidebar/HighlightItem";
import { ViewSettingsPopup } from "../../../widgets/popups/ViewSettingsPopup";
import { LabelDisplayBehavior } from "../../../../types/graphql-api";
import styled from "styled-components";

interface AnnotationListProps {
  /**
   * Flag denoting whether this is read-only mode.
   */
  readonly read_only: boolean;

  /**
   * Optional callback to fetch the next page of data (for infinite scroll).
   */
  readonly fetchMore?: () => Promise<void>;
}

const AnnotationListContainer = styled.div`
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 0.5rem 0;

  // Improve scrollbar appearance
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #f1f5f9;
  }

  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 4px;

    &:hover {
      background: #94a3b8;
    }
  }
`;

const AnnotationListUl = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
`;

/**
 * A simplified component that displays a list of annotations.
 * It handles selecting and deleting annotations and optionally fetches more data when scrolled.
 * @param props - Component props
 * @returns React component
 */
export const AnnotationList: React.FC<AnnotationListProps> = ({
  read_only,
  fetchMore,
}): JSX.Element => {
  const { pdfAnnotations } = usePdfAnnotations();
  const { selectedAnnotations, setSelectedAnnotations } =
    useAnnotationSelection();
  const { annotationElementRefs } = useAnnotationRefs();
  const handleDeleteAnnotation = useDeleteAnnotation();

  // Controls how annotations are displayed (e.g., hide structural or show certain labels only).
  const { showStructural } = useAnnotationDisplay();
  const { spanLabelsToView } = useAnnotationControls();
  const { annotations, relations } = pdfAnnotations;

  /**
   * Filter out structural annotations (if hidden),
   * and filter by user-selected labels if any.
   */
  const filteredAnnotations = useMemo(() => {
    const returnAnnotations = annotations.filter(
      (annotation) =>
        (showStructural || !annotation.structural) &&
        (!spanLabelsToView?.length ||
          spanLabelsToView.some(
            (label) => label.id === annotation.annotationLabel.id
          ))
    );
    return returnAnnotations;
  }, [annotations, showStructural, spanLabelsToView]);

  /**
   * Deletes an annotation by ID.
   * @param annotationId - the ID of the annotation to delete
   */
  const onDeleteAnnotation = (annotationId: string): void => {
    handleDeleteAnnotation(annotationId);
  };

  /**
   * Toggles an annotation as selected/unselected.
   * If newly selected, scroll it into view in the highlight list.
   * @param toggledId - the ID of the annotation to toggle
   */
  const toggleSelectedAnnotation = (toggledId: string): void => {
    if (selectedAnnotations.includes(toggledId)) {
      setSelectedAnnotations(
        selectedAnnotations.filter((annotationId) => annotationId !== toggledId)
      );
    } else {
      const target = annotationElementRefs?.current[toggledId];
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setSelectedAnnotations([...selectedAnnotations, toggledId]);
    }
  };

  // Create the label display options
  const labelDisplayOptions = [
    {
      key: LabelDisplayBehavior.ALWAYS,
      text: "Always",
      value: LabelDisplayBehavior.ALWAYS,
    },
    {
      key: LabelDisplayBehavior.ON_HOVER,
      text: "On Hover",
      value: LabelDisplayBehavior.ON_HOVER,
    },
    {
      key: LabelDisplayBehavior.HIDE,
      text: "Never",
      value: LabelDisplayBehavior.HIDE,
    },
  ];

  /**
   * Renders the list of annotation items with infinite scroll capability
   */
  const AnnotationItems: React.FC<{
    readonly annotations: typeof filteredAnnotations;
    readonly relations: typeof relations;
    readonly read_only: boolean;
    readonly onSelect: (id: string) => void;
    readonly onDelete: (id: string) => void;
    readonly fetchMore?: () => Promise<void>;
  }> = ({
    annotations,
    relations,
    read_only,
    onSelect,
    onDelete,
    fetchMore,
  }) => (
    <>
      {_.orderBy(annotations, ["page"], ["asc"]).map((annotation) => (
        <li key={`highlight_item_${annotation.id}`}>
          <HighlightItem
            annotation={annotation}
            relations={relations}
            read_only={read_only}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        </li>
      ))}
      {fetchMore && (
        <li key="fetch-more">
          <FetchMoreOnVisible fetchNextPage={fetchMore} fetchWithoutMotion />
        </li>
      )}
    </>
  );

  /**
   * Renders a placeholder when no annotations are found
   */
  const EmptyAnnotationList: React.FC = () => (
    <li>
      <PlaceholderCard
        style={{ margin: "1rem" }}
        title="No Matching Annotations Found"
        description="No annotations match the currently selected labels or filters."
      />
    </li>
  );

  return (
    <div
      className="annotation-list"
      style={{ display: "flex", flexDirection: "column", overflowY: "auto" }}
    >
      <ViewSettingsPopup label_display_options={labelDisplayOptions} />
      <AnnotationListContainer>
        <AnnotationListUl>
          {filteredAnnotations.length > 0 ? (
            <AnnotationItems
              annotations={filteredAnnotations}
              relations={relations}
              read_only={read_only}
              onSelect={toggleSelectedAnnotation}
              onDelete={onDeleteAnnotation}
              fetchMore={fetchMore}
            />
          ) : (
            <EmptyAnnotationList />
          )}
        </AnnotationListUl>
      </AnnotationListContainer>
    </div>
  );
};
