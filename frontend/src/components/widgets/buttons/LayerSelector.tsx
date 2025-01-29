import React, { useState } from "react";
import styled from "styled-components";
import { Layers } from "lucide-react";

/**
 * Represents a layer option in the LayerSwitcher
 */
export interface LayerOption {
  id: string;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}

interface LayerSwitcherProps {
  /** Array of layer options to display */
  layers: LayerOption[];
  /** Optional className for additional styling */
  className?: string;
}

interface StyledLayerSwitcherProps {
  isExpanded: boolean;
}

export const StyledLayerSwitcher = styled.div<StyledLayerSwitcherProps>`
  /* Default: absolute for desktop, as desired: */
  position: absolute;
  bottom: 2.5rem;
  left: 1.5rem;
  z-index: 900;
  transform: translateZ(0);
  transition: all 0.4s cubic-bezier(0.19, 1, 0.22, 1);

  @media (max-width: 768px) {
    /* Mobile: use fixed so it doesn't scroll away */
    position: fixed;
  }

  .layers-button {
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
      transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);
    }

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.04);
    }
  }

  .layers-menu {
    position: absolute;
    bottom: calc(100% + 12px);
    left: 0;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(12px);
    border-radius: 14px;
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.04);
    border: 1px solid rgba(200, 200, 200, 0.8);
    opacity: 0;
    transform: translateY(10px);
    pointer-events: none;
    transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);

    ${({ isExpanded }) =>
      isExpanded &&
      `
      opacity: 1;
      transform: translateY(0);
      pointer-events: all;
    `}

    button {
      border: none;
      background: transparent;
      padding: 0.75rem 1.25rem;
      cursor: pointer;
      border-radius: 10px;
      font-size: 0.875rem;
      font-weight: 500;
      color: #475569;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 180px;
      transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);
      position: relative;

      &:hover:not(.active) {
        color: #1e293b;
        background: rgba(0, 0, 0, 0.04);
        transform: translateX(2px);
      }

      &.active {
        background: #1a75bc;
        color: white;

        &::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            120deg,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.15) 50%,
            rgba(255, 255, 255, 0) 100%
          );
          animation: shimmer 2s infinite;
          transform: translateX(-100%);
        }
      }

      svg {
        width: 16px;
        height: 16px;
        opacity: 0.9;
        stroke-width: 2.2;
        transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);
      }

      &:hover svg {
        transform: scale(1.1) rotate(-2deg);
        opacity: 1;
      }
    }
  }

  @keyframes shimmer {
    100% {
      transform: translateX(100%);
    }
  }
`;

/**
 * LayerSwitcher Component
 *
 * A floating layer switcher that expands on hover to reveal layer options.
 * Each layer option can have its own icon, label, and click handler.
 *
 * @example
 * ```tsx
 * const layers = [
 *   {
 *     id: 'knowledge',
 *     label: 'Knowledge Base',
 *     icon: <Database size={16} />,
 *     isActive: true,
 *     onClick: () => handleKnowledgeClick()
 *   },
 *   // ... more layers
 * ];
 *
 * return <LayerSwitcher layers={layers} />;
 * ```
 */
export const LayerSwitcher: React.FC<LayerSwitcherProps> = ({
  layers,
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
    <StyledLayerSwitcher
      isExpanded={isExpanded}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={className}
    >
      <div className="layers-button">
        <Layers size={24} />
      </div>
      <div className="layers-menu">
        {layers.map((layer) => (
          <button
            key={layer.id}
            onClick={layer.onClick}
            className={layer.isActive ? "active" : ""}
          >
            {layer.icon}
            {layer.label}
          </button>
        ))}
      </div>
    </StyledLayerSwitcher>
  );
};

export default LayerSwitcher;
