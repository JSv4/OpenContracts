import React, { useState, useEffect } from "react";
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

interface SelectDocumentAnalyzerModalProps {
  documentId: string;
  corpusId: string;
  open: boolean;
  onClose: () => void;
}

// Styled components
const SearchContainer = styled.div`
  position: relative;
  margin-bottom: 1rem;
`;

const SearchIcon = styled.div`
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #666;
  display: flex;
  align-items: center;
`;

const SearchInput = styled(Input)`
  width: 100%;
  input {
    padding-left: 2.5rem !important;
    border-radius: 20px !important;
    background: #f8f9fa !important;
    border: 1px solid #e9ecef !important;
    &:focus {
      background: white !important;
      border-color: #4a90e2 !important;
      box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2) !important;
    }
  }
`;

const AnalyzerGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  max-height: 60vh;
  overflow-y: auto;
  padding: 0.5rem;

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

const StyledCard = styled(Card)<{ $selected?: boolean }>`
  cursor: pointer !important;
  transition: all 0.2s ease-in-out !important;
  background: ${(props) =>
    props.$selected ? "#e3f2fd !important" : "white !important"};
  border: ${(props) =>
    props.$selected
      ? "2px solid #2196f3 !important"
      : "1px solid #e0e0e0 !important"};
  animation: fadeInUp 0.3s ease forwards;
  animation-delay: ${(props) => props.$delay}ms;
  opacity: 0;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
  }
`;

interface AnalyzerCardProps {
  children: React.ReactNode;
  selected?: boolean;
  onClick: () => void;
  delay: number;
}

const AnalyzerCard: React.FC<AnalyzerCardProps> = ({
  children,
  selected,
  onClick,
  delay,
}) => (
  <StyledCard $selected={selected} $delay={delay} onClick={onClick}>
    {children}
  </StyledCard>
);

const NoResults = styled.div`
  text-align: center;
  padding: 2rem;
  color: #666;
  font-size: 1.1rem;
`;

export const SelectDocumentAnalyzerModal: React.FC<
  SelectDocumentAnalyzerModalProps
> = ({ documentId, corpusId, open, onClose }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAnalyzer, setSelectedAnalyzer] = useState<string | null>(null);

  // Query to get available analyzers
  const { loading: loadingAnalyzers, data: analyzersData } = useQuery<
    GetAnalyzersOutputs,
    GetAnalyzersInputs
  >(GET_ANALYZERS);

  // Mutation to start analysis
  const [startDocumentAnalysis, { loading: startingAnalysis }] = useMutation<
    StartAnalysisOutput,
    StartAnalysisInput
  >(START_ANALYSIS);

  // Filter analyzers based on search term
  const filteredAnalyzers = React.useMemo(() => {
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

  // Reset selection when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedAnalyzer(null);
      setSearchTerm("");
    }
  }, [open]);

  const handleStartAnalysis = async () => {
    if (!selectedAnalyzer) return;

    try {
      const result = await startDocumentAnalysis({
        variables: {
          documentId,
          analyzerId: selectedAnalyzer,
          corpusId,
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
      <Modal.Header>Select Analyzer for Document</Modal.Header>
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
                onClick={() => setSelectedAnalyzer(analyzer.id)}
                delay={index * 50}
              >
                <Card.Content>
                  <Image floated="right" size="mini" src={analyzer_icon} />
                  <Card.Header>
                    {analyzer.manifest?.metadata?.title ||
                      analyzer.analyzerId ||
                      "Untitled Analyzer"}
                  </Card.Header>
                  <Card.Meta>{analyzer.analyzerId}</Card.Meta>
                  <Card.Description>{analyzer.description}</Card.Description>
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

        {selectedAnalyzer && (
          <Message positive>
            <Message.Header>Analyzer Selected</Message.Header>
            <p>
              {filteredAnalyzers.find((a) => a.id === selectedAnalyzer)
                ?.description || "Ready to start analysis"}
            </p>
          </Message>
        )}
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          positive
          onClick={handleStartAnalysis}
          disabled={!selectedAnalyzer || startingAnalysis}
          loading={startingAnalysis}
        >
          Start Analysis
        </Button>
      </Modal.Actions>
    </Modal>
  );
};
