import React, { useState, useEffect } from "react";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import {
  Button,
  Icon,
  Loader,
  Popup,
  Header as SemanticHeader,
} from "semantic-ui-react";
import { useQuery, useLazyQuery } from "@apollo/client";
import {
  FileText,
  MessageSquare,
  Factory,
  Table,
  Users,
  Brain,
  Edit,
  Search,
  Home,
  ArrowLeft,
  BarChart3,
  Clock,
  TrendingUp,
  BookOpen,
  ChevronRight,
  Zap,
  Activity,
  Sparkles,
  ArrowRight,
  MoreVertical,
  Hash,
  Plus,
  Shield,
  Globe,
  Calendar,
  PenTool,
  X,
  MessageCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import {
  GET_CORPUS_STATS,
  GET_CORPUS_WITH_HISTORY,
  GetCorpusWithHistoryQuery,
  GetCorpusWithHistoryQueryVariables,
} from "../../graphql/queries";
import { SafeMarkdown } from "../knowledge_base/markdown/SafeMarkdown";
import { CorpusType } from "../../types/graphql-api";
import { showQueryViewState } from "../../graphql/cache";
import { PermissionTypes } from "../types";
import { getPermissions } from "../../utils/transform";

// Styled Components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  background: #f8fafc;
  overflow: hidden;
  position: relative;
`;

const TopBar = styled.div`
  background: white;
  border-bottom: 1px solid #e2e8f0;
  padding: 1.75rem 2.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 2rem;
  flex-shrink: 0;

  @media (max-width: 768px) {
    padding: 1.25rem 1rem;
    flex-direction: column;
    align-items: flex-start;
    gap: 1.25rem;
  }
`;

const CorpusInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const TitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.5rem;
`;

const CorpusTitle = styled.h1`
  font-size: 1.875rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  letter-spacing: -0.025em;
  line-height: 1.1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: 768px) {
    font-size: 1.625rem;
  }
`;

const AccessBadge = styled.div<{ isPublic?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.625rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 500;
  background: ${(props) => (props.isPublic ? "#dcfce7" : "#fef3c7")};
  color: ${(props) => (props.isPublic ? "#15803d" : "#92400e")};
  flex-shrink: 0;

  svg {
    width: 12px;
    height: 12px;
  }
`;

const MetadataRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1.5rem;
  color: #64748b;
  font-size: 0.8125rem;
  flex-wrap: wrap;

  .meta-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;

    svg {
      width: 14px;
      height: 14px;
      stroke-width: 2;
    }
  }

  .separator {
    width: 1px;
    height: 16px;
    background: #e2e8f0;
  }
`;

const StatsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-shrink: 0;

  > *:not(:last-child)::after {
    content: "";
    position: absolute;
    right: -0.75rem;
    top: 50%;
    transform: translateY(-50%);
    width: 1px;
    height: 20px;
    background: #e2e8f0;
  }

  > * {
    position: relative;
  }

  @media (max-width: 1024px) {
    gap: 1.25rem;
  }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: space-between;
    gap: 0.5rem;

    > *:not(:last-child)::after {
      display: none;
    }
  }
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;

  @media (max-width: 768px) {
    flex: 1;
    min-width: 0;
  }
`;

const StatValue = styled.div`
  font-size: 1.625rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1;
  letter-spacing: -0.02em;
`;

const StatLabel = styled.div`
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.025em;
`;

const MainContent = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1rem 0.25rem;
  display: flex;
  justify-content: center;
  min-height: 0;
  @media (max-width: 768px) {
    padding: 1.5rem 1rem;
    padding-bottom: 180px;
  }
`;

const ContentWrapper = styled.div`
  width: 100%;
  max-width: 1200px;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  min-height: 0;
  flex: 1;
`;

const DescriptionCard = styled(motion.div)`
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  position: relative;
  flex: 1;
  min-height: 0;
`;

const DescriptionHeader = styled.div`
  padding: 1.75rem 2rem;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fafbfc;
  flex-shrink: 0;
`;

const DescriptionTitle = styled.h2`
  margin: 0;
  font-size: 1.375rem;
  font-weight: 700;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 0.625rem;
  letter-spacing: -0.015em;

  svg {
    color: #4a90e2;
    opacity: 0.8;
  }
`;

const ActionButtons = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
`;

const HeaderHistoryButton = styled(Button)`
  &&& {
    background: transparent;
    color: #64748b;
    border: none;
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.375rem;

    &:hover {
      background: #f8fafc;
      color: #4a90e2;
    }
  }
`;

const HeaderEditButton = styled(Button)`
  &&& {
    background: #4a90e2;
    color: white;
    border: none;
    border-radius: 8px;
    padding: 0.375rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.375rem;

    &:hover {
      background: #357abd;
    }
  }
`;

const DescriptionContent = styled.div`
  padding: 2rem;
  color: #334155;
  line-height: 1.75;
  font-size: 0.9375rem;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  min-height: 0;
  max-height: 100%;

  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #f8fafc;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: #e2e8f0;
    border-radius: 4px;

    &:hover {
      background: #cbd5e1;
    }
  }

  &.empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 3rem 2rem;
    color: #94a3b8;
    min-height: 200px;
    overflow-y: visible;
  }

  /* Enhanced Markdown styling */
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin-top: 1.75rem;
    margin-bottom: 0.875rem;
    color: #0f172a;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.4;

    &:first-child {
      margin-top: 0;
    }
  }

  h1 {
    font-size: 1.75rem;
  }
  h2 {
    font-size: 1.375rem;
  }
  h3 {
    font-size: 1.125rem;
  }

  p {
    margin-bottom: 1.125rem;
    color: #475569;
  }

  ul,
  ol {
    margin-bottom: 1.125rem;
    padding-left: 1.5rem;
    color: #475569;
  }

  li {
    margin-bottom: 0.375rem;
  }

  code {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    font-size: 0.875em;
    font-family: "SF Mono", Monaco, monospace;
    color: #0f172a;
  }

  pre {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    padding: 1rem;
    border-radius: 8px;
    overflow-x: auto;
    margin-bottom: 1.125rem;
  }

  blockquote {
    border-left: 3px solid #4a90e2;
    padding-left: 1rem;
    margin: 1.25rem 0;
    color: #475569;
    font-style: italic;
  }

  a {
    color: #4a90e2;
    text-decoration: none;
    font-weight: 500;
    transition: color 0.2s;

    &:hover {
      color: #357abd;
      text-decoration: underline;
    }
  }

  hr {
    border: none;
    height: 1px;
    background: #e2e8f0;
    margin: 1.75rem 0;
  }
