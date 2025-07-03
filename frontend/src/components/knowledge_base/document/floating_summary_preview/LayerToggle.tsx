import React from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { Database, FileText } from "lucide-react";

interface LayerToggleProps {
  activeLayer: "knowledge" | "document";
  onToggle: () => void;
}

const ToggleContainer = styled(motion.button)`
  position: fixed;
  top: 1.5rem;
  right: 1.5rem;
  z-index: 1000;
  width: 60px;
  height: 60px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(200, 200, 200, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  transition: all 0.2s;

  &:hover {
    border-color: #4a90e2;
    box-shadow: 0 6px 28px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.04);
  }
`;

const IconWrapper = styled(motion.div)`
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4a90e2;
  position: relative;
`;

const LayerLabel = styled(motion.div)`
  position: absolute;
  bottom: -20px;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  white-space: nowrap;
`;

export const LayerToggle: React.FC<LayerToggleProps> = ({
  activeLayer,
  onToggle,
}) => {
  return (
    <ToggleContainer
      onClick={onToggle}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      title={`Switch to ${
        activeLayer === "knowledge" ? "Document" : "Knowledge Base"
      } view`}
    >
      <IconWrapper
        animate={{ rotate: activeLayer === "knowledge" ? 0 : 180 }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 25,
        }}
      >
        {activeLayer === "knowledge" ? (
          <Database size={28} />
        ) : (
          <FileText size={28} />
        )}
      </IconWrapper>
      <LayerLabel
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.1 }}
      >
        {activeLayer === "knowledge" ? "Knowledge" : "Document"}
      </LayerLabel>
    </ToggleContainer>
  );
};
