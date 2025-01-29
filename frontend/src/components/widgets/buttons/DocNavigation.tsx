import React, { useState } from "react";
import styled from "styled-components";
import { Search, ZoomIn, ZoomOut } from "lucide-react";
import { Form } from "semantic-ui-react";

interface DocNavigationProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onSearch: (text: string) => void;
  zoomLevel: number;
  className?: string;
}

const StyledNavigation = styled.div<{ isExpanded: boolean }>`
  position: absolute;
  top: 1.5rem;
  left: 1.5rem;
  z-index: 999;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  transform: translateZ(0);

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
    }
  }
`;

export const DocNavigation: React.FC<DocNavigationProps> = ({
  onZoomIn,
  onZoomOut,
  onSearch,
  zoomLevel,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const timeoutRef = React.useRef<NodeJS.Timeout>();

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsExpanded(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsExpanded(false);
    }, 300);
  };

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <StyledNavigation isExpanded={isExpanded} className={className}>
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
        className="search-container"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="search-button">
          <Search size={24} />
        </div>
        <div className="search-panel">
          <Form.Input
            className="search-input"
            placeholder="Search document..."
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>
    </StyledNavigation>
  );
};

export default DocNavigation;
