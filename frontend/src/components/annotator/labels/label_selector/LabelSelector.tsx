import React, { useState, useMemo, useEffect, useRef } from "react";
import styled from "styled-components";
import { Tag } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { AnnotationLabelType } from "../../../../types/graphql-api";
import useWindowDimensions from "../../../hooks/WindowDimensionHook";
import { useCorpusState } from "../../context/CorpusAtom";
import { useSelectedDocument } from "../../context/DocumentAtom";

interface LabelSelectorProps {
  activeSpanLabel: AnnotationLabelType | null;
  setActiveLabel: (label: AnnotationLabelType | undefined) => void;
  /** Width of the sidebar to adjust positioning */
  sidebarWidth: string;
  /** Optional array of labels to display. If not provided, labels are loaded from the corpus state */
  labels?: AnnotationLabelType[];
  /** Whether the right panel is currently shown */
  showRightPanel?: boolean;
}

/**
 * A beautiful floating label selector that expands on hover to show available labels.
 * This version preserves the new styling while restoring the legacy data loading
 * and selection logic.
 *
 * @param activeSpanLabel - The currently active label
 * @param setActiveLabel - Callback to change the active label
 * @param sidebarWidth - The sidebar width used to offset the selector
 * @param labels - Optional override for label options; if undefined, the component loads
 *   labels based on the current document file type from the corpus state.
 */
export const LabelSelector: React.FC<LabelSelectorProps> = ({
  activeSpanLabel,
  setActiveLabel,
  sidebarWidth,
  labels,
  showRightPanel,
}) => {
  const { width } = useWindowDimensions();
  const isMobile = width <= 768; // Match the media query breakpoint
  const { selectedDocument } = useSelectedDocument();
  const { humanSpanLabels, humanTokenLabels } = useCorpusState();

  /**
   * Compute the available labels based on the file type of the current document.
   * For text files, we use humanSpanLabels and for PDFs we use humanTokenLabels.
   * If an active label exists, filter it out from the choices.
   */
  const filteredLabelChoices = useMemo<AnnotationLabelType[]>(() => {
    const isTextFile: boolean =
      selectedDocument?.fileType?.startsWith("text/") ?? false;
    const isPdfFile: boolean = selectedDocument?.fileType === "application/pdf";
    let availableLabels: AnnotationLabelType[] = [];

    if (isTextFile) {
      availableLabels = [...humanSpanLabels];
    } else if (isPdfFile) {
      availableLabels = [...humanTokenLabels];
    }

    return activeSpanLabel
      ? availableLabels.filter((label) => label.id !== activeSpanLabel.id)
      : availableLabels;
  }, [
    humanSpanLabels,
    humanTokenLabels,
    selectedDocument?.fileType,
    activeSpanLabel,
  ]);

  // Use the passed-in labels if provided, otherwise use the computed label choices.
  const labelOptions: AnnotationLabelType[] =
    labels && labels.length > 0 ? labels : filteredLabelChoices;

  // Internal state controlling whether the label selector is expanded.
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Handles mouse entering the component by immediately expanding the label menu.
   * Only triggers on desktop.
   */
  const handleMouseEnter = (): void => {
    if (isMobile) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsExpanded(true);
  };

  /**
   * Handles mouse leaving the component by collapsing the label menu after a delay.
   * Only triggers on desktop.
   */
  const handleMouseLeave = (): void => {
    if (isMobile) return;

    timeoutRef.current = setTimeout(() => setIsExpanded(false), 300);
  };

  // Add click handler for mobile
  const handleSelectorClick = (): void => {
    if (!isMobile) return;
    setIsExpanded(!isExpanded);
  };

  // Clear expanded state when active label is cleared on mobile
  useEffect(() => {
    if (isMobile && !activeSpanLabel) {
      setIsExpanded(false);
    }
  }, [activeSpanLabel, isMobile]);

  // These effects log changes similar to the legacy implementation.
  useEffect(() => {
    console.log("LabelSelector - activeSpanLabel changed:", activeSpanLabel);
  }, [activeSpanLabel]);

  useEffect(() => {
    console.log("LabelSelector - selectedDocument changed:", selectedDocument);
  }, [selectedDocument]);

  useEffect(() => {
    console.log("LabelSelector - humanSpanLabels changed:", humanSpanLabels);
    console.log("LabelSelector - humanTokenLabels changed:", humanTokenLabels);
  }, [humanSpanLabels, humanTokenLabels]);

  return (
    <StyledLabelSelector
      isExpanded={isExpanded}
      sidebarWidth={sidebarWidth}
      showRightPanel={showRightPanel}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleSelectorClick}
    >
      <motion.div
        className="selector-button"
        animate={{
          scale: activeSpanLabel ? 1.05 : 1,
          boxShadow: activeSpanLabel
            ? "0 8px 32px rgba(26, 117, 188, 0.15)"
            : "0 4px 24px rgba(0, 0, 0, 0.08)",
        }}
      >
        <Tag className="tag-icon" size={24} />
        {activeSpanLabel && (
          <motion.div
            className="active-label-display"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "auto" }}
          >
            <span
              className="color-dot"
              style={{ backgroundColor: activeSpanLabel.color || "#1a75bc" }}
            />
            <span>{activeSpanLabel.text}</span>
            <button
              className="clear-button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveLabel(undefined);
                if (isMobile) {
                  setIsExpanded(false);
                }
              }}
            >
              ×
            </button>
          </motion.div>
        )}
        {activeSpanLabel && (
          <motion.div
            className="active-indicator"
            layoutId="activeLabel"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
          />
        )}
      </motion.div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="labels-menu"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            {labelOptions.length > 0 ? (
              labelOptions.map((label) => (
                <button
                  key={label.id}
                  onClick={() => setActiveLabel(label)}
                  className={activeSpanLabel?.id === label.id ? "active" : ""}
                >
                  <span
                    className="color-dot"
                    style={{ backgroundColor: label.color || "#1a75bc" }}
                  />
                  {label.text}
                </button>
              ))
            ) : (
              <div className="empty-state">
                {activeSpanLabel
                  ? "No other labels available"
                  : "No labels available for this document type"}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </StyledLabelSelector>
  );
};

