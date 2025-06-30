import React, { useState } from "react";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, Square, Layers, User, Eye, EyeOff } from "lucide-react";
import { Checkbox, CheckboxProps } from "semantic-ui-react";
import { useAnnotationDisplay } from "../../annotator/context/UISettingsAtom";

const ControlsContainer = styled(motion.div)`
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  z-index: 1000;
  display: flex;
  flex-direction: column-reverse;
  align-items: flex-end;
  gap: 0.75rem;
`;

const MainButton = styled(motion.button)`
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: white;
  border: 2px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;

  svg {
    width: 24px;
    height: 24px;
    color: #64748b;
    transition: transform 0.3s ease;
  }

  &:hover {
    border-color: #3b82f6;
    box-shadow: 0 6px 20px rgba(59, 130, 246, 0.15);

    svg {
      color: #3b82f6;
    }
  }

  &[data-expanded="true"] svg {
    transform: rotate(45deg);
  }
`;

const ControlPanel = styled(motion.div)`
  background: white;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  border: 1px solid #e2e8f0;
  padding: 1rem;
  min-width: 240px;
`;

const ControlItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem;
  border-radius: 8px;
  transition: background 0.2s ease;

  &:hover {
    background: #f8fafc;
  }

  &:not(:last-child) {
    margin-bottom: 0.5rem;
  }
`;

const ControlLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #1e293b;

  svg {
    width: 18px;
    height: 18px;
    color: #64748b;
  }
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-bottom: 1px solid #f1f5f9;
  margin-bottom: 0.75rem;
  font-weight: 600;
  font-size: 0.9375rem;
  color: #1e293b;

  svg {
    width: 20px;
    height: 20px;
    color: #3b82f6;
  }
`;

const StyledCheckbox = styled(Checkbox)`
  &&& {
    transform: scale(1.1);

    label {
      padding-left: 1.75rem !important;

      &:before {
        border-color: #e2e8f0 !important;
        border-radius: 4px !important;
      }

      &:after {
        border-radius: 2px !important;
      }
    }

    &.checked label:before {
      border-color: #3b82f6 !important;
      background: #3b82f6 !important;
    }
  }
`;

interface FloatingDocumentControlsProps {
  /** Whether to show the controls (e.g., only in document layer) */
  visible?: boolean;
}

export const FloatingDocumentControls: React.FC<
  FloatingDocumentControlsProps
> = ({ visible = true }) => {
  const [expanded, setExpanded] = useState(false);

  const {
    showStructural,
    setShowStructural,
    showSelectedOnly,
    setShowSelectedOnly,
    showBoundingBoxes,
    setShowBoundingBoxes,
  } = useAnnotationDisplay();

  if (!visible) return null;

  const handleShowSelectedChange = (checked: boolean) => {
    setShowSelectedOnly(checked);
  };

  const handleShowStructuralChange = () => {
    const newStructuralValue = !showStructural;
    setShowStructural(newStructuralValue);

    // If enabling structural view, force "show selected only" to be true
    if (newStructuralValue) {
      setShowSelectedOnly(true);
    }
  };

  const handleShowBoundingBoxesChange = (checked: boolean) => {
    setShowBoundingBoxes(checked);
  };

  return (
    <ControlsContainer
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <AnimatePresence>
        {expanded && (
          <ControlPanel
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2 }}
          >
            <PanelHeader>
              <Eye />
              Visualization Settings
            </PanelHeader>

            <ControlItem>
              <ControlLabel>
                <User />
                Show Only Selected
              </ControlLabel>
              <StyledCheckbox
                toggle
                onChange={(
                  _e: React.FormEvent<HTMLInputElement>,
                  data: CheckboxProps
                ) => handleShowSelectedChange(data?.checked ?? false)}
                checked={showSelectedOnly}
                disabled={showStructural}
              />
            </ControlItem>

            <ControlItem>
              <ControlLabel>
                <Square />
                Show Bounding Boxes
              </ControlLabel>
              <StyledCheckbox
                toggle
                onChange={(
                  _e: React.FormEvent<HTMLInputElement>,
                  data: CheckboxProps
                ) => handleShowBoundingBoxesChange(data?.checked ?? false)}
                checked={showBoundingBoxes}
              />
            </ControlItem>

            <ControlItem>
              <ControlLabel>
                <Layers />
                Show Structural
              </ControlLabel>
              <StyledCheckbox
                toggle
                onChange={handleShowStructuralChange}
                checked={showStructural}
              />
            </ControlItem>
          </ControlPanel>
        )}
      </AnimatePresence>

      <MainButton
        data-expanded={expanded}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Settings />
      </MainButton>
    </ControlsContainer>
  );
};
