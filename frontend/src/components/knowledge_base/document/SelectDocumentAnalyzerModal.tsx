/**
 * SelectDocumentAnalyzerModal
 *
 * This modal allows the user to choose an analyzer for a document and optionally provide
 * additional input data matching an analyzer's JSON schema (if provided).
 *
 * 1) Displays a searchable list of analyzers.
 * 2) When an analyzer is selected, if the analyzer has an `inputSchema`,
 *    presents a JSON schema form (via rjsf) to collect user input.
 * 3) On confirmation, calls the StartDocumentAnalysis mutation with the user input passed
 *    as `analysisInputData`.
 */

import React, { useState, useEffect, useMemo, FC } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { Modal, Button, Input, Card, Header } from "semantic-ui-react";
import { motion } from "framer-motion";
import { Search, ArrowLeft, FileText, Settings, Play } from "lucide-react";
import { toast } from "react-toastify";
import styled from "styled-components";
import {
  GET_ANALYZERS,
  GetAnalyzersInputs,
  GetAnalyzersOutputs,
} from "../../../graphql/queries";
import {
  START_ANALYSIS,
  StartAnalysisInput,
  StartAnalysisOutput,
} from "../../../graphql/mutations";
import { AnalyzerType } from "../../../types/graphql-api";
import analyzer_icon from "../../../assets/icons/noun-epicyclic-gearing-800132.png";

/* For dynamic schema forms: */
import { SemanticUIForm } from "@rjsf/semantic-ui";
import { RJSFSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";
import ReactMarkdown from "react-markdown";

interface SelectDocumentAnalyzerModalProps {
  documentId: string;
  corpusId: string;
  open: boolean;
  onClose: () => void;
}

/** A container for the search input. */
const SearchContainer = styled.div`
  position: sticky;
  top: 0;
  padding: 1rem 1.5rem;
  background: linear-gradient(to bottom, white 85%, rgba(255, 255, 255, 0));
  z-index: 2;
  margin-bottom: 0.5rem;
`;

/** Enhanced search input with floating label effect */
const SearchInput = styled(Input)`
  width: 100%;
  input {
    padding-left: 2.5rem !important;
    border-radius: 20px !important;
    background: #f8f9fa !important;
    border: 1px solid #e9ecef !important;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;

    &:focus {
      background: white !important;
      border-color: #4a90e2 !important;
      box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2) !important;
      transform: translateY(-1px);
    }
  }
`;

/** Fancy search icon with pulse animation */
const SearchIcon = styled.div`
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #666;
  display: flex;
  align-items: center;

  @keyframes subtle-pulse {
    0% {
      transform: translateY(-50%) scale(1);
    }
    50% {
      transform: translateY(-50%) scale(1.1);
    }
    100% {
      transform: translateY(-50%) scale(1);
    }
  }

  input:focus + & {
    animation: subtle-pulse 1s ease infinite;
    color: #4a90e2;
  }
`;

/** A grid layout for displaying the analyzer cards with vertical scroll */
const AnalyzerGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(450px, 1fr));
  gap: 1.5rem;
  padding: 1.5rem;
  max-height: calc(75vh - 60px);
  overflow-y: auto;

  /* Refined scrollbar */
  &::-webkit-scrollbar {
    width: 8px;
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(74, 144, 226, 0.2);
    border-radius: 4px;

    &:hover {
      background: rgba(74, 144, 226, 0.3);
    }
  }