interface StyledLabelSelectorProps {
  isExpanded: boolean;
  sidebarWidth: string;
  showRightPanel?: boolean;
}

const StyledLabelSelector = styled.div<StyledLabelSelectorProps>`
  position: absolute;
  bottom: 2.5rem;
  right: 1.5rem;
  z-index: 1000;
  transform: ${(props) =>
    props.showRightPanel ? "translateX(-520px)" : "none"};
  transition: transform 0.3s cubic-bezier(0.19, 1, 0.22, 1);

  @media (max-width: 768px) {
    position: fixed;
    bottom: 1rem;
    right: 1rem;

    .selector-button {
      min-width: 40px !important;
      height: 40px !important;
      padding: 0 12px !important;
    }

    .tag-icon {
      width: 20px !important;
      height: 20px !important;
    }

    .active-label-display {
      font-size: 0.75rem !important;

      .color-dot {
        width: 6px !important;
        height: 6px !important;
      }
    }

    .labels-menu {
      min-width: auto !important;

      button {
        padding: 0.5rem 1rem !important;
        min-width: 140px !important;
        font-size: 0.75rem !important;
      }
    }
  }

  .selector-button {
    min-width: 48px;
    height: 48px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(200, 200, 200, 0.8);
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 12px;
    flex-shrink: 0;
  }

  .active-label-display {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    color: #475569;

    .color-dot {
      width: 8px;
      height: 8px;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .clear-button {
      background: none;
      border: none;
      color: #64748b;
      font-size: 1.2rem;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      margin-left: 4px;
      border-radius: 50%;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        background: rgba(0, 0, 0, 0.05);
        color: #ef4444;
      }
    }
    cursor: pointer;
    position: relative;
    transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);

    .tag-icon {
      color: #1a75bc;
      stroke-width: 2.2;
      transition: all 0.3s;
    }

    .active-indicator {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 12px;
      height: 12px;
      border-radius: 6px;
      background: #1a75bc;
      border: 2px solid white;
    }

    &:hover {
      transform: translateY(-2px);
    }
  }

  .labels-menu {
    position: absolute;
    bottom: calc(100% + 12px);
    right: 0;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(12px);
    border-radius: 14px;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 220px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
    border: 1px solid rgba(200, 200, 200, 0.8);

    button {
      border: none;
      background: transparent;
      padding: 0.75rem 1rem;
      cursor: pointer;
      border-radius: 10px;
      font-size: 0.875rem;
      font-weight: 500;
      color: #475569;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      position: relative;
      transition: all 0.2s;

      .color-dot {
        width: 8px;
        height: 8px;
        border-radius: 4px;
        transition: all 0.2s;
      }

      &:hover {
        background: rgba(0, 0, 0, 0.03);
        color: #1e293b;

        .color-dot {
          transform: scale(1.2);
        }
      }

      &.active {
        color: #1a75bc;
        font-weight: 600;
        background: rgba(26, 117, 188, 0.08);

        .color-dot {
          transform: scale(1.3);
        }
      }
    }

    .empty-state {
      padding: 0.75rem 1rem;
      color: #64748b;
      font-size: 0.875rem;
      text-align: center;
      font-style: italic;
    }
  }
`;

export default LabelSelector;
