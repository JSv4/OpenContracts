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
import {
  Modal,
  Button,
  Dimmer,
  Loader,
  Form,
  Message,
  Input,
  Card,
  Image,
  Header,
} from "semantic-ui-react";
import { motion, AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";
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
import { TruncatedText } from "../../widgets/data-display/TruncatedText";

interface SelectDocumentAnalyzerModalProps {
  documentId: string;
  corpusId: string;
  open: boolean;
  onClose: () => void;
}

/** A container for the search input. */
const SearchContainer = styled.div`
  position: relative;
  margin-bottom: 1rem;
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
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.2rem;
  max-height: 65vh;
  overflow-y: auto;
  padding: 1rem;
  scroll-behavior: smooth;

  /* Glass-morphism scrollbar */
  &::-webkit-scrollbar {
    width: 10px;
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 10px;
    border: 2px solid transparent;
    background-clip: padding-box;

    &:hover {
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid transparent;
    }
  }
`;

/** A styled Semantic UI Card with enhanced visual design */
const StyledCard = styled(Card)<{ $selected?: boolean; $hasInputs?: boolean }>`
  cursor: pointer !important;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
  height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  background: ${(props) =>
    props.$selected ? "#f8f9ff !important" : "white !important"};
  border: ${(props) =>
    props.$selected
      ? "2px solid #4a90e2 !important"
      : "1px solid #e0e0e0 !important"};
  box-shadow: ${(props) =>
    props.$selected
      ? "0 8px 16px rgba(74, 144, 226, 0.12) !important"
      : "0 2px 4px rgba(0, 0, 0, 0.02) !important"};
  position: relative;
  animation: fadeInUp 0.3s ease forwards;
  animation-delay: ${(props) => props.$delay}ms;
  opacity: 0;

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.08) !important;
  }

  /* Input indicator as a subtle left border accent */
  border-left: ${(props) =>
    props.$hasInputs
      ? `4px solid ${props.$selected ? "#4a90e2" : "#e0e0e0"}`
      : "1px solid #e0e0e0"} !important;

  /* Status dot in the meta section */
  .meta {
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;

    &:before {
      content: "";
      display: ${(props) => (props.$hasInputs ? "block" : "none")};
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: ${(props) => (props.$selected ? "#4a90e2" : "#94a3b8")};
      transition: all 0.2s ease;
    }
  }

  /* Enhanced input indicator badge */
  .input-indicator {
    font-size: 0.7rem !important;
    background: ${(props) =>
      props.$selected
        ? "rgba(74, 144, 226, 0.12)"
        : "rgba(148, 163, 184, 0.12)"} !important;
    color: ${(props) => (props.$selected ? "#4a90e2" : "#64748b")} !important;
    padding: 4px 8px !important;
    border-radius: 12px !important;
    font-weight: 600 !important;
    letter-spacing: 0.5px !important;
    text-transform: uppercase !important;
    margin-left: auto !important;
    transition: all 0.2s ease !important;
    border: 1px solid
      ${(props) =>
        props.$selected
          ? "rgba(74, 144, 226, 0.24)"
          : "rgba(148, 163, 184, 0.24)"} !important;

    /* Subtle hover effect */
    &:hover {
      transform: translateY(-1px);
      background: ${(props) =>
        props.$selected
          ? "rgba(74, 144, 226, 0.16)"
          : "rgba(148, 163, 184, 0.16)"} !important;
    }

    /* Optional: Add a subtle icon */
    &:before {
      content: "⚡️";
      margin-right: 4px;
      font-size: 0.8rem;
    }
  }

  .content {
    padding: 1.2rem !important;
    flex: 1 0 auto !important;
  }

  .header {
    font-size: 1.1rem !important;
    color: #2c3e50 !important;
    margin-bottom: 0.5rem !important;
    font-weight: 600 !important;
    padding-right: ${(props) => (props.$hasInputs ? "100px" : "0")} !important;
  }

  .meta {
    color: #7f8c8d !important;
    font-size: 0.85rem !important;
    font-family: "SF Mono", "Roboto Mono", monospace !important;
    margin-bottom: 0.8rem !important;
  }

  .description {
    color: #34495e !important;
    line-height: 1.5 !important;
    font-size: 0.95rem !important;
  }

  .extra.content {
    background: ${(props) =>
      props.$selected ? "#f0f7ff !important" : "#f8f9fa !important"};
    border-top: 1px solid
      ${(props) => (props.$selected ? "#e3effd !important" : "#eee !important")};
    padding: 0.8rem 1.2rem !important;
    font-size: 0.9rem !important;
    color: #666 !important;
    flex-shrink: 0 !important;
  }
`;

/** A styled container for the analyzer icon */
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
  <StyledCard
    $selected={selected}
    $hasInputs={hasInputs}
    $delay={delay}
    onClick={onClick}
  >
    {children}
  </StyledCard>
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
  >(GET_ANALYZERS);

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
        <Header
          as="h2"
          style={{ margin: 0, display: "flex", alignItems: "center" }}
        >
          <span>Select Analyzer</span>
          {loadingAnalyzers && (
            <Loader active inline size="tiny" style={{ marginLeft: "1rem" }} />
          )}
        </Header>
      </Modal.Header>
      <Modal.Content>
        {(loadingAnalyzers || startingAnalysis) && (
          <Dimmer active>
            <Loader>Loading...</Loader>
          </Dimmer>
        )}

        <SearchContainer>
          <SearchIcon>
            <Search size={18} />
          </SearchIcon>
          <SearchInput
            placeholder="Search analyzers..."
            value={searchTerm}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchTerm(e.target.value)
            }
            fluid
          />
        </SearchContainer>

        <AnalyzerGrid>
          {filteredAnalyzers.length > 0 ? (
            filteredAnalyzers.map((analyzer, index) => (
              <AnalyzerCard
                key={analyzer.id}
                selected={selectedAnalyzer === analyzer.id}
                hasInputs={
                  !!(
                    analyzer.inputSchema &&
                    Object.keys(analyzer.inputSchema).length > 0
                  )
                }
                onClick={() => setSelectedAnalyzer(analyzer.id)}
                delay={index * 50}
              >
                <Card.Content>
                  <IconContainer $selected={selectedAnalyzer === analyzer.id}>
                    <img src={analyzer_icon} alt="" />
                  </IconContainer>
                  <Card.Header>
                    <TruncatedText
                      text={
                        analyzer.manifest?.metadata?.title ||
                        analyzer.analyzerId ||
                        "Untitled Analyzer"
                      }
                      limit={40}
                    />
                  </Card.Header>
                  <Card.Meta>
                    <TruncatedText
                      text={analyzer.analyzerId || ""}
                      limit={35}
                      style={{
                        fontFamily: "'SF Mono', 'Roboto Mono', monospace",
                      }}
                    />
                    {analyzer.inputSchema &&
                      Object.keys(analyzer.inputSchema).length > 0 && (
                        <span className="input-indicator">Configurable</span>
                      )}
                  </Card.Meta>
                  <Card.Description>
                    <TruncatedText
                      text={analyzer.description || ""}
                      limit={120}
                    />
                  </Card.Description>
                </Card.Content>
                {analyzer.manifest?.metadata?.author_name && (
                  <Card.Content extra>
                    Created by {analyzer.manifest.metadata.author_name}
                  </Card.Content>
                )}
              </AnalyzerCard>
            ))
          ) : (
            <NoResults>
              {searchTerm
                ? "No analyzers match your search"
                : "No analyzers available"}
            </NoResults>
          )}
        </AnalyzerGrid>

        {selectedAnalyzerObj && selectedAnalyzer && (
          <Message positive style={{ marginTop: "2rem" }}>
            <Message.Header>Analyzer Selected</Message.Header>
            <p>
              {selectedAnalyzerObj?.description ?? "Ready to start analysis."}
            </p>
          </Message>
        )}

        {/* If this analyzer has an inputSchema, show a JSON schema form (similar to how post-processor forms are handled). */}
        {selectedAnalyzerObj?.inputSchema &&
          Object.keys(selectedAnalyzerObj.inputSchema).length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <Message info>
                <Message.Header>Analyzer Additional Input</Message.Header>
                <p>Please provide any additional settings for this analyzer.</p>
              </Message>

              <div
                style={{
                  margin: "1rem 0",
                  backgroundColor: "#fafafa",
                  padding: "1rem",
                  borderRadius: "6px",
                  border: "1px solid #e8e8e8",
                }}
              >
                <SemanticUIForm
                  schema={selectedAnalyzerObj.inputSchema as RJSFSchema}
                  validator={validator}
                  formData={analysisInputData}
                  onChange={(e: {
                    formData: React.SetStateAction<Record<string, any>>;
                  }) => setAnalysisInputData(e.formData)}
                  uiSchema={{
                    "ui:submitButtonOptions": { norender: true },
                  }}
                >
                  <></>
                </SemanticUIForm>
              </div>
            </div>
          )}
      </Modal.Content>
      <StyledModalActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          positive
          onClick={handleStartAnalysis}
          disabled={!selectedAnalyzer || startingAnalysis}
          loading={startingAnalysis}
        >
          Start Analysis
        </Button>
      </StyledModalActions>
    </Modal>
  );
};
