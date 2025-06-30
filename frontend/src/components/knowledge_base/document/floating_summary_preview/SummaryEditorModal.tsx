import React, { useState, useEffect } from "react";
import { Modal, Button, Header } from "semantic-ui-react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { Save, X, Eye, Edit, FileText } from "lucide-react";
import { SafeMarkdown } from "../../markdown/SafeMarkdown";

interface SummaryEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialContent: string;
  documentTitle: string;
  currentVersion: number;
  onSave: (newContent: string) => Promise<boolean>;
  isLoading?: boolean;
}

const StyledModal = styled(Modal)`
  &&& {
    width: 90vw;
    max-width: 1200px;
    height: 85vh !important;
    max-height: 85vh !important;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
    margin: 7.5vh auto;

    & > .content {
      flex: 1;
      overflow: hidden;
      padding: 0;
      max-height: none;
    }
  }
`;

const ModalHeader = styled(Modal.Header)`
  &&& {
    padding: 1.5rem 2rem !important;
    background: white;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
`;

const ModalContent = styled(Modal.Content)`
  &&& {
    display: flex !important;
    padding: 0 !important;
    flex: 1 !important;
    overflow: hidden !important;
    background: #f8fafc;
    min-height: 0 !important;
  }
`;

const EditorContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 8px;
  margin: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

const EditorHeader = styled.div`
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  background: linear-gradient(to right, #f8fafc, #f1f5f9);
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const ViewToggle = styled.div`
  display: flex;
  gap: 0.5rem;
`;

const ToggleButton = styled(Button)<{ $isActive: boolean }>`
  &&& {
    padding: 0.5rem 1rem;
    background: ${(props) => (props.$isActive ? "#4a90e2" : "white")};
    color: ${(props) => (props.$isActive ? "white" : "#64748b")};
    border: 1px solid ${(props) => (props.$isActive ? "#4a90e2" : "#e2e8f0")};
    border-radius: 8px;
    font-size: 0.875rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.2s;

    &:hover {
      background: ${(props) => (props.$isActive ? "#357abd" : "#f8fafc")};
      border-color: #4a90e2;
    }
  }
`;

const EditorWrapper = styled.div`
  flex: 1;
  display: flex;
  padding: 1.5rem;
  gap: 1.5rem;
  overflow: hidden;
`;

const Editor = styled.textarea`
  flex: 1;
  padding: 1.5rem;
  font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
  font-size: 0.875rem;
  line-height: 1.6;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  resize: none;
  background: #fafbfc;
  color: #1e293b;
  transition: all 0.2s;
  overflow-y: auto;

  &:focus {
    outline: none;
    border-color: #4a90e2;
    background: white;
    box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.1);
  }

  &::placeholder {
    color: #94a3b8;
  }
`;

const Preview = styled.div`
  flex: 1;
  padding: 1.5rem;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  background: white;
  overflow-y: auto;
`;

const ActionBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  flex-shrink: 0;
`;

const VersionInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #64748b;
  font-size: 0.875rem;
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 0.75rem;
`;

const StyledButton = styled(Button)<{ $variant?: "primary" | "secondary" }>`
  &&& {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1.25rem;
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
        transform: translateY(-1px);
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

const ChangedIndicator = styled(motion.div)`
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.75rem;
  background: #fef3c7;
  color: #92400e;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
`;

export const SummaryEditorModal: React.FC<SummaryEditorModalProps> = ({
  isOpen,
  onClose,
  initialContent,
  documentTitle,
  currentVersion,
  onSave,
  isLoading = false,
}) => {
  const [content, setContent] = useState(initialContent);
  const [showPreview, setShowPreview] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setContent(initialContent);
    setHasChanges(false);
  }, [initialContent]);

  useEffect(() => {
    setHasChanges(content !== initialContent);
  }, [content, initialContent]);

  const handleSave = async () => {
    if (!hasChanges) return;

    setIsSaving(true);
    const success = await onSave(content);
    setIsSaving(false);

    if (success) {
      onClose();
    }
  };

  const handleClose = () => {
    if (hasChanges) {
      if (
        window.confirm(
          "You have unsaved changes. Are you sure you want to close?"
        )
      ) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <StyledModal open={isOpen} onClose={handleClose} closeIcon>
      <ModalHeader>
        <Header
          as="h2"
          style={{
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <FileText size={20} />
          Edit Document Summary
          {hasChanges && (
            <ChangedIndicator
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", damping: 15 }}
            >
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#d97706",
                }}
              />
              Unsaved changes
            </ChangedIndicator>
          )}
        </Header>
      </ModalHeader>

      <ModalContent>
        <EditorContainer>
          <EditorHeader>
            <h3 style={{ margin: 0, fontSize: "1.125rem", color: "#1e293b" }}>
              {documentTitle}
            </h3>
            <ViewToggle>
              <ToggleButton
                $isActive={!showPreview}
                onClick={() => setShowPreview(false)}
              >
                <Edit size={16} />
                Edit
              </ToggleButton>
              <ToggleButton
                $isActive={showPreview}
                onClick={() => setShowPreview(true)}
              >
                <Eye size={16} />
                Preview
              </ToggleButton>
            </ViewToggle>
          </EditorHeader>

          <EditorWrapper>
            {!showPreview ? (
              <Editor
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your document summary in Markdown..."
                disabled={isLoading || isSaving}
              />
            ) : (
              <Preview>
                <SafeMarkdown>{content || "*No content*"}</SafeMarkdown>
              </Preview>
            )}
          </EditorWrapper>
        </EditorContainer>
      </ModalContent>

      <ActionBar>
        <VersionInfo>Currently editing version {currentVersion}</VersionInfo>
        <ButtonGroup>
          <StyledButton $variant="secondary" onClick={handleClose}>
            <X size={16} />
            Cancel
          </StyledButton>
          <StyledButton
            $variant="primary"
            onClick={handleSave}
            disabled={!hasChanges || isLoading || isSaving}
            loading={isSaving}
          >
            <Save size={16} />
            Save as Version {currentVersion + 1}
          </StyledButton>
        </ButtonGroup>
      </ActionBar>
    </StyledModal>
  );
};
