import React from "react";
import styled from "styled-components";
import { CorpusType } from "../../../graphql/types";
import { FileText, Users, Database, X } from "lucide-react";

const StatsContainer = styled.div`
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  padding: 16px;
  width: 250px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`;

const Title = styled.h3`
  font-size: 18px;
  font-weight: 600;
  color: #333;
  margin: 0;
`;

const UnselectButton = styled.button`
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  transition: color 0.2s;

  &:hover {
    color: #e53e3e;
  }
`;

const StatsList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const StatItem = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const StatLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: #4a5568;
`;

const StatIcon = styled.div`
  color: #3182ce;
`;

const StatValue = styled.span`
  font-weight: 600;
  color: #2d3748;
`;

export const CorpusStats = ({
  corpus,
  onUnselect,
}: {
  corpus: CorpusType;
  onUnselect: () => void;
}) => {
  return (
    <StatsContainer>
      <Header>
        <Title>Corpus: {corpus.title}</Title>
        <UnselectButton onClick={onUnselect} aria-label="Unselect corpus">
          <X size={20} />
        </UnselectButton>
      </Header>
      <StatsList>
        <StatItem>
          <StatLabel>
            <StatIcon>
              <FileText size={18} />
            </StatIcon>
            Documents
          </StatLabel>
          <StatValue>{corpus.documents?.totalCount || 0}</StatValue>
        </StatItem>
        <StatItem>
          <StatLabel>
            <StatIcon>
              <Database size={18} />
            </StatIcon>
            Annotations
          </StatLabel>
          <StatValue>{corpus.annotations?.totalCount || 0}</StatValue>
        </StatItem>
        <StatItem>
          <StatLabel>
            <StatIcon>
              <Users size={18} />
            </StatIcon>
          </StatLabel>
          <StatValue>{corpus?.creator?.email || "Unknown"}</StatValue>
        </StatItem>
      </StatsList>
    </StatsContainer>
  );
};

export default CorpusStats;
