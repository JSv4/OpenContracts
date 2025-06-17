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
  background: linear-gradient(to bottom, #f8fafc 0%, #f1f5f9 100%);
  overflow: hidden;
  position: relative;
`;

const TopBar = styled.div`
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(226, 232, 240, 0.8);
  padding: 1.75rem 2.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 2rem;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

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
  gap: 2.5rem;
  flex-shrink: 0;

  @media (max-width: 1024px) {
    gap: 2rem;
  }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: space-between;
    gap: 1rem;
  }
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  position: relative;

  &::after {
    content: "";
    position: absolute;
    right: -1.25rem;
    top: 50%;
    transform: translateY(-50%);
    width: 1px;
    height: 24px;
    background: #e2e8f0;
  }

  &:last-child::after {
    display: none;
  }

  @media (max-width: 768px) {
    &::after {
      right: -0.5rem;
    }
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
  overflow: hidden;
  padding: 2.5rem;
  display: flex;
  justify-content: center;
  min-height: 0;

  @media (max-width: 768px) {
    padding: 1.5rem 1rem;
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
  border-radius: 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  border: 1px solid rgba(226, 232, 240, 0.8);
  display: flex;
  flex-direction: column;
  position: relative;
  flex: 1;
  min-height: 0;
`;

const DescriptionHeader = styled.div`
  padding: 1.75rem 2rem;
  border-bottom: 1px solid rgba(241, 245, 249, 0.8);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(to right, #fafbfc 0%, #f8fafc 100%);
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

// Always-visible button that opens conversation history
const HistoryButton = styled.button`
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  color: #4a90e2;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transition: all 0.25s ease;

  &:hover {
    background: #4a90e2;
    color: #ffffff;
  }
`;

const ChatSection = styled(motion.div)`
  background: white;
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  border: 1px solid #e2e8f0;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
`;

// Add new styled component for prominent search section
const SearchSection = styled(motion.div)`
  background: linear-gradient(135deg, #4a90e2 0%, #357abd 100%);
  border-radius: 20px;
  padding: 2.5rem;
  box-shadow: 0 8px 24px rgba(74, 144, 226, 0.25);
  position: relative;
  overflow: hidden;
  flex-shrink: 0;

  &::before {
    content: "";
    position: absolute;
    top: -50%;
    right: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(
      circle,
      rgba(255, 255, 255, 0.1) 0%,
      transparent 70%
    );
    animation: float 20s infinite linear;
  }

  @keyframes float {
    0% {
      transform: translate(0, 0) rotate(0deg);
    }
    100% {
      transform: translate(-50%, -50%) rotate(360deg);
    }
  }

  @media (max-width: 768px) {
    padding: 2rem 1.5rem;
  }
`;

const SearchSectionContent = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1.5rem;
`;

const SearchSectionTitle = styled.h2`
  color: white;
  font-size: 1.875rem;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.02em;

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const SearchSectionSubtitle = styled.p`
  color: rgba(255, 255, 255, 0.9);
  font-size: 1.125rem;
  margin: 0;
  max-width: 500px;
  line-height: 1.5;

  @media (max-width: 768px) {
    font-size: 1rem;
  }
`;

const SearchBar = styled(motion.form)`
  width: 100%;
  max-width: 600px;
  display: flex;
  gap: 0.75rem;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const SearchInputWrapper = styled.div`
  flex: 1;
  position: relative;
`;

const SearchInputField = styled.input`
  width: 100%;
  padding: 1rem 1.25rem 1rem 3.5rem;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  background: white;
  color: #0f172a;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;

  &::placeholder {
    color: #94a3b8;
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.3),
      0 4px 12px rgba(0, 0, 0, 0.15);
  }
`;

const SearchInputIcon = styled.div`
  position: absolute;
  left: 1.25rem;
  top: 50%;
  transform: translateY(-50%);
  color: #64748b;
`;

const SearchButton = styled(motion.button)`
  padding: 1rem 2rem;
  background: white;
  color: #4a90e2;
  border: none;
  border-radius: 12px;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
  }

  &:active {
    transform: translateY(0);
  }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;

const QuickActions = styled.div`
  display: flex;
  gap: 1rem;
  margin-top: 0.5rem;
`;

const QuickActionButton = styled(motion.button)`
  padding: 0.625rem 1.25rem;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;

  &:hover {
    background: rgba(255, 255, 255, 0.3);
    border-color: rgba(255, 255, 255, 0.5);
  }
`;

// Unified search container that morphs between collapsed and expanded states
const SearchContainer = styled(motion.div)<{ $expanded: boolean }>`
  background: linear-gradient(135deg, #4a90e2 0%, #357abd 100%);
  border-radius: ${(props) => (props.$expanded ? "20px" : "16px")};
  padding: ${(props) => (props.$expanded ? "2rem 2.5rem" : "1rem 1.5rem")};
  box-shadow: 0 4px 12px rgba(74, 144, 226, 0.2);
  display: flex;
  flex-direction: column;
  gap: ${(props) => (props.$expanded ? "1rem" : "0.75rem")};
  transition: all 0.3s ease;
  flex-shrink: 0;
  cursor: ${(props) => (props.$expanded ? "default" : "pointer")};
  width: 100%;
  max-width: ${(props) => (props.$expanded ? "900px" : "600px")};
  margin: 0 auto;

  &:hover {
    box-shadow: 0 6px 20px rgba(74, 144, 226, 0.3);
  }

  @media (max-width: 768px) {
    padding: ${(props) => (props.$expanded ? "1.5rem" : "0.875rem 1.25rem")};
  }
`;

const SearchContent = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  color: white;
  flex: 1;
`;

const SearchText = styled.div`
  flex: 1;
  cursor: pointer;

  h3 {
    font-size: 1.125rem;
    font-weight: 600;
    margin: 0;
    margin-bottom: 0.25rem;
  }

  p {
    font-size: 0.875rem;
    margin: 0;
    opacity: 0.9;
  }
`;

const ExpandIcon = styled.div`
  color: white;
  transition: transform 0.3s ease;
  cursor: pointer;

  &:hover {
    transform: translateX(4px);
  }
`;

// Add new styled component for the collapsible search input
const CollapsedSearchInput = styled.textarea`
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  font-size: 0.9375rem;
  font-family: inherit;
  background: rgba(255, 255, 255, 0.95);
  color: #0f172a;
  resize: none;
  min-height: 42px;
  max-height: calc(1.5em * 5); /* 5 lines max */
  overflow-y: auto;
  transition: all 0.2s ease;
  line-height: 1.5;
  cursor: text;

  &::placeholder {
    color: #64748b;
  }

  &:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.5);
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.2);
  }

  /* Custom scrollbar */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(74, 144, 226, 0.6);
    border-radius: 3px;

    &:hover {
      background: rgba(74, 144, 226, 0.8);
    }
  }