`;

/** A styled Semantic UI Card with enhanced visual design */
const StyledCard = styled(Card)<{ $selected?: boolean; $hasInputs?: boolean }>`
  width: 100% !important;
  height: 280px !important;
  margin: 0 !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 12px !important;
  overflow: hidden !important;
  background: white !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05) !important;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
  display: flex !important;
  flex-direction: column !important;
  position: relative !important;

  /* Configurable indicator - subtle gradient border */
  ${(props) =>
    props.$hasInputs &&
    `
    &:before {
      content: '';
      position: absolute;
      inset: 0;
      padding: 1px; /* Control the border thickness */
      border-radius: 12px;
      background: linear-gradient(
        135deg,
        rgba(74, 144, 226, 0.2),
        rgba(74, 144, 226, 0.1)
      );
      -webkit-mask: 
        linear-gradient(#fff 0 0) content-box, 
        linear-gradient(#fff 0 0);
      mask: 
        linear-gradient(#fff 0 0) content-box, 
        linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor;
      mask-composite: exclude;
      pointer-events: none;
    }
  `}

  /* Selected state */
  ${(props) =>
    props.$selected &&
    `
    border-color: #4a90e2 !important;
    box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.4) !important;
  `}

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
  }

  /* Configurable card shimmer effect */
  ${(props) =>
    props.$hasInputs &&
    `
    background: linear-gradient(
      135deg,
      #ffffff 0%,
      #ffffff 40%,
      rgba(74, 144, 226, 0.03) 50%,
      #ffffff 60%,
      #ffffff 100%
    ) !important;
    background-size: 200% 200% !important;
    animation: shimmerBg 8s ease-in-out infinite !important;

    @keyframes shimmerBg {
      0% { background-position: 200% 200%; }
      100% { background-position: -200% -200%; }
    }
  `}
`;

const ConfigurabilityIndicator = styled.div<{ $hasInputs: boolean }>`
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.7rem;
  color: ${(props) => (props.$hasInputs ? "#4a90e2" : "#94a3b8")};
  background: ${(props) =>
    props.$hasInputs
      ? "rgba(74, 144, 226, 0.08)"
      : "rgba(148, 163, 184, 0.08)"};
  padding: 4px 8px;
  border-radius: 6px;
  font-weight: 500;
  letter-spacing: 0.02em;

  svg {
    width: 14px;
    height: 14px;
    opacity: 0.8;
  }
`;

// New component to handle analyzer path display
const AnalyzerPath = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: "SF Mono", "Roboto Mono", monospace !important;
  font-size: 0.85rem;
  color: #64748b;
`;

const PathSegment = styled.span<{ $isLast?: boolean }>`
  color: ${(props) => (props.$isLast ? "#1e293b" : "#94a3b8")};
  font-weight: ${(props) => (props.$isLast ? "500" : "400")};

  &:not(:last-child):after {
    content: "•";
    margin-left: 4px;
    color: #cbd5e1;
  }
`;

// Helper function to format analyzer path
const formatAnalyzerPath = (path: string) => {
  const segments = path.split(".");
  // Take last 3 segments or all if less than 3
  const relevantSegments = segments.slice(Math.max(0, segments.length - 3));
  return relevantSegments;
};

const CardHeader = styled.div`
  position: relative;
  padding-right: 3rem;
  margin-bottom: 0.75rem;
`;

const CardTitle = styled.h3`
  font-size: 1.2rem !important;
  color: #1a202c !important;
  line-height: 1.4 !important;
  font-weight: 500 !important;
  margin: 0 !important;
`;

const CardMeta = styled.div`
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  margin-bottom: 1rem !important;
`;

const AnalyzerId = styled.span`
  font-size: 0.85rem !important;
  color: #64748b !important;
  font-family: "SF Mono", "Roboto Mono", monospace !important;
`;

const IconContainer = styled.div<{ $selected?: boolean }>`
  float: right;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: ${(props) => (props.$selected ? "#4a90e2" : "#f5f5f5")};
  transition: all 0.2s ease;
  margin-left: 12px;

  img {
    width: 20px;
    height: 20px;
    opacity: ${(props) => (props.$selected ? 1 : 0.7)};
    transition: opacity 0.2s ease;
    filter: ${(props) => (props.$selected ? "brightness(10)" : "none")};
  }
`;

interface AnalyzerCardProps {
  children: React.ReactNode;
  selected?: boolean;
  hasInputs?: boolean;
  onClick: () => void;
  delay: number;
}

const AnalyzerCard: React.FC<AnalyzerCardProps> = ({
  children,
  selected,
  hasInputs,
  onClick,
  delay,
}) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3, delay: delay * 0.05 }}
  >
    <StyledCard $selected={selected} $hasInputs={hasInputs} onClick={onClick}>
      {children}
    </StyledCard>
  </motion.div>
);

