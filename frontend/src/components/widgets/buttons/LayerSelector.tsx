import React, { useState } from "react";
import styled from "styled-components";
import { Layers } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
  $isExpanded: boolean;
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
    min-width: 48px;
    height: 48px;
    padding: 0 16px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(200, 200, 200, 0.8);
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
    transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);
    position: relative;
    overflow: hidden;

    &::after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(
        120deg,
        rgba(255, 255, 255, 0) 0%,
        rgba(255, 255, 255, 0.6) 50%,
        rgba(255, 255, 255, 0) 100%
      );
      transform: translateX(-100%);
      transition: transform 0.6s;
    }

    &:hover::after {
      transform: translateX(100%);
    }

    .layer-icon {
      width: 24px;
      height: 24px;
      color: #1a75bc;
      stroke-width: 2.2;
      transition: all 0.3s cubic-bezier(0.19, 1, 0.22, 1);
      flex-shrink: 0;
      transform-origin: center;
    }

    .active-layer {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      color: #475569;

      .active-indicator {
        position: relative;
        width: 8px;
        height: 8px;
        border-radius: 4px;
        background: #1a75bc;
        flex-shrink: 0;
        &::after {
          content: "";
          position: absolute;
          top: -4px;
          left: -4px;
          right: -4px;
          bottom: -4px;
          border-radius: 50%;
          background: rgba(26, 117, 188, 0.2);
          animation: pulse 2s infinite;
        }
      }
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

    ${({ $isExpanded }) =>
      $isExpanded &&
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
      transform-origin: right;

      &::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: 0;
        background: rgba(26, 117, 188, 0.08);
        border-radius: 10px;
        transition: width 0.3s cubic-bezier(0.19, 1, 0.22, 1);
      }

      &:hover::before {
        width: 100%;
      }

      &.active::before {
        width: 100%;
        background: rgba(26, 117, 188, 0.15);
      }

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

  @keyframes pulse {
    0% {
      transform: scale(1);
      opacity: 0.8;
    }
    50% {
      transform: scale(1.5);
      opacity: 0;
    }
    100% {
      transform: scale(1);
      opacity: 0;
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

  // Find the active layer
  const activeLayer = layers.find((layer) => layer.isActive);

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
      $isExpanded={isExpanded}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={className}
    >
      <motion.div
        className="layers-button"
        animate={{
          scale: activeLayer ? 1.05 : 1,
          boxShadow: activeLayer
            ? "0 8px 32px rgba(26, 117, 188, 0.15)"
            : "0 4px 24px rgba(0, 0, 0, 0.08)",
        }}
        whileHover={{
          scale: activeLayer ? 1.07 : 1.02,
          transition: { type: "spring", stiffness: 400, damping: 17 },
        }}
        whileTap={{ scale: 0.98 }}
      >
        <motion.div
          animate={{
            rotate: isExpanded ? 180 : 0,
            scale: activeLayer ? 1.1 : 1,
          }}
          transition={{
            type: "spring",
            stiffness: 260,
            damping: 20,
          }}
        >
          <Layers className="layer-icon" />
        </motion.div>

        <AnimatePresence>
          {activeLayer && (
            <motion.div
              className="active-layer"
              initial={{ opacity: 0, x: -20 }}
              animate={{
                opacity: 1,
                x: 0,
                transition: {
                  type: "spring",
                  stiffness: 500,
                  damping: 30,
                },
              }}
              exit={{ opacity: 0, x: -10 }}
            >
              <motion.div
                className="active-indicator"
                layoutId="activeIndicator"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 30,
                }}
              />
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                {activeLayer.label}
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="layers-menu"
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              transition: {
                type: "spring",
                stiffness: 500,
                damping: 30,
              },
            }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
          >
            {layers.map((layer, index) => (
              <motion.button
                key={layer.id}
                onClick={() => layer.onClick()}
                className={layer.isActive ? "active" : ""}
                initial={{ opacity: 0, x: 20 }}
                animate={{
                  opacity: 1,
                  x: 0,
                  transition: {
                    delay: index * 0.05,
                    type: "spring",
                    stiffness: 300,
                    damping: 24,
                  },
                }}
                whileHover={{
                  x: 4,
                  transition: {
                    type: "spring",
                    stiffness: 400,
                    damping: 17,
                  },
                }}
                whileTap={{ scale: 0.98 }}
              >
                {layer.icon}
                {layer.label}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </StyledLayerSwitcher>
  );
};

export default LayerSwitcher;
