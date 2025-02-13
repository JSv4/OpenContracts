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
import { Search, ArrowLeft } from "lucide-react";
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
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.2rem;
  padding: 1rem;
  max-height: calc(65vh - 60px); // Account for search bar
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
  width: 100%;
  max-width: 320px;
  height: auto !important;
  margin: 0 !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 8px !important;
  overflow: hidden !important;
  background: white !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05) !important;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;

  ${(props) =>
    props.$selected &&
    `
    border-color: #4a90e2 !important;
    box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.4) !important;
  `}

  &:hover {
    border-color: ${(props) =>
      props.$selected ? "#4a90e2" : "#cbd5e1"} !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
    transform: translateY(-2px);
  }

  .content {
    padding: 1.2rem !important;
    height: auto !important;

    .header {
      font-size: 1rem !important;
      color: #1a202c !important;
      margin-bottom: 0.5rem !important;
      line-height: 1.4 !important;
      font-weight: 500 !important;
    }

    .meta {
      font-size: 0.8rem !important;
      color: #64748b !important;
      font-family: "SF Mono", "Roboto Mono", monospace !important;
      margin-bottom: 0.8rem !important;
      display: flex !important;
      align-items: center !important;
      justify-content: space-between !important;
    }

    .description {
      color: #475569 !important;
      font-size: 0.9rem !important;
      line-height: 1.5 !important;
    }
  }
`;

const SelectedCardWrapper = styled.div`
  height: fit-content;
  position: relative;

  /* Refined highlight with subtle pulse animation */
  ${StyledCard} {
    box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.4) !important;
    animation: cardPulse 3s ease-in-out infinite;
  }

  @keyframes cardPulse {
    0% {
      box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.4);
    }
    50% {
      box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
    }
    100% {
      box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.4);
    }
  }
`;

const ConfigurableTag = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 95px;
  font-size: 0.7rem;
  color: #4a90e2;
  background: rgba(74, 144, 226, 0.08);
  padding: 4px 10px;
  border-radius: 12px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  white-space: nowrap;

  /* Shimmer effect contained properly */
  &:after {
    content: "";
    position: absolute;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    background: linear-gradient(
      45deg,
      transparent,
      rgba(255, 255, 255, 0.4),
      transparent
    );
    transform: translateX(-100%) rotate(45deg);
    animation: shimmer 3s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }

  /* Adjusted bolt positioning */
  &:before {
    content: "⚡";
    font-size: 0.8rem;
    margin-right: 4px;
    animation: boltPulse 2s ease-in-out infinite;
    display: inline-block;
  }

  @keyframes shimmer {
    0% {
      transform: translateX(-100%) rotate(45deg);
    }
    100% {
      transform: translateX(100%) rotate(45deg);
    }
  }

  @keyframes boltPulse {
    0% {
      transform: scale(1);
      opacity: 0.7;
    }
    50% {
      transform: scale(1.2);
      opacity: 1;
    }
    100% {
      transform: scale(1);
      opacity: 0.7;
    }
  }

  /* Hover state with scale and glow */
  ${StyledCard}:hover & {
    transform: translateY(-1px);
    background: rgba(74, 144, 226, 0.12);
    box-shadow: 0 2px 8px rgba(74, 144, 226, 0.15);
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
  <StyledCard $selected={selected} $hasInputs={hasInputs} onClick={onClick}>
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
                          <ConfigurableTag>Configurable</ConfigurableTag>
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

                <StyledCard $selected $hasInputs>
                  <Card.Content>
                    <IconContainer $selected>
                      <img src={analyzer_icon} alt="" />
                    </IconContainer>
                    <Card.Header>
                      <TruncatedText
                        text={
                          selectedAnalyzerObj?.manifest?.metadata?.title ||
                          selectedAnalyzerObj?.analyzerId ||
                          "Untitled Analyzer"
                        }
                        limit={40}
                      />
                    </Card.Header>
                    <Card.Meta>
                      <TruncatedText
                        text={selectedAnalyzerObj?.analyzerId || ""}
                        limit={35}
                        style={{
                          fontFamily: "'SF Mono', 'Roboto Mono', monospace",
                        }}
                      />
                      <ConfigurableTag>Configurable</ConfigurableTag>
                    </Card.Meta>
                    <Card.Description>
                      <TruncatedText
                        text={selectedAnalyzerObj?.description || ""}
                        limit={120}
                      />
                    </Card.Description>
                  </Card.Content>
                </StyledCard>
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