/** A placeholder when no results are found */
const NoResults = styled.div`
  text-align: center;
  padding: 3rem;
  color: #666;
  font-size: 1.1rem;
  grid-column: 1 / -1;

  /* Subtle floating animation */
  animation: float 6s ease-in-out infinite;

  @keyframes float {
    0% {
      transform: translateY(0px);
    }
    50% {
      transform: translateY(-10px);
    }
    100% {
      transform: translateY(0px);
    }
  }
`;

/** Modal actions with gradient button */
const StyledModalActions = styled(Modal.Actions)`
  background: #f8f9fa !important;
  border-top: 1px solid #e9ecef !important;
  padding: 1rem !important;

  .positive.button {
    background: linear-gradient(135deg, #4a90e2 0%, #357abd 100%) !important;
    box-shadow: 0 2px 4px rgba(53, 122, 189, 0.25) !important;
    transition: all 0.2s ease !important;

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(53, 122, 189, 0.3) !important;
    }

    &:disabled {
      opacity: 0.7 !important;
    }
  }
`;

const ModalContent = styled(Modal.Content)`
  min-height: 65vh;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
`;

const SelectionContainer = styled.div<{ $isSelecting: boolean }>`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  opacity: ${(props) => (props.$isSelecting ? 1 : 0)};
  transform: ${(props) =>
    props.$isSelecting ? "translateX(0)" : "translateX(-20px)"};
  pointer-events: ${(props) => (props.$isSelecting ? "all" : "none")};
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
`;

const ConfigurationContainer = styled.div<{ $isConfiguring: boolean }>`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  opacity: ${(props) => (props.$isConfiguring ? 1 : 0)};
  transform: ${(props) =>
    props.$isConfiguring ? "translateX(0)" : "translateX(20px)"};
  pointer-events: ${(props) => (props.$isConfiguring ? "all" : "none")};
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
`;

const ConfigurationContent = styled.div`
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 2rem;
  padding: 1.5rem;
  height: calc(65vh - 40px);
`;

const SelectedAnalyzerSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: flex-start;
`;

const SectionHeader = styled.div`
  padding: 0.5rem 0;

  h3 {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #64748b;
    margin: 0;
    font-weight: 600;
  }
`;

const ConfigurationSection = styled.div`
  background: #f8fafc;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  padding: 1.5rem;
  overflow-y: auto;

  /* Refined scrollbar */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(74, 144, 226, 0.15);
    border-radius: 3px;

    &:hover {
      background: rgba(74, 144, 226, 0.25);
    }
  }
`;

const ConfigurationHeader = styled.div`
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid #e2e8f0;

  h2 {
    font-size: 1.1rem;
    color: #1a202c;
    margin: 0 0 0.5rem 0;
    font-weight: 600;
  }

  p {
    color: #64748b;
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.5;
  }
`;

const BackButton = styled.button`
  background: none;
  border: none;
  color: #4a90e2;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s ease;

  svg {
    transition: transform 0.2s ease;
  }

  &:hover {
    color: #357abd;

    svg {
      transform: translateX(-2px);
    }
  }
`;

const MarkdownDescription = styled.div`
  flex: 1;
  overflow-y: auto;
  padding-right: 0.5rem;
  font-size: 0.95rem;
  line-height: 1.6;
  color: #475569;
  max-height: 150px; // Ensure scrollability

  /* Refined scrollbar */
  &::-webkit-scrollbar {
    width: 4px;
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(74, 144, 226, 0.15);
    border-radius: 2px;

    &:hover {
      background: rgba(74, 144, 226, 0.25);
    }
  }

  /* Fade out effect at the bottom */
  mask-image: linear-gradient(to bottom, black 85%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 85%, transparent 100%);
