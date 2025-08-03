/**
 * SelectDocumentFieldsetModal
 *
 * This modal displays a list of available fieldsets for the user to choose from.
 * Once a fieldset is selected, it can initiate a document-level extract by
 * calling the START_DOCUMENT_EXTRACT mutation.
 */

import React, { FC, useEffect, useMemo, useState } from "react";
import { Modal, Button, Input, Card, Header, Popup } from "semantic-ui-react";
import { useQuery, useMutation } from "@apollo/client";
import {
  GET_FIELDSETS,
  GetFieldsetsInputs,
  GetFieldsetsOutputs,
} from "../../../graphql/queries";
import {
  START_DOCUMENT_EXTRACT,
  StartDocumentExtractInput,
  StartDocumentExtractOutput,
} from "../../../graphql/mutations";
import { FieldsetType } from "../../../types/graphql-api";
import styled from "styled-components";
import { motion } from "framer-motion";
import { toast } from "react-toastify";
import {
  Search,
  FileText,
  Play,
  Type,
  Hash,
  ToggleLeft,
  Calendar,
  List,
} from "lucide-react";

/* Reusable styled components for a consistent look,
   mimicking the style of SelectDocumentAnalyzerModal */

const ModalContent = styled(Modal.Content)`
  min-height: 60vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const SearchContainer = styled.div`
  position: sticky;
  top: 0;
  padding: 1rem 1.5rem;
  background: linear-gradient(to bottom, white 85%, rgba(255, 255, 255, 0));
  z-index: 2;
  margin-bottom: 0.5rem;
`;

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

const SearchInput = styled(Input)`
  width: 100%;
  input {
    padding-left: 2.5rem !important;
    border-radius: 20px !important;
    background: #f8f9fa !important;
    border: 1px solid #e9ecef !important;
    transition: all 0.2s ease !important;

    &:focus {
      background: white !important;
      border-color: #4a90e2 !important;
      box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2) !important;
      transform: translateY(-1px);
    }
  }
`;

const FieldsetGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(450px, 1fr));
  gap: 1.5rem;
  padding: 1.5rem;
  max-height: calc(70vh - 60px);
  overflow-y: auto;

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

const FieldDetails = styled.div`
  margin-top: 1rem;
  border-top: 1px solid #e9ecef;
  padding-top: 0.5rem;
`;

const FieldsList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
`;

const FieldPopupContent = styled.div`
  padding: 0.5rem;
  max-width: 300px;

  .field-name {
    font-size: 1.1rem;
    font-weight: 600;
    color: #1a202c;
    margin-bottom: 0.5rem;
  }

  .field-meta {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    font-size: 0.8rem;
    color: #64748b;
  }

  .field-section {
    margin-top: 0.75rem;

    .label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
      margin-bottom: 0.25rem;
    }

    .content {
      font-size: 0.9rem;
      color: #475569;
      background: #f8fafc;
      padding: 0.5rem;
      border-radius: 4px;
      font-family: monospace;
    }
  }
`;

const FieldPill = styled.div`
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 0.35rem 0.85rem;
  font-size: 0.85rem;
  color: #475569;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #e2e8f0;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }
`;

const StyledCard = styled(Card)<{ $selected?: boolean }>`
  width: 100% !important;
  height: auto !important;
  min-height: 220px !important;
  margin: 0 !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 12px !important;
  overflow: hidden !important;
  background: white !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05) !important;
  display: flex !important;
  flex-direction: column !important;
  position: relative !important;
  transition: all 0.2s ease !important;

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
`;

const NoResults = styled.div`
  text-align: center;
  padding: 3rem;
  color: #666;
  font-size: 1.1rem;
  grid-column: 1 / -1;
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

const DescriptionContainer = styled.div`
  margin-top: 0.5rem;
  font-size: 0.9rem;
  color: #475569;
  flex: 1;
  overflow-y: auto;
  line-height: 1.4;

  &::-webkit-scrollbar {
    width: 6px;
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(74, 144, 226, 0.2);
    border-radius: 3px;
    &:hover {
      background: rgba(74, 144, 226, 0.3);
    }
  }
