import React, { useState, useRef, useEffect, useMemo } from "react";
import styled from "styled-components";
import { Search, ZoomIn, ZoomOut } from "lucide-react";
import { Form } from "semantic-ui-react";
import _ from "lodash";
import { useSearchText } from "../../annotator/context/DocumentAtom";
import { useTextSearchState } from "../../annotator/context/DocumentAtom";
import { useAnnotationRefs } from "../../annotator/hooks/useAnnotationRefs";

/**
 * DocNavigationProps describes the required props for the DocNavigation FC.
 */
interface DocNavigationProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoomLevel: number;
  className?: string;
}

/**
 * Styled container for the document navigation components (zoom buttons & search bar).
 */
export const StyledNavigation = styled.div<{ isExpanded: boolean }>`
  /* Default for desktop: absolute as before */
  position: absolute;
  top: 1.5rem;
  left: 1.5rem;
  z-index: 900;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  transform: translateZ(0);

  @media (max-width: 768px) {
    /* On mobile, fix to the viewport so it doesn't scroll away */
    position: fixed;
    top: 180px; /* Offset y by 100px down */
  }

  .zoom-group {
    display: flex;
    align-items: center;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(200, 200, 200, 0.8);
    border-radius: 12px;
    padding: 0.5rem;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);

    .zoom-controls {
      display: flex;
      gap: 0.5rem;
      align-items: center;

      button {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        border: none;
        background: transparent;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #475569;
        transition: all 0.2s ease;

        &:hover {
          background: rgba(0, 0, 0, 0.04);
          color: #1a75bc;
        }

        svg {
          width: 18px;
          height: 18px;
          stroke-width: 2.2;
        }
      }
    }

    .zoom-level {
      min-width: 48px;
      text-align: center;
      font-size: 0.875rem;
      color: #475569;
      font-weight: 500;
      padding: 0 0.5rem;
    }
  }

  .search-container {
    position: relative;

    .search-button {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(200, 200, 200, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
      transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);

      svg {
        width: 24px;
        height: 24px;
        color: #1a75bc;
        stroke-width: 2.2;
      }
    }

    .search-panel {
      position: absolute;
      left: calc(100% + 0.75rem);
      top: 0;
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(12px);
      border-radius: 12px;
      border: 1px solid rgba(200, 200, 200, 0.8);
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.04);
      padding: 0.5rem;
      opacity: 0;
      transform: translateX(-10px);
      pointer-events: none;
      transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);

      @media (max-width: 768px) {
        left: 50%;
        top: calc(100% + 0.75rem);
        transform: translateX(-50%) translateY(-10px);

        ${({ isExpanded }) =>
          isExpanded &&
          `
          transform: translateX(-50%) translateY(0);
        `}
      }

      ${({ isExpanded }) =>
        isExpanded &&
        `
        opacity: 1;
        transform: translateX(0);
        pointer-events: all;
      `}

      .search-input input {
        width: 200px;
        height: 36px;
        border-radius: 8px;
        border: 1px solid rgba(200, 200, 200, 0.8);
        padding: 0 1rem;
        font-size: 0.875rem;
        transition: all 0.2s ease;

        &:focus {
          outline: none;
          border-color: #1a75bc;
          box-shadow: 0 0 0 2px rgba(26, 117, 188, 0.1);
        }
      }

      .search-status {
        font-size: 0.75rem;
        color: #999;
        margin-top: 4px;
        text-align: right;
      }
    }
  }
`;

/**
 * DocNavigation includes zoom controls and a search input that expands on hover.
 * The search input is debounced (1 second) and is synced with the global searchText state.
 * Additionally:
 *  - Pressing Enter again without changing the search value moves to the next search result.
 *  - We scroll the current match into view, just like in SearchSidebarWidget.
 *  - Displays a subtle "Match X of Y" label showing the current result index & total count.
 */