`;

// New component for empty state with beautiful patterns
const EmptyDescription = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  position: relative;
  overflow: hidden;

  /* Beautiful geometric pattern background */
  &:before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
          135deg,
          transparent 25%,
          rgba(74, 144, 226, 0.02) 25%
        ) -10px 0,
      linear-gradient(225deg, rgba(74, 144, 226, 0.02) 25%, transparent 25%) -10px
        0,
      linear-gradient(315deg, transparent 25%, rgba(74, 144, 226, 0.02) 25%),
      linear-gradient(45deg, rgba(74, 144, 226, 0.02) 25%, transparent 25%);
    background-size: 20px 20px;
    opacity: 0.5;
  }

  /* Floating animation */
  animation: float 6s ease-in-out infinite;
  @keyframes float {
    0% {
      transform: translateY(0px);
    }
    50% {
      transform: translateY(-10px);
    }
    100% {
      transform: translateY(0px);
    }
  }
`;

const EmptyStateIcon = styled(FileText)`
  color: #94a3b8;
  margin-bottom: 1rem;
  opacity: 0.5;
  stroke-width: 1.5;
`;

const EmptyStateText = styled.div`
  text-align: center;
  color: #94a3b8;
  font-size: 0.9rem;
  line-height: 1.5;
  max-width: 200px;

  strong {
    display: block;
    font-size: 1.1rem;
    color: #64748b;
    margin-bottom: 0.5rem;
  }
`;

// New component for short descriptions
const ShortDescription = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  position: relative;
  background: linear-gradient(
    135deg,
    rgba(248, 250, 252, 0.5),
    rgba(241, 245, 249, 0.8)
  );
  border-radius: 8px;
  margin-top: 1rem;

  /* Animated background patterns */
  &:before {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(
        circle at 0% 0%,
        rgba(74, 144, 226, 0.03) 20%,
        transparent 20.5%
      ),
      radial-gradient(
        circle at 100% 0%,
        rgba(74, 144, 226, 0.03) 20%,
        transparent 20.5%
      ),
      radial-gradient(
        circle at 100% 100%,
        rgba(74, 144, 226, 0.03) 20%,
        transparent 20.5%
      ),
      radial-gradient(
        circle at 0% 100%,
        rgba(74, 144, 226, 0.03) 20%,
        transparent 20.5%
      );
    background-size: 50px 50px;
    border-radius: 8px;
    opacity: 0.5;
    animation: patternFloat 15s linear infinite;
  }

  @keyframes patternFloat {
    0% {
      background-position: 0 0;
    }
    100% {
      background-position: 50px 50px;
    }
  }

  p {
    position: relative;
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.6;
    color: #475569;
  }