`;

const EmptyDescription = styled.div`
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: #94a3b8;
  font-size: 0.9rem;
`;

interface SelectDocumentFieldsetModalProps {
  documentId: string;
  corpusId: string;
  open: boolean;
  onClose: () => void;
}

export const SelectDocumentFieldsetModal: FC<
  SelectDocumentFieldsetModalProps
> = ({ documentId, corpusId, open, onClose }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFieldset, setSelectedFieldset] = useState<string | null>(null);

  const { data: fieldsetData, loading: loadingFieldsets } = useQuery<
    GetFieldsetsOutputs,
    GetFieldsetsInputs
  >(GET_FIELDSETS, {
    fetchPolicy: "network-only",
  });

  /** Mutation to start a document extract using the selected fieldset */
  const [startDocumentExtract, { loading: startingDocumentExtract }] =
    useMutation<StartDocumentExtractOutput, StartDocumentExtractInput>(
      START_DOCUMENT_EXTRACT
    );

  /* Whenever the modal closes, reset search/selection */
  useEffect(() => {
    if (!open) {
      setSearchTerm("");
      setSelectedFieldset(null);
    }
  }, [open]);

  /** Filter fieldsets by search term */
  const filteredFieldsets = useMemo(() => {
    if (!fieldsetData?.fieldsets?.edges) return [];
    const allFieldsets = fieldsetData.fieldsets.edges
      .map((edge) => edge.node)
      .filter(Boolean) as FieldsetType[];

    if (!searchTerm) return allFieldsets;
    const lowerSearch = searchTerm.toLowerCase();
    return allFieldsets.filter(
      (fs) =>
        fs.name.toLowerCase().includes(lowerSearch) ||
        (fs.description || "").toLowerCase().includes(lowerSearch)
    );
  }, [fieldsetData, searchTerm]);

  const selectedFieldsetObj = useMemo<FieldsetType | null>(() => {
    if (!selectedFieldset) return null;
    return filteredFieldsets.find((fs) => fs.id === selectedFieldset) || null;
  }, [selectedFieldset, filteredFieldsets]);

  /** Handler to initiate the doc-level extract */
  const handleStartExtract = async () => {
    if (!selectedFieldset) {
      toast.error("Please select a fieldset");
      return;
    }
    try {
      const res = await startDocumentExtract({
        variables: {
          documentId,
          fieldsetId: selectedFieldset,
          corpusId,
        },
      });
      if (res.data?.startExtractForDoc.ok) {
        toast.success("Document extract started successfully");
        onClose();
      } else {
        const msg = res.data?.startExtractForDoc.message || "Unknown error";
        toast.error(`Failed to start document extract: ${msg}`);
      }
    } catch (error) {
      console.error("Error starting document extract:", error);
      toast.error("Error starting document extract");
    }
  };

  const getFieldTypeIcon = (outputType: string) => {
    switch (outputType.toLowerCase()) {
      case "string":
        return <Type size={12} />;
      case "number":
        return <Hash size={12} />;
      case "boolean":
        return <ToggleLeft size={12} />;
      case "date":
        return <Calendar size={12} />;
      default:
        return <FileText size={12} />;
    }
  };

  // Helper function to prettify task name
  const prettifyTaskName = (taskName: string): string => {
    const parts = taskName.split(".");
    return parts[parts.length - 1]
      .replace(/_/g, " ")
      .replace(/([A-Z])/g, " $1")
      .trim();
  };

  // Add this helper function
  const getShortTaskName = (taskName: string): string => {
    const parts = taskName.split(".");
    // Get last two parts, or just the last if there's only one
    const relevantParts = parts.slice(-2);
    return relevantParts
      .join(".")
      .replace(/_/g, " ")
      .replace(/tasks?\./, "")
      .replace(/extract_tasks?\./, "");
  };

  console.log(filteredFieldsets);

  return (
    <Modal open={open} onClose={onClose} size="large">
      <Modal.Header>
        <Header as="h2" style={{ margin: 0 }}>
          Select Fieldset
        </Header>
      </Modal.Header>

      <ModalContent>
        <SearchContainer>
          <SearchIcon>
            <Search size={18} />
          </SearchIcon>
          <SearchInput
            placeholder="Search fieldsets..."
            value={searchTerm}
            onChange={(e: {
              target: { value: React.SetStateAction<string> };
            }) => setSearchTerm(e.target.value)}
            fluid
          />
        </SearchContainer>

        <FieldsetGrid>
          {loadingFieldsets ? (
            <NoResults>Loading fieldsets...</NoResults>
          ) : filteredFieldsets.length === 0 ? (
            <NoResults>No matching fieldsets found</NoResults>
          ) : (
            filteredFieldsets.map((fs, index) => {
              const isSelected = selectedFieldset === fs.id;
              const columnCount = fs.columns?.edges?.length || 0;

              return (
                <motion.div
                  key={fs.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <StyledCard
                    onClick={() => setSelectedFieldset(fs.id)}
                    $selected={isSelected}
                  >
                    <Card.Content>
                      <Card.Header style={{ marginBottom: "0.5rem" }}>
                        {fs.name}
                      </Card.Header>
                      <Card.Meta>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <Play size={14} color="#64748b" />
                          {columnCount} {columnCount === 1 ? "field" : "fields"}{" "}
                          to extract
                        </div>
                      </Card.Meta>
                      <DescriptionContainer>
                        {fs.description ? (
                          <>{fs.description}</>
                        ) : (
                          <EmptyDescription>
                            <FileText size={16} />
                            No description provided
                          </EmptyDescription>
                        )}
                      </DescriptionContainer>

                      <FieldDetails>
                        <div
                          style={{
                            fontSize: "0.9rem",
                            color: "#64748b",
                            marginBottom: "0.25rem",
                          }}
                        >
                          Fields to extract:
                        </div>
                        <FieldsList>
                          {fs.columns?.edges?.map(({ node }) => (
                            <Popup
                              key={node.id}
                              trigger={
                                <FieldPill>
                                  {getFieldTypeIcon(node.outputType)}
                                  <span style={{ fontWeight: 500 }}>
                                    {node.name}
                                  </span>
                                  <span
                                    style={{
                                      color: "#94a3b8",
                                      fontSize: "0.8em",
                                      fontStyle: "italic",
                                    }}
                                  >
                                    ({getShortTaskName(node.taskName || "")})
                                  </span>
                                  {node.extractIsList && <List size={12} />}
                                </FieldPill>
                              }
                              position="top center"
                              hoverable
                              wide
                            >
                              <FieldPopupContent>
                                <div className="field-name">
                                  {prettifyTaskName(
                                    node.taskName || "Untitled Field"
                                  )}
                                </div>

                                <div className="field-meta">
                                  <span>
                                    {getFieldTypeIcon(node.outputType)}
                                    {node.outputType}
                                  </span>
                                  {node.extractIsList && (
                                    <span>
                                      <List size={12} />
                                      Multiple values
                                    </span>
                                  )}
                                </div>

                                {node.instructions && (
                                  <div className="field-section">
                                    <div className="label">Instructions</div>
                                    <div className="content">
                                      {node.instructions}
                                    </div>
                                  </div>
                                )}

                                {node.query && (
                                  <div className="field-section">
                                    <div className="label">Query</div>
                                    <div className="content">
                                      {node.query.length > 100
                                        ? `${node.query.slice(0, 100)}...`
                                        : node.query}
                                    </div>
                                  </div>
                                )}
                              </FieldPopupContent>
                            </Popup>
                          ))}
                        </FieldsList>
                      </FieldDetails>
                    </Card.Content>
                  </StyledCard>
                </motion.div>
              );
            })
          )}
        </FieldsetGrid>
      </ModalContent>

      <StyledModalActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          positive
          onClick={handleStartExtract}
          loading={startingDocumentExtract}
          disabled={!selectedFieldset || startingDocumentExtract}
        >
          Start Extract
        </Button>
      </StyledModalActions>
    </Modal>
  );
};
