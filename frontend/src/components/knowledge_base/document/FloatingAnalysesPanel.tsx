import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import { X, BarChart3 } from "lucide-react";
import AnalysisTraySelector from "../../analyses/AnalysisTraySelector";
import { AnalysisType } from "../../../types/graphql-api";

interface FloatingAnalysesPanelProps {
  visible: boolean;
  analyses: AnalysisType[];
  onClose: () => void;
  panelOffset?: number;
}

const FloatingContainer = styled(motion.div)<{ $panelOffset?: number }>`
  position: fixed;
  top: 50%;
  right: ${(props) => {
    const baseOffset = props.$panelOffset ? props.$panelOffset + 32 : 32;
    return `${baseOffset + 80}px`;
  }};
  transform: translateY(-50%);
  z-index: 2001;
  width: 400px;
  height: 70vh;
  max-height: 800px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  @media (max-width: 768px) {
    right: 1rem;
    width: calc(100vw - 2rem);
    height: 60vh;
  }
`;

const CollapsedButton = styled(motion.button)`
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 8px 32px rgba(245, 158, 11, 0.3);
  position: relative;
  overflow: hidden;

  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(
      circle at 30% 30%,
      rgba(255, 255, 255, 0.3),
      transparent
    );
  }

  svg {
    color: white;
    width: 28px;
    height: 28px;
    position: relative;
    z-index: 1;
  }

  &:hover {
    box-shadow: 0 12px 40px rgba(245, 158, 11, 0.4);
  }
`;

const ExpandedPanel = styled(motion.div)`
  width: 100%;
  height: 100%;
  background: white;
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(226, 232, 240, 0.8);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Header = styled.div`
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(180deg, #fafbfc 0%, rgba(250, 251, 252, 0) 100%);
`;

const Title = styled.h3`
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 0.75rem;

  svg {
    color: #f59e0b;
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const ActionButton = styled(motion.button)`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;

  svg {
    width: 18px;
    height: 18px;
    color: #64748b;
  }

  &:hover {
    background: #f8fafc;
    border-color: #cbd5e1;

    svg {
      color: #475569;
    }
  }
`;

const Content = styled.div`
  flex: 1;
  overflow: hidden;
  position: relative;
`;

const Badge = styled.span`
  position: absolute;
  top: -8px;
  right: -8px;
  background: #ef4444;
  color: white;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
`;

export const FloatingAnalysesPanel: React.FC<FloatingAnalysesPanelProps> = ({
  visible,
  analyses,
  onClose,
  panelOffset = 0,
}) => {
  if (!visible) return null;

  return (
    <FloatingContainer $panelOffset={panelOffset}>
      <ExpandedPanel
        key="expanded"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
      >
        <Header>
          <Title>
            <BarChart3 size={20} />
            Document Analyses
          </Title>
          <Actions>
            <ActionButton
              onClick={onClose}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="Close"
            >
              <X />
            </ActionButton>
          </Actions>
        </Header>
        <Content>
          <AnalysisTraySelector read_only={false} analyses={analyses} />
        </Content>
      </ExpandedPanel>
    </FloatingContainer>
  );
};