`;

export const SelectDocumentAnalyzerModal: FC<
  SelectDocumentAnalyzerModalProps
> = ({ documentId, corpusId, open, onClose }) => {
  /** Keeps track of what the user typed in the search bar. */
  const [searchTerm, setSearchTerm] = useState("");
  /** The currently selected analyzer's ID. */
  const [selectedAnalyzer, setSelectedAnalyzer] = useState<string | null>(null);
  /**
   * If the selected analyzer supports providing additional input data, this object
   * stores the user input in alignment with that analyzer's JSON schema.
   */
  const [analysisInputData, setAnalysisInputData] = useState<
    Record<string, any>
  >({});

  /** Query to get available analyzers. */
  const { loading: loadingAnalyzers, data: analyzersData } = useQuery<
    GetAnalyzersOutputs,
    GetAnalyzersInputs
  >(GET_ANALYZERS, {
    fetchPolicy: "network-only",
  });

  /** Mutation to start analysis on the chosen analyzer with optional user input data. */
  const [startDocumentAnalysis, { loading: startingAnalysis }] = useMutation<
    StartAnalysisOutput,
    StartAnalysisInput
  >(START_ANALYSIS);

  /**
   * If the user changes their selected analyzer,
   * reset the user-input data for the new analyzer (or none).
   */
  useEffect(() => {
    setAnalysisInputData({});
  }, [selectedAnalyzer]);

  // Add this effect to reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSearchTerm("");
      setSelectedAnalyzer(null);
      setAnalysisInputData({});
    }
  }, [open]);

  /** A filtered list of analyzers based on the search term. */
  const filteredAnalyzers = useMemo(() => {
    if (!analyzersData?.analyzers.edges) return [];

    const analyzers = analyzersData.analyzers.edges
      .map((edge) => edge.node)
      .filter(Boolean) as AnalyzerType[];

    if (!searchTerm) return analyzers;

    const searchLower = searchTerm.toLowerCase();
    return analyzers.filter(
      (analyzer) =>
        analyzer.analyzerId?.toLowerCase().includes(searchLower) ||
        analyzer.description?.toLowerCase().includes(searchLower) ||
        analyzer.manifest?.metadata?.title?.toLowerCase().includes(searchLower)
    );
  }, [analyzersData, searchTerm]);

  /**
   * A memoized reference to the actual analyzer object the user selected, if any.
   */
  const selectedAnalyzerObj = useMemo<AnalyzerType | null>(() => {
    if (!selectedAnalyzer) return null;
    return filteredAnalyzers.find((a) => a.id === selectedAnalyzer) || null;
  }, [selectedAnalyzer, filteredAnalyzers]);

  /**
   * Handler for initiating the analysis. Gathers the user-provided
   * analysisInputData if the analyzer requires input, then calls the mutation.
   */
  const handleStartAnalysis = async () => {
    if (!selectedAnalyzer) return;

    try {
      const result = await startDocumentAnalysis({
        variables: {
          documentId,
          analyzerId: selectedAnalyzer,
          corpusId,
          analysisInputData: analysisInputData, // pass the object from state
        },
      });

      if (result.data?.startAnalysisOnDoc.ok) {
        toast.success("Analysis started successfully");
        onClose();
      } else {
        toast.error(
          result.data?.startAnalysisOnDoc.message || "Failed to start analysis"
        );
      }
    } catch (error) {
      console.error("Error starting analysis:", error);
      toast.error("Error starting analysis");
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="large">
      <Modal.Header>
        <Header as="h2" style={{ margin: 0 }}>
          {selectedAnalyzer && selectedAnalyzerObj?.inputSchema
            ? "Configure Analyzer"
            : "Select Analyzer"}
        </Header>
      </Modal.Header>

      <ModalContent>
        {/* Selection View */}
        <SelectionContainer
          $isSelecting={!selectedAnalyzer || !selectedAnalyzerObj?.inputSchema}
        >
          <SearchContainer>
            <SearchIcon>
              <Search size={18} />
            </SearchIcon>
            <SearchInput
              placeholder="Search analyzers..."
              value={searchTerm}
              onChange={(e: {
                target: { value: React.SetStateAction<string> };
              }) => setSearchTerm(e.target.value)}
              fluid
            />
          </SearchContainer>
          <AnalyzerGrid>
            {filteredAnalyzers.length > 0 ? (
              filteredAnalyzers.map((analyzer, index) => {
                const hasInputs = !!(
                  analyzer.inputSchema &&
                  Object.keys(analyzer.inputSchema).length > 0
                );
                const pathSegments = formatAnalyzerPath(
                  analyzer.analyzerId || ""
                );

                return (
                  <AnalyzerCard
                    key={analyzer.id}
                    selected={selectedAnalyzer === analyzer.id}
                    hasInputs={hasInputs}
                    onClick={() => setSelectedAnalyzer(analyzer.id)}
                    delay={index}
                  >
                    <Card.Content>
                      <ConfigurabilityIndicator $hasInputs={hasInputs}>
                        {hasInputs ? (
                          <>
                            <Settings size={14} className="settings-icon" />
                            Configurable
                          </>
                        ) : (
                          <>
                            <Play size={14} />
                            Ready to Run
                          </>
                        )}
                      </ConfigurabilityIndicator>

                      <CardHeader>
                        <CardTitle>
                          {analyzer.manifest?.metadata?.title ||
                            pathSegments[pathSegments.length - 1] ||
                            "Untitled Analyzer"}
                        </CardTitle>
                      </CardHeader>

                      <CardMeta>
                        <AnalyzerPath>
                          {pathSegments.map((segment, idx) => (
                            <PathSegment
                              key={idx}
                              $isLast={idx === pathSegments.length - 1}
                            >
                              {segment}
                            </PathSegment>
                          ))}
                        </AnalyzerPath>
                      </CardMeta>

                      {analyzer.description ? (
                        analyzer.description.length < 100 ? (
                          <ShortDescription>
                            <ReactMarkdown>
                              {analyzer.description}
                            </ReactMarkdown>
                          </ShortDescription>
                        ) : (
                          <MarkdownDescription>
                            <ReactMarkdown>
                              {analyzer.description}
                            </ReactMarkdown>
                          </MarkdownDescription>
                        )
                      ) : (
                        <EmptyDescription>
                          <EmptyStateIcon size={28} />
                          <EmptyStateText>
                            <strong>No Description Yet</strong>
                            This analyzer is ready to run but hasn't shared its
                            secrets
                          </EmptyStateText>
                        </EmptyDescription>
                      )}
                    </Card.Content>
                  </AnalyzerCard>
                );
              })
            ) : (
              <NoResults>
                {searchTerm
                  ? "No analyzers match your search"
                  : "No analyzers available"}
              </NoResults>
            )}
          </AnalyzerGrid>
        </SelectionContainer>

        {/* Configuration View */}
        {selectedAnalyzer && selectedAnalyzerObj?.inputSchema && (
          <ConfigurationContainer $isConfiguring={true}>
            <BackButton onClick={() => setSelectedAnalyzer(null)}>
              <ArrowLeft size={16} />
              Back to Analyzers
            </BackButton>

            <ConfigurationContent>
              <SelectedAnalyzerSection>
                <SectionHeader>
                  <h3>Selected Analyzer</h3>
                </SectionHeader>

                {/* Calculate hasInputs for the selected analyzer */}
                {(() => {
                  const hasInputs = !!(
                    selectedAnalyzerObj?.inputSchema &&
                    Object.keys(selectedAnalyzerObj.inputSchema).length > 0
                  );

                  return (
                    <StyledCard $selected $hasInputs={hasInputs}>
                      <Card.Content>
                        <IconContainer $selected>
                          <img src={analyzer_icon} alt="" />
                        </IconContainer>
                        <Card.Header>
                          {selectedAnalyzerObj?.manifest?.metadata?.title ||
                            selectedAnalyzerObj?.analyzerId ||
                            "Untitled Analyzer"}
                        </Card.Header>
                        <Card.Meta>
                          <span>{selectedAnalyzerObj?.analyzerId}</span>
                          <ConfigurabilityIndicator $hasInputs={hasInputs}>
                            {hasInputs ? (
                              <>
                                <Settings size={14} className="settings-icon" />
                                Configurable
                              </>
                            ) : (
                              <>
                                <Play size={14} />
                                Ready to Run
                              </>
                            )}
                          </ConfigurabilityIndicator>
                        </Card.Meta>
                        <Card.Description>
                          <MarkdownDescription>
                            <ReactMarkdown>
                              {selectedAnalyzerObj?.description || ""}
                            </ReactMarkdown>
                          </MarkdownDescription>
                        </Card.Description>
                      </Card.Content>
                    </StyledCard>
                  );
                })()}
              </SelectedAnalyzerSection>

              <ConfigurationSection>
                <ConfigurationHeader>
                  <h2>Configure Analysis</h2>
                  <p>
                    Customize how this analyzer processes your document by
                    providing additional settings below.
                  </p>
                </ConfigurationHeader>

                <SemanticUIForm
                  schema={selectedAnalyzerObj?.inputSchema as RJSFSchema}
                  validator={validator}
                  formData={analysisInputData}
                  onChange={(e: {
                    formData: React.SetStateAction<Record<string, any>>;
                  }) => setAnalysisInputData(e.formData)}
                  uiSchema={{
                    "ui:submitButtonOptions": { norender: true },
                    "*": {
                      "ui:classNames": "form-field",
                      "ui:errorElement": "div",
                    },
                  }}
                >
                  <></>
                </SemanticUIForm>
              </ConfigurationSection>
            </ConfigurationContent>
          </ConfigurationContainer>
        )}
      </ModalContent>

      <StyledModalActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          positive
          onClick={handleStartAnalysis}
          disabled={!selectedAnalyzer || startingAnalysis}
          loading={startingAnalysis}
        >
          {selectedAnalyzerObj?.inputSchema
            ? "Start Analysis with Configuration"
            : "Start Analysis"}
        </Button>
      </StyledModalActions>
    </Modal>
  );
};
