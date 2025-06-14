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
import { CorpusChat } from "./CorpusChat";
import { CorpusType } from "../../types/graphql-api";
import { showQueryViewState } from "../../graphql/cache";
import { PermissionTypes } from "../types";
import { getPermissions } from "../../utils/transform";

// Styled Components
const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fafbfc;
  overflow: hidden;
  position: relative;
`;

const TopBar = styled.div`
  background: white;
  border-bottom: 1px solid #e2e8f0;
  padding: 1.5rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 2rem;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

  @media (max-width: 768px) {
    padding: 1rem;
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
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
  font-size: 1.75rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
  letter-spacing: -0.02em;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  @media (max-width: 768px) {
    font-size: 1.5rem;
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
  gap: 2rem;
  flex-shrink: 0;

  @media (max-width: 1024px) {
    gap: 1.5rem;
  }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: space-between;
  }
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
`;

const StatValue = styled.div`
  font-size: 1.5rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1;
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
  padding: 2rem;
  display: flex;
  justify-content: center;
  min-height: 0;
`;

const ContentWrapper = styled.div`
  width: 100%;
  max-width: 100%;
`;

const ContentWrapperCentered = styled(ContentWrapper)`
  display: flex;
  flex-direction: row;
  justify-content: center;
`;

const DescriptionCard = styled(motion.div)`
  background: white;
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  border: 1px solid #e2e8f0;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  position: relative;
`;

const DescriptionHeader = styled.div`
  padding: 2rem 2.5rem;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fafbfc;
  flex-shrink: 0;
`;

const DescriptionTitle = styled.h2`
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  letter-spacing: -0.01em;

  svg {
    color: #4a90e2;
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
  padding: 2.5rem;
  color: #334155;
  line-height: 1.8;
  font-size: 0.9375rem;
  flex: 1;
  overflow-y: auto;
  position: relative;
  padding-bottom: 6rem; /* Add space for floating search bar */

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: #f1f5f9;
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;

    &:hover {
      background: #94a3b8;
    }
  }

  &.empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 4rem 2.5rem;
    color: #94a3b8;
  }

  /* Enhanced Markdown styling */
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin-top: 2rem;
    margin-bottom: 0.75rem;
    color: #0f172a;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.3;

    &:first-child {
      margin-top: 0;
    }
  }

  h1 {
    font-size: 1.875rem;
  }
  h2 {
    font-size: 1.5rem;
  }
  h3 {
    font-size: 1.25rem;
  }

  p {
    margin-bottom: 1.25rem;
    color: #475569;
  }

  ul,
  ol {
    margin-bottom: 1.25rem;
    padding-left: 1.75rem;
    color: #475569;
  }

  li {
    margin-bottom: 0.5rem;
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
    padding: 1.25rem;
    border-radius: 8px;
    overflow-x: auto;
    margin-bottom: 1.25rem;
  }

  blockquote {
    border-left: 3px solid #4a90e2;
    padding-left: 1.25rem;
    margin: 1.5rem 0;
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
    margin: 2rem 0;
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

const ChatModal = styled(motion.div)`
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 400px;
  height: 600px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 1000;

  @media (max-width: 768px) {
    width: calc(100vw - 2rem);
    height: calc(100vh - 6rem);
    right: 1rem;
    bottom: 1rem;
  }
`;

const ChatHeader = styled.div`
  background: #4a90e2;
  color: white;
  padding: 1rem 1.25rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;

  h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  button {
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    padding: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 0.2s;

    &:hover {
      background: rgba(255, 255, 255, 0.2);
    }
  }
`;

const ChatContent = styled.div`
  flex: 1;
  overflow: hidden;
`;

const LoadingPlaceholder = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  animation: pulse 1.5s ease-in-out infinite;

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
  }

  .title-skeleton {
    width: 200px;
    height: 24px;
    background: #e2e8f0;
    border-radius: 6px;
  }

  .line-skeleton {
    height: 16px;
    background: #e2e8f0;
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
`;

const FloatingSearchBar = styled(motion.div)<{ $expanded: boolean }>`
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: ${(props) => (props.$expanded ? "16px" : "24px")};
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: ${(props) =>
    props.$expanded ? "0.875rem 1.25rem" : "0.75rem 1rem"};
  width: ${(props) => (props.$expanded ? "60%" : "220px")};
  max-width: 600px;
  min-width: 240px;
  z-index: 10;
  transition: all 0.3s ease;

  @media (max-width: 768px) {
    width: ${(props) => (props.$expanded ? "calc(100% - 4rem)" : "180px")};
    max-width: calc(100% - 4rem);
  }
`;

const SearchIconWrapper = styled.div`
  color: #64748b;
  display: flex;
  align-items: center;
  flex-shrink: 0;
`;

const SearchInput = styled(motion.input)`
  flex: 1;
  border: none;
  outline: none;
  font-size: 0.9375rem;
  color: #1e293b;
  background: transparent;
  min-width: 0;

  &::placeholder {
    color: #94a3b8;
  }
`;

const SearchPrompt = styled(motion.span)`
  color: #64748b;
  font-size: 0.875rem;
  font-weight: 500;
  white-space: nowrap;
`;

const SearchActions = styled(motion.div)`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const SearchActionButton = styled(motion.button)`
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #f1f5f9;
  border: none;
  color: #4a90e2;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: #4a90e2;
    color: white;
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
  const [showChat, setShowChat] = useState(false);
  const [mdContent, setMdContent] = useState<string | null>(null);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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

  const handleQuickAction = (action: string) => {
    switch (action) {
      case "chat":
        setShowChat(true);
        break;
      case "history":
        showQueryViewState("VIEW");
        break;
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setShowChat(true);
      setSearchExpanded(false);
      setSearchQuery("");
    }
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
    <Container>
      <TopBar>
        <CorpusInfo>
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

      <MainContent>
        <ContentWrapper id="corpus-home-content">
          <DescriptionCard
            id="corpus-home-description-card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
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

            {/* Floating search bar */}
            <ContentWrapperCentered
              id="corpus-home-search-bar"
              style={{ margin: "1 rem" }}
            >
              {(mdContent || corpus.description) && (
                <FloatingSearchBar
                  $expanded={searchExpanded}
                  onMouseEnter={() => setSearchExpanded(true)}
                  onMouseLeave={() => !searchQuery && setSearchExpanded(false)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  <form
                    onSubmit={handleSearchSubmit}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      flex: 1,
                    }}
                  >
                    <SearchIconWrapper>
                      <Search size={18} />
                    </SearchIconWrapper>

                    <AnimatePresence>
                      {searchExpanded ? (
                        <SearchInput
                          key="input"
                          type="text"
                          placeholder="Ask a question about this corpus..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: "100%" }}
                          exit={{ opacity: 0, width: 0 }}
                          transition={{ duration: 0.2 }}
                          autoFocus
                        />
                      ) : (
                        <SearchPrompt
                          key="prompt"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          Ask a question...
                        </SearchPrompt>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {searchExpanded && (
                        <SearchActions
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: "auto" }}
                          exit={{ opacity: 0, width: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <Popup
                            content="View conversation history"
                            position="top center"
                            trigger={
                              <SearchActionButton
                                type="button"
                                onClick={() => {
                                  showQueryViewState("VIEW");
                                  setSearchExpanded(false);
                                }}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                              >
                                <Activity />
                              </SearchActionButton>
                            }
                          />
                          <SearchActionButton
                            type="submit"
                            style={{ background: "#4a90e2", color: "white" }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <ArrowRight />
                          </SearchActionButton>
                        </SearchActions>
                      )}
                    </AnimatePresence>
                  </form>
                </FloatingSearchBar>
              )}
            </ContentWrapperCentered>
          </DescriptionCard>
        </ContentWrapper>
      </MainContent>

      <AnimatePresence>
        {showChat && (
          <ChatModal
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <ChatHeader>
              <h3>Corpus Assistant</h3>
              <button onClick={() => setShowChat(false)}>
                <X size={20} />
              </button>
            </ChatHeader>
            <ChatContent>
              <CorpusChat
                corpusId={corpus.id}
                showLoad={false}
                initialQuery=""
                setShowLoad={() => {}}
                onMessageSelect={() => {}}
                forceNewChat={true}
              />
            </ChatContent>
          </ChatModal>
        )}
      </AnimatePresence>
    </Container>
  );
};