`;

const CollapsedSearchActions = styled.div`
  display: flex;
  gap: 0.5rem;
  align-items: center;
`;

const CollapsedSearchButton = styled(motion.button)`
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.95);
  color: #4a90e2;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;

  &:hover {
    background: white;
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
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
  const [searchInput, setSearchInput] = useState("");
  const [initialChatQuery, setInitialChatQuery] = useState<string>("");
  const [isSearchSectionExpanded, setIsSearchSectionExpanded] = useState(false);

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

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedQuery = searchInput.trim();
    if (trimmedQuery) {
      setInitialChatQuery(trimmedQuery);
      setShowChat(true);
      setSearchExpanded(false);
      setSearchInput("");
    }
  };

  const handleTextareaKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSearchSubmit();
    }
  };

  const adjustTextareaHeight = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    textarea.style.height = "auto";
    const newHeight = Math.min(
      textarea.scrollHeight,
      parseFloat(getComputedStyle(textarea).lineHeight) * 5
    );
    textarea.style.height = `${newHeight}px`;
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
          <AnimatePresence initial={false} exitBeforeEnter>
            {showChat ? (
              <ChatSection
                key="chat-section"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.4 }}
                style={{ height: "100%", minHeight: 0 }}
              >
                <CorpusChat
                  corpusId={corpus.id}
                  showLoad={false}
                  initialQuery={initialChatQuery}
                  setShowLoad={() => {}}
                  onMessageSelect={() => {}}
                  forceNewChat={true}
                  onClose={() => setShowChat(false)}
                />
              </ChatSection>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                  height: "100%",
                  gap: "2rem",
                }}
              >
                <AnimatePresence exitBeforeEnter>
                  <SearchContainer
                    data-testid="search-container"
                    $expanded={isSearchSectionExpanded}
                    layout
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    onMouseEnter={() => setIsSearchSectionExpanded(true)}
                    onMouseLeave={() => setIsSearchSectionExpanded(false)}
                    onClick={() => setIsSearchSectionExpanded(true)}
                  >
                    {/* Expanded header & quick actions */}
                    {isSearchSectionExpanded && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          width: "100%",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <SearchSectionTitle style={{ color: "white" }}>
                            Ask Questions About This Corpus
                          </SearchSectionTitle>
                          <SearchSectionSubtitle
                            style={{ color: "rgba(255,255,255,0.9)" }}
                          >
                            Get instant answers and insights from your documents
                          </SearchSectionSubtitle>
                        </div>
                        <motion.button
                          style={{
                            background: "rgba(255, 255, 255, 0.2)",
                            border: "1px solid rgba(255, 255, 255, 0.3)",
                            borderRadius: "8px",
                            padding: "0.5rem",
                            cursor: "pointer",
                            color: "white",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsSearchSectionExpanded(false);
                          }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <X size={20} />
                        </motion.button>
                      </div>
                    )}

                    {/* Shared input form */}
                    <form
                      onSubmit={handleSearchSubmit}
                      style={{
                        display: "flex",
                        gap: "0.75rem",
                        alignItems: "flex-end",
                        width: "100%",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <CollapsedSearchInput
                          placeholder="Ask a question about this corpus..."
                          value={searchInput}
                          onChange={(e) => {
                            setSearchInput(e.target.value);
                            adjustTextareaHeight(e);
                          }}
                          onKeyDown={handleTextareaKeyDown}
                          rows={1}
                        />
                      </div>
                      <CollapsedSearchActions>
                        <CollapsedSearchButton
                          type="submit"
                          disabled={!searchInput.trim()}
                          whileHover={searchInput.trim() ? { scale: 1.02 } : {}}
                          whileTap={searchInput.trim() ? { scale: 0.98 } : {}}
                          title="Ask"
                        >
                          <MessageCircle size={16} />
                        </CollapsedSearchButton>
                        <CollapsedSearchButton
                          type="button"
                          onClick={() => showQueryViewState("VIEW")}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          title="Conversation history"
                        >
                          <Activity size={16} />
                        </CollapsedSearchButton>
                      </CollapsedSearchActions>
                    </form>

                    {/* Quick actions shown only when expanded */}
                    {isSearchSectionExpanded && (
                      <QuickActions>
                        <QuickActionButton
                          onClick={() => {
                            setSearchInput(
                              "What are the key themes in this corpus?"
                            );
                            handleSearchSubmit(new Event("submit") as any);
                          }}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Sparkles size={16} />
                          Key Themes
                        </QuickActionButton>
                        <QuickActionButton
                          onClick={() => showQueryViewState("VIEW")}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <Activity size={16} />
                          View History
                        </QuickActionButton>
                      </QuickActions>
                    )}
                  </SearchContainer>
                </AnimatePresence>

                <DescriptionCard
                  key="description-card"
                  id="corpus-home-description-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
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
                          No description yet. Help others understand what this
                          corpus contains.
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
              </div>
            )}
          </AnimatePresence>
        </ContentWrapper>
      </MainContent>
    </Container>
  );
};
