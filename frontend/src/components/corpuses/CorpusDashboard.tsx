import React, { useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import {
  Container,
  Header,
  Icon,
  Input,
  Grid,
  Statistic,
  SemanticICONS,
} from "semantic-ui-react";
import { toast } from "react-toastify";
import { openedQueryObj } from "../../graphql/cache";
import {
  ASK_QUERY_OF_CORPUS,
  AskQueryOfCorpusInputType,
  AskQueryOfCorpusOutputType,
} from "../../graphql/mutations";
import {
  CorpusStats,
  GET_CORPUS_STATS,
  GetCorpusStatsInputType,
  GetCorpusStatsOutputType,
} from "../../graphql/queries";
import CountUp from "react-countup";
import { CorpusType } from "../../types/graphql-api";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { MOBILE_VIEW_BREAKPOINT } from "../../assets/configurations/constants";
import styled from "styled-components";

interface NewQuerySearchProps {
  corpus: CorpusType;
}

const StatisticWithAnimation = ({
  value,
  label,
  icon,
}: {
  value: number;
  label: string;
  icon: SemanticICONS;
}) => {
  const { width } = useWindowDimensions();
  const isDesktop = width > MOBILE_VIEW_BREAKPOINT;

  return (
    <StatisticWrapper>
      <StatisticIcon name={icon} />
      <StatisticContent>
        <StatisticValue>
          <CountUp end={value} duration={1.5} />
        </StatisticValue>
        <StatisticLabel>{label}</StatisticLabel>
      </StatisticContent>
    </StatisticWrapper>
  );
};

// New styled components for better mobile responsiveness
const StatisticWrapper = styled.div`
  display: flex;
  align-items: center;
  padding: 0.75rem;
  background: #f8fafc;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
  }

  @media (min-width: ${MOBILE_VIEW_BREAKPOINT}px) {
    flex-direction: column;
    text-align: center;
    padding: 1.25rem 1rem;
  }
`;

const StatisticIcon = styled(Icon)`
  font-size: 1.75rem !important;
  margin: 0 1rem 0 0 !important;
  opacity: 0.8;
  color: #4a90e2;

  @media (min-width: ${MOBILE_VIEW_BREAKPOINT}px) {
    font-size: 2.5rem !important;
    margin: 0 0 0.75rem 0 !important;
  }
`;

const StatisticContent = styled.div`
  display: flex;
  flex-direction: column;
`;

const StatisticValue = styled.div`
  font-size: 1.5rem;
  font-weight: 600;
  color: #2d3748;
  line-height: 1.2;

  @media (min-width: ${MOBILE_VIEW_BREAKPOINT}px) {
    font-size: 2.25rem;
    margin-bottom: 0.25rem;
  }
`;

const StatisticLabel = styled.div`
  font-size: 0.75rem;
  font-weight: 500;
  color: #718096;
  text-transform: uppercase;
  letter-spacing: 0.05em;

  @media (min-width: ${MOBILE_VIEW_BREAKPOINT}px) {
    font-size: 0.875rem;
  }
`;

const DashboardContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 1rem 0.75rem;
  background: white;
  max-width: 1200px;
  margin: 0 auto;

  @media (min-width: ${MOBILE_VIEW_BREAKPOINT}px) {
    padding: 2rem;
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  width: 100%;
  margin: 1rem 0;

  @media (min-width: ${MOBILE_VIEW_BREAKPOINT}px) {
    grid-template-columns: repeat(5, 1fr);
    gap: 1.5rem;
    margin: 1.5rem 0 1rem;
  }
`;

const DashboardHeader = styled(Header)`
  &.ui.header {
    color: #4a90e2;
    font-weight: 500;
    letter-spacing: -0.01em;
    font-size: 1.5rem;
    margin: 0 0 0.5rem 0;
    text-align: center;

    @media (min-width: ${MOBILE_VIEW_BREAKPOINT}px) {
      font-size: 2rem;
      margin: 0 0 1rem 0;
    }
  }
`;

export const CorpusDashboard: React.FC<{ corpus: CorpusType }> = ({
  corpus,
}) => {
  const [stats, setStats] = useState<CorpusStats>({
    totalDocs: 0,
    totalAnalyses: 0,
    totalAnnotations: 0,
    totalExtracts: 0,
    totalComments: 0,
  });

  const { width } = useWindowDimensions();
  const isDesktop = width > MOBILE_VIEW_BREAKPOINT;

  const { loading, error, data } = useQuery<
    GetCorpusStatsOutputType,
    GetCorpusStatsInputType
  >(GET_CORPUS_STATS, {
    variables: { corpusId: corpus.id },
    onCompleted: (data) => {
      setStats(data.corpusStats);
    },
    fetchPolicy: "network-only",
  });

  return (
    <DashboardContainer>
      <DashboardHeader as="h2">
        {isDesktop ? "Corpus Dashboard" : corpus.title}
      </DashboardHeader>

      <StatsGrid>
        <StatisticWithAnimation
          value={stats.totalDocs}
          label="Documents"
          icon="file text"
        />
        <StatisticWithAnimation
          value={stats.totalAnnotations}
          label="Annotations"
          icon="comment"
        />
        <StatisticWithAnimation
          value={stats.totalAnalyses}
          label="Analyses"
          icon="chart bar"
        />
        <StatisticWithAnimation
          value={stats.totalExtracts}
          label="Extracts"
          icon="table"
        />
        <StatisticWithAnimation
          value={stats.totalComments}
          label="Comments"
          icon="comments"
        />
      </StatsGrid>
    </DashboardContainer>
  );
};