`;

const AddDescriptionButton = styled(Button)`
  &&& {
    background: white;
    color: #4a90e2;
    border: 2px dashed #cbd5e1;
    border-radius: 8px;
    padding: 1rem 1.5rem;
    font-weight: 500;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;

    &:hover {
      border-color: #4a90e2;
      background: #f0f7ff;
      transform: translateY(-1px);
    }
  }
`;

const LoadingPlaceholder = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  animation: pulse 1.5s ease-in-out infinite;

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 0.8;
    }
  }

  .title-skeleton {
    width: 200px;
    height: 24px;
    background: linear-gradient(90deg, #e2e8f0 0%, #f1f5f9 50%, #e2e8f0 100%);
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
    border-radius: 6px;
  }

  .line-skeleton {
    height: 16px;
    background: linear-gradient(90deg, #e2e8f0 0%, #f1f5f9 50%, #e2e8f0 100%);
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
    border-radius: 4px;

    &.short {
      width: 60%;
    }
    &.medium {
      width: 80%;
    }
    &.long {
      width: 100%;
    }
  }

  .paragraph-skeleton {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }
`;

interface CorpusHomeProps {
  corpus: CorpusType;
  onEditDescription: () => void;
}

export const CorpusHome: React.FC<CorpusHomeProps> = ({
  corpus,
  onEditDescription,
}) => {
  const [mdContent, setMdContent] = useState<string | null>(null);

  // Fetch corpus stats
  const { data: statsData, loading: statsLoading } = useQuery(
    GET_CORPUS_STATS,
    {
      variables: { corpusId: corpus.id },
    }
  );

  // Fetch corpus with description history
  const { data: corpusData, loading: corpusLoading } = useQuery<
    GetCorpusWithHistoryQuery,
    GetCorpusWithHistoryQueryVariables
  >(GET_CORPUS_WITH_HISTORY, {
    variables: { id: corpus.id },
  });

  // Fetch markdown content from URL
  useEffect(() => {
    if (corpusData?.corpus?.mdDescription) {
      fetch(corpusData.corpus.mdDescription)
        .then((res) => res.text())
        .then((text) => setMdContent(text))
        .catch((err) => {
          console.error("Error fetching corpus description:", err);
          setMdContent(null);
        });
    }
  }, [corpusData]);

  const stats = statsData?.corpusStats || {
    totalDocs: 0,
    totalAnnotations: 0,
    totalAnalyses: 0,
    totalExtracts: 0,
  };

  const canEdit = getPermissions(corpus.myPermissions || []).includes(
    PermissionTypes.CAN_UPDATE
  );

  const statItems = [
    { label: "Docs", value: stats.totalDocs },
    { label: "Notes", value: stats.totalAnnotations },
    { label: "Analyses", value: stats.totalAnalyses },
    { label: "Extracts", value: stats.totalExtracts },
  ];

  return (
    <Container id="corpus-home-container">
      <TopBar id="corpus-home-top-bar">
        <CorpusInfo id="corpus-home-corpus-info">
          <TitleRow>
            <CorpusTitle>{corpus.title}</CorpusTitle>
            <AccessBadge isPublic={corpus.isPublic}>
              {corpus.isPublic ? (
                <>
                  <Globe size={12} />
                  Public
                </>
              ) : (
                <>
                  <Shield size={12} />
                  Private
                </>
              )}
            </AccessBadge>
          </TitleRow>

          <MetadataRow>
            <div className="meta-item">
              <Users size={14} />
              <span>{corpus.creator?.email || "Unknown creator"}</span>
            </div>
            <div className="separator" />
            <div className="meta-item">
              <Calendar size={14} />
              <span>
                Created{" "}
                {corpus.created
                  ? formatDistanceToNow(new Date(corpus.created), {
                      addSuffix: true,
                    })
                  : "recently"}
              </span>
            </div>
            {corpus.labelSet && (
              <>
                <div className="separator" />
                <div className="meta-item">
                  <Hash size={14} />
                  <span>{corpus.labelSet.title}</span>
                </div>
              </>
            )}
          </MetadataRow>
        </CorpusInfo>

        <StatsRow>
          {statItems.map((stat) => (
            <StatItem key={stat.label}>
              <StatValue>
                {statsLoading ? "-" : stat.value.toLocaleString()}
              </StatValue>
              <StatLabel>{stat.label}</StatLabel>
            </StatItem>
          ))}
        </StatsRow>
      </TopBar>

      <MainContent id="corpus-home-main-content">
        <ContentWrapper id="corpus-home-content">
          <DescriptionCard
            key="description-card"
            id="corpus-home-description-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{ minHeight: 0 }}
          >
            <DescriptionHeader>
              <DescriptionTitle>
                <BookOpen size={20} />
                About this Corpus
              </DescriptionTitle>
              <ActionButtons>
                {(mdContent || corpus.description) && (
                  <HeaderHistoryButton onClick={onEditDescription}>
                    <Activity size={14} />
                    Version History
                  </HeaderHistoryButton>
                )}
                {canEdit && (
                  <HeaderEditButton onClick={onEditDescription}>
                    {mdContent || corpus.description ? (
                      <>
                        <Edit size={14} />
                        Edit Description
                      </>
                    ) : (
                      <>
                        <Plus size={14} />
                        Add Description
                      </>
                    )}
                  </HeaderEditButton>
                )}
              </ActionButtons>
            </DescriptionHeader>

            <DescriptionContent
              className={!mdContent && !corpus.description ? "empty" : ""}
            >
              {corpusLoading ? (
                <LoadingPlaceholder>
                  <div className="title-skeleton"></div>
                  <div className="paragraph-skeleton">
                    <div className="line-skeleton long"></div>
                    <div className="line-skeleton long"></div>
                    <div className="line-skeleton medium"></div>
                  </div>
                  <div className="paragraph-skeleton">
                    <div className="line-skeleton long"></div>
                    <div className="line-skeleton short"></div>
                  </div>
                  <div className="paragraph-skeleton">
                    <div className="line-skeleton medium"></div>
                    <div className="line-skeleton long"></div>
                    <div className="line-skeleton medium"></div>
                    <div className="line-skeleton short"></div>
                  </div>
                </LoadingPlaceholder>
              ) : mdContent ? (
                <SafeMarkdown>{mdContent}</SafeMarkdown>
              ) : corpus.description ? (
                <p>{corpus.description}</p>
              ) : (
                <>
                  <Sparkles
                    size={48}
                    style={{ marginBottom: "1rem", color: "#cbd5e1" }}
                  />
                  <p
                    style={{
                      fontSize: "1.125rem",
                      color: "#64748b",
                      marginBottom: "1.5rem",
                    }}
                  >
                    No description yet. Help others understand what this corpus
                    contains.
                  </p>
                  {canEdit && (
                    <AddDescriptionButton onClick={onEditDescription}>
                      <Plus size={18} />
                      Add Description
                    </AddDescriptionButton>
                  )}
                </>
              )}
            </DescriptionContent>
          </DescriptionCard>
        </ContentWrapper>
      </MainContent>
    </Container>
  );
};
