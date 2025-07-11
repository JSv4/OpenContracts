import React, { useState } from "react";
import { Modal, Button, Header, Loader } from "semantic-ui-react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { History, User, Clock, GitBranch, Eye, Copy } from "lucide-react";
import { format } from "date-fns";
import { SafeMarkdown } from "../../markdown/SafeMarkdown";
import { DocumentSummaryRevision } from "./graphql/documentSummaryQueries";

interface SummaryHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  revisions: DocumentSummaryRevision[];
  currentVersion: number;
  currentContent: string | null;
  documentTitle: string;
  onRevertToVersion?: (revision: DocumentSummaryRevision) => Promise<boolean>;
  isLoading?: boolean;
}

const StyledModal = styled(Modal)`
  &&& {
    width: 80vw;
    max-width: 1000px;
    height: 80vh !important;
    max-height: 80vh !important;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  }
`;

const ModalContent = styled(Modal.Content)`
  &&& {
    display: flex !important;
    padding: 0 !important;
    height: calc(80vh - 60px) !important;
    overflow: hidden !important;
  }
`;

const HistoryPanel = styled.div`
  width: 350px;
  background: #f8fafc;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
`;

const HistoryHeader = styled.div`
  padding: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  background: white;

  h3 {
    margin: 0;
    font-size: 1.125rem;
    color: #1e293b;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .version-count {
    margin-top: 0.375rem;
    font-size: 0.875rem;
    color: #64748b;
  }
`;

const HistoryList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
`;

const VersionItem = styled(motion.button)<{
  $isActive: boolean;
  $isCurrent: boolean;
}>`
  width: 100%;
  padding: 1rem;
  border: 1px solid
    ${(props) =>
      props.$isActive ? "#4a90e2" : props.$isCurrent ? "#10b981" : "#e2e8f0"};
  border-radius: 8px;
  background: ${(props) =>
    props.$isActive ? "#eff6ff" : props.$isCurrent ? "#f0fdf4" : "white"};
  text-align: left;
  cursor: pointer;
  margin-bottom: 0.5rem;
  transition: all 0.2s;

  &:hover {
    border-color: ${(props) => (props.$isActive ? "#4a90e2" : "#a78bfa")};
    background: ${(props) => (props.$isActive ? "#eff6ff" : "#f9fafb")};
    transform: translateX(2px);
  }

  .version-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;

    .version-number {
      font-weight: 600;
      color: ${(props) =>
        props.$isActive ? "#4a90e2" : props.$isCurrent ? "#10b981" : "#1e293b"};
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }

    .version-badge {
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
      background: ${(props) =>
        props.$isActive ? "#4a90e2" : props.$isCurrent ? "#10b981" : "#e2e8f0"};
      color: ${(props) =>
        props.$isActive || props.$isCurrent ? "white" : "#64748b"};
    }
  }

  .version-meta {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.8125rem;
    color: #64748b;

    .meta-row {
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }
  }
`;

const ContentPanel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: white;
`;

const ContentHeader = styled.div`
  padding: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  background: linear-gradient(to right, #f8fafc, #f1f5f9);

  h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1.125rem;
    color: #1e293b;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .version-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }
`;

const ContentBody = styled.div`
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
  background: white;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #94a3b8;
  text-align: center;

  svg {
    margin-bottom: 1rem;
  }
`;

const StyledButton = styled(Button)<{ $variant?: "primary" | "secondary" }>`
  &&& {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    font-weight: 500;
    font-size: 0.875rem;
    transition: all 0.2s;

    ${(props) =>
      props.$variant === "primary" &&
      `
      background: #4a90e2;
      color: white;
      &:hover {
        background: #357abd;
      }
    `}

    ${(props) =>
      props.$variant === "secondary" &&
      `
      background: white;
      color: #64748b;
      border: 1px solid #e2e8f0;
      &:hover {
        background: #f8fafc;
        border-color: #cbd5e1;
      }
    `}
  }
`;