export const DocNavigation: React.FC<DocNavigationProps> = ({
  onZoomIn,
  onZoomOut,
  zoomLevel,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const componentRef = useRef<HTMLDivElement>(null);

  // We'll also need the annotationRefs so we can scroll matched text into view
  const annotationRefs = useAnnotationRefs();

  // Use the search text global store (atom) and text search match state
  const { searchText, setSearchText } = useSearchText();
  const {
    textSearchMatches,
    selectedTextSearchMatchIndex,
    setSelectedTextSearchMatchIndex,
  } = useTextSearchState();

  // Local input so user sees immediate typing, while global state is updated through a debounce
  const [localInput, setLocalInput] = useState<string>(searchText || "");
  const timeoutRef = useRef<NodeJS.Timeout>();

  // Update isMobile state on window resize
  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Handle clicks outside for mobile
  React.useEffect(() => {
    if (!isMobile) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        componentRef.current &&
        !componentRef.current.contains(event.target as Node)
      ) {
        setIsExpanded(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [isMobile]);

  /**
   * Debounce calls to setSearchText by 1 second to avoid excessive updates.
   */
  const debouncedSetSearchText = useMemo(
    () =>
      _.debounce((value: string) => {
        if (value.trim() === "") {
          setSearchText("");
          return;
        }
        setSearchText(value);
      }, 1000),
    [setSearchText]
  );

  /**
   * Cancel the hover timeout and the debouncedSetSearchText on unmount.
   */
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      debouncedSetSearchText.cancel();
      // Don't clear search text on unmount as it triggers hooks with invalid data
    };
  }, [debouncedSetSearchText]);

  // Effect to handle panel closing - move search text clearing here
  useEffect(() => {
    if (!isExpanded) {
      debouncedSetSearchText.cancel();
      // Only clear search if the panel is closing and we have an empty input
      if (localInput.trim() === "") {
        setLocalInput("");
        setSearchText("");
      }
    }
  }, [isExpanded, localInput, debouncedSetSearchText, setSearchText]);

  /**
   * Keep localInput in sync when the global searchText changes.
   */
  useEffect(() => {
    setLocalInput(searchText || "");
  }, [searchText]);

  /**
   * Whenever the selectedTextSearchMatchIndex changes, scroll that result into view,
   * just like we do in SearchSidebarWidget.
   */
  useEffect(() => {
    const currentRef =
      annotationRefs.textSearchElementRefs.current[
        selectedTextSearchMatchIndex
      ];
    if (currentRef) {
      currentRef.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [selectedTextSearchMatchIndex, annotationRefs.textSearchElementRefs]);

  /**
   * Handle mouse enter/leave for desktop and click for mobile
   */
  const handleMouseEnter = () => {
    if (isMobile) return; // Skip for mobile
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsExpanded(true);
  };

  const handleMouseLeave = () => {
    if (isMobile) return; // Skip for mobile
    timeoutRef.current = setTimeout(() => {
      setIsExpanded(false);
    }, 300);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!isMobile) return; // Only for mobile

    // If clicking the search input or inside the search panel, don't toggle
    const target = e.target as Element;
    if (target.closest(".search-input") || target.closest(".search-panel")) {
      return;
    }

    setIsExpanded(!isExpanded);
  };

  /**
   * onChange handler for the search input:
   * - Updates local state immediately.
   * - Delays (debounces) the global search update by 1 second.
   */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalInput(e.target.value);
    debouncedSetSearchText(e.target.value);
  };

  /**
   * onKeyDown handler for the search input:
   * - If user presses Enter and the current input hasn't changed, move to the next match.
   * - If user presses Enter with a new query, immediately set the global search text
   *   (cancel the debounced call).
   */
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      // If user hasn't changed search, cycle to the next result
      if (localInput.trim() === searchText.trim()) {
        if (textSearchMatches.length > 0) {
          const nextIndex =
            (selectedTextSearchMatchIndex + 1) % textSearchMatches.length;
          setSelectedTextSearchMatchIndex(nextIndex);
        }
      } else {
        // Otherwise, initiate a new search
        debouncedSetSearchText.cancel();
        setSearchText(localInput);
      }
    }
  };

  /**
   * Create the "Match X of Y" indicator if valid results exist.
   */
  const matchIndicator = useMemo(() => {
    if (textSearchMatches.length > 0) {
      return `Match ${selectedTextSearchMatchIndex + 1} of ${
        textSearchMatches.length
      }`;
    }
    // If no matches, return empty
    return "";
  }, [textSearchMatches, selectedTextSearchMatchIndex]);

  return (
    <StyledNavigation
      id="doc-navigation"
      isExpanded={isExpanded}
      className={className}
    >
      <div className="zoom-group">
        <div className="zoom-controls">
          <button onClick={onZoomOut} title="Zoom Out">
            <ZoomOut />
          </button>
          <div className="zoom-level">{Math.round(zoomLevel * 100)}%</div>
          <button onClick={onZoomIn} title="Zoom In">
            <ZoomIn />
          </button>
        </div>
      </div>

      <div
        ref={componentRef}
        className="search-container"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        <div className="search-button">
          <Search size={24} />
        </div>
        <div className="search-panel">
          <Form.Input
            className="search-input"
            placeholder="Search document..."
            value={localInput}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            onMouseDown={(e: React.MouseEvent) => e.stopPropagation()} // Prevent click from bubbling up
          />
          {matchIndicator && (
            <div className="search-status">{matchIndicator}</div>
          )}
        </div>
      </div>
    </StyledNavigation>
  );
};

export default DocNavigation;