export const SummaryHistoryModal: React.FC<SummaryHistoryModalProps> = ({
  isOpen,
  onClose,
  revisions,
  currentVersion,
  currentContent,
  documentTitle,
  onRevertToVersion,
  isLoading = false,
}) => {
  const [selectedRevision, setSelectedRevision] =
    useState<DocumentSummaryRevision | null>(null);
  const [isReverting, setIsReverting] = useState(false);

  // Sort revisions by version (newest first)
  const sortedRevisions = [...revisions].sort((a, b) => b.version - a.version);

  const getRevisionContent = (revision: DocumentSummaryRevision): string => {
    if (revision.version === currentVersion && currentContent) {
      return currentContent;
    }
    if (revision.snapshot) {
      return revision.snapshot;
    }
    return "Content for this version will be available soon.";
  };

  const handleRevert = async () => {
    if (!selectedRevision || !onRevertToVersion) return;

    setIsReverting(true);
    const success = await onRevertToVersion(selectedRevision);
    setIsReverting(false);

    if (success) {
      onClose();
    }
  };

  return (
    <StyledModal open={isOpen} onClose={onClose} closeIcon>
      <Modal.Header>
        <Header
          as="h2"
          style={{
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <History size={20} />
          Summary Version History
        </Header>
      </Modal.Header>

      <ModalContent>
        <HistoryPanel>
          <HistoryHeader>
            <h3>
              <GitBranch size={18} />
              All Versions
            </h3>
            <div className="version-count">
              {sortedRevisions.length} version
              {sortedRevisions.length !== 1 ? "s" : ""} total
            </div>
          </HistoryHeader>

          <HistoryList>
            {sortedRevisions.map((revision) => {
              const isCurrent = revision.version === currentVersion;
              const isActive = selectedRevision?.id === revision.id;

              return (
                <VersionItem
                  key={revision.id}
                  $isActive={isActive}
                  $isCurrent={isCurrent}
                  onClick={() => setSelectedRevision(revision)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="version-header">
                    <div className="version-number">
                      Version {revision.version}
                    </div>
                    {isCurrent && (
                      <span className="version-badge">Current</span>
                    )}
                  </div>
                  <div className="version-meta">
                    <div className="meta-row">
                      <User size={12} />
                      {revision.author.email}
                    </div>
                    <div className="meta-row">
                      <Clock size={12} />
                      {format(
                        new Date(revision.created),
                        "MMM d, yyyy 'at' h:mm a"
                      )}
                    </div>
                  </div>
                </VersionItem>
              );
            })}
          </HistoryList>
        </HistoryPanel>

        <ContentPanel>
          {selectedRevision ? (
            <>
              <ContentHeader>
                <h4>
                  <Eye size={18} />
                  Version {selectedRevision.version} Preview
                </h4>
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "#64748b",
                    marginBottom: "0.5rem",
                  }}
                >
                  Created by {selectedRevision.author.email} on{" "}
                  {format(
                    new Date(selectedRevision.created),
                    "MMMM d, yyyy 'at' h:mm a"
                  )}
                </div>
                {onRevertToVersion &&
                  selectedRevision.version !== currentVersion && (
                    <div className="version-actions">
                      <StyledButton
                        $variant="primary"
                        onClick={handleRevert}
                        disabled={isLoading || isReverting}
                        loading={isReverting}
                      >
                        <Copy size={14} />
                        Reapply as New Version
                      </StyledButton>
                    </div>
                  )}
              </ContentHeader>
              <ContentBody>
                {isLoading ? (
                  <Loader active inline="centered" />
                ) : (
                  <SafeMarkdown>
                    {getRevisionContent(selectedRevision)}
                  </SafeMarkdown>
                )}
              </ContentBody>
            </>
          ) : (
            <EmptyState>
              <Eye size={48} strokeWidth={1.5} />
              <h3>Select a version to preview</h3>
              <p>Choose a version from the list to view its content</p>
            </EmptyState>
          )}
        </ContentPanel>
      </ModalContent>
    </StyledModal>
  );
};
