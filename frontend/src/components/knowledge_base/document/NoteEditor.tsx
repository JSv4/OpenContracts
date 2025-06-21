import React, { useState, useEffect, useCallback } from "react";
import {
  Modal,
  Header,
  Button,
  Icon,
  Message,
  Loader,
} from "semantic-ui-react";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery } from "@apollo/client";
import { toast } from "react-toastify";
import {
  Clock,
  Save,
  X,
  History,
  Edit3,
  ChevronLeft,
  User,
  FileText,
  GitBranch,
  Check,
  AlertCircle,
  RotateCcw,
  Eye,
  Edit,
  Copy,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  UPDATE_NOTE,
  GET_NOTE_WITH_HISTORY,
} from "../../../graphql/mutations/noteMutations";
import {
  UpdateNoteMutation,
  UpdateNoteMutationVariables,
  GetNoteWithHistoryQuery,
  GetNoteWithHistoryQueryVariables,
  NoteRevision,
} from "../../../graphql/types/NoteTypes";
import { SafeMarkdown } from "../markdown/SafeMarkdown";

// Styled Components
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

    /* Override Semantic UI defaults */
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
    min-height: 60px;
    max-height: 60px;
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
    max-height: calc(
      85vh - 60px - 70px
    ) !important; /* Header (60px) + ActionBar (70px) */
    position: relative;
    height: 100%;
  }
`;

const ContentWrapper = styled.div`
  display: flex;
  width: 100%;
  height: calc(85vh - 60px - 70px); /* Match parent height */
  max-height: calc(85vh - 60px - 70px);
  overflow: hidden;
  position: relative;
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
  min-width: 0;
  min-height: 0;
  max-height: 100%;
  flex-shrink: 1;
`;

const EditorHeader = styled.div`
  padding: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  background: linear-gradient(to right, #f8fafc, #f1f5f9);
  flex-shrink: 0;

  h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    color: #1e293b;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    color: #64748b;
    font-size: 0.875rem;
    flex-wrap: wrap;

    .meta-item {
      display: flex;
      align-items: center;
      gap: 0.375rem;
    }
  }
`;

const TitleInput = styled.input`
  width: 100%;
  padding: 0.75rem 1rem;
  font-size: 1.125rem;
  font-weight: 600;
  border: 2px solid transparent;
  border-radius: 8px;
  background: #f1f5f9;
  color: #1e293b;
  transition: all 0.2s;

  &:focus {
    outline: none;
    background: white;
    border-color: #4a90e2;
    box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.1);
  }
`;

const EditorWrapper = styled.div`
  flex: 1;
  display: flex;
  padding: 1.5rem;
  gap: 1.5rem;
  overflow: hidden;
  min-height: 0;
  max-height: 100%;
  min-width: 0;
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
  min-height: 0;
  min-width: 0;
  flex-shrink: 1;

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
  min-height: 0;
  min-width: 0;
  flex-shrink: 1;

  word-wrap: break-word;
  overflow-wrap: break-word;
`;

const HistoryPanel = styled(motion.div)`
  width: min(400px, 40vw); /* Responsive width: 400px or 40% of viewport */
  background: white;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  /* Ensure it doesn't shrink */
  flex-shrink: 0;
`;

const HistoryHeader = styled.div`
  padding: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  background: linear-gradient(to right, #f8fafc, #f1f5f9);
  flex-shrink: 0;

  h4 {
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
  overflow-x: hidden;
  padding: 0.5rem;
  min-height: 0;

  /* Custom scrollbar for better appearance */
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
`;

const VersionDetails = styled(motion.div)`
  padding: 1rem;
  margin: 0.5rem;
  background: #f0f9ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  overflow: hidden;

  .version-content {
    margin-top: 0.75rem;
    padding: 0.75rem;
    background: white;
    border: 1px solid #e0e7ff;
    border-radius: 6px;
    font-size: 0.875rem;
    max-height: 200px;
    overflow-y: auto;
    overflow-x: hidden;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .version-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
    flex-wrap: wrap;
  }
`;

interface VersionItemProps {
  $isActive?: boolean;
  $isViewing?: boolean;
}

const VersionItem = styled(motion.button)<VersionItemProps>`
  width: 100%;
  padding: 1rem;
  border: 1px solid
    ${(props) =>
      props.$isActive ? "#4a90e2" : props.$isViewing ? "#a78bfa" : "#e2e8f0"};
  border-radius: 8px;
  background: ${(props) =>
    props.$isActive ? "#eff6ff" : props.$isViewing ? "#f3f4f6" : "white"};
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
        props.$isActive ? "#4a90e2" : props.$isViewing ? "#7c3aed" : "#1e293b"};
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
        props.$isActive ? "#4a90e2" : props.$isViewing ? "#a78bfa" : "#e2e8f0"};
      color: ${(props) =>
        props.$isActive || props.$isViewing ? "white" : "#64748b"};
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

const ActionBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  flex-shrink: 0;
  min-width: 0;
  gap: 1rem;
`;

const ActionGroup = styled.div`
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  min-width: 0;
  flex-shrink: 1;
`;

interface StyledButtonProps {
  $variant?: "primary" | "secondary" | "danger" | "success";
  $size?: "small" | "medium";
}

const StyledButton = styled(Button)<StyledButtonProps>`
  &&& {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: ${(props) =>
      props.$size === "small" ? "0.5rem 1rem" : "0.625rem 1.25rem"};
    border-radius: 8px;
    font-weight: 500;
    font-size: ${(props) =>
      props.$size === "small" ? "0.8125rem" : "0.875rem"};
    transition: all 0.2s;
    white-space: nowrap;
    flex-shrink: 0;

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

    ${(props) =>
      props.$variant === "success" &&
      `
      background: #10b981;
      color: white;
      &:hover {
        background: #059669;
        transform: translateY(-1px);
      }
    `}

    ${(props) =>
      props.$variant === "danger" &&
      `
      background: white;
      color: #ef4444;
      border: 1px solid #fecaca;
      &:hover {
        background: #fef2f2;
        border-color: #f87171;
      }
    `}
  }
`;

const EditingIndicator = styled(motion.div)`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.75rem;
  background: #fef3c7;
  color: #92400e;
  border-radius: 9999px;
  font-size: 0.8125rem;
  font-weight: 500;
  margin-left: 0.5rem;
  flex-shrink: 1;
  min-width: 0;

  /* Prevent text overflow */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
`;

interface NoteEditorProps {
  noteId: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  noteId,
  isOpen,
  onClose,
  onUpdate,
}) => {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [viewingVersion, setViewingVersion] = useState<NoteRevision | null>(
    null
  );
  const [editingFromVersion, setEditingFromVersion] = useState<number | null>(
    null
  );
  const [hasChanges, setHasChanges] = useState(false);

  // GraphQL hooks
  const { data, loading, refetch } = useQuery<
    GetNoteWithHistoryQuery,
    GetNoteWithHistoryQueryVariables
  >(GET_NOTE_WITH_HISTORY, {
    variables: { id: noteId },
    skip: !isOpen,
  });

  const [updateNote, { loading: updating }] = useMutation<
    UpdateNoteMutation,
    UpdateNoteMutationVariables
  >(UPDATE_NOTE);

  // Initialize form when data loads
  useEffect(() => {
    if (data?.note) {
      setTitle(data.note.title);
      setContent(data.note.content);
      setHasChanges(false);
      setEditingFromVersion(null);
    }
  }, [data]);

  // Track changes
  useEffect(() => {
    if (data?.note) {
      const hasContentChanged = content !== data.note.content;
      const hasTitleChanged = title !== data.note.title;
      setHasChanges(hasContentChanged || hasTitleChanged);
    }
  }, [content, title, data]);

  const handleSave = useCallback(async () => {
    if (!hasChanges) return;

    try {
      const result = await updateNote({
        variables: {
          noteId,
          newContent: content,
          title: title !== data?.note.title ? title : undefined,
        },
      });

      if (result.data?.updateNote.ok) {
        const message = editingFromVersion
          ? `Created version ${result.data.updateNote.version} from edits to version ${editingFromVersion}!`
          : `Note updated! Now at version ${result.data.updateNote.version}`;

        toast.success(message, {
          icon: <Check size={20} />,
        });

        await refetch();
        setHasChanges(false);
        setEditingFromVersion(null);
        onUpdate?.();
      } else {
        toast.error(result.data?.updateNote.message || "Failed to update note");
      }
    } catch (error) {
      console.error("Error updating note:", error);
      toast.error("Failed to update note");
    }
  }, [
    noteId,
    content,
    title,
    hasChanges,
    updateNote,
    refetch,
    onUpdate,
    data,
    editingFromVersion,
  ]);

  const handleReapplyVersion = useCallback(
    async (version: NoteRevision) => {
      if (!version.snapshot) return;

      try {
        const result = await updateNote({
          variables: {
            noteId,
            newContent: version.snapshot,
            title: data?.note.title,
          },
        });

        if (result.data?.updateNote.ok) {
          toast.success(
            `Version ${version.version} reapplied as new version ${result.data.updateNote.version}!`,
            { icon: <Check size={20} /> }
          );

          await refetch();
          setViewingVersion(null);
          setSelectedVersion(null);
          onUpdate?.();
        } else {
          toast.error(
            result.data?.updateNote.message || "Failed to reapply version"
          );
        }
      } catch (error) {
        console.error("Error reapplying version:", error);
        toast.error("Failed to reapply version");
      }
    },
    [noteId, updateNote, refetch, onUpdate, data]
  );

  const handleEditFromVersion = (version: NoteRevision) => {
    if (version.snapshot) {
      setContent(version.snapshot);
      setEditingFromVersion(version.version);
      setViewingVersion(null);
      setSelectedVersion(null);
      toast.info(
        `Editing from version ${version.version}. Make your changes and save.`
      );
    }
  };

  const handleVersionClick = (version: NoteRevision) => {
    if (selectedVersion === version.version) {
      // Toggle off if clicking the same version
      setSelectedVersion(null);
      setViewingVersion(null);
    } else {
      setSelectedVersion(version.version);
      setViewingVersion(version);
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

  const revisions = data?.note.revisions || [];

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
            minWidth: 0,
          }}
        >
          <Edit size={20} />
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            Edit Note
          </span>
          {hasChanges && (
            <EditingIndicator
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", damping: 15 }}
            >
              <Clock size={14} />
              Unsaved changes
            </EditingIndicator>
          )}
          {editingFromVersion && (
            <EditingIndicator
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", damping: 15 }}
              style={{ background: "#ddd6fe", color: "#6b21a8" }}
            >
              <GitBranch size={14} />
              Editing from v{editingFromVersion}
            </EditingIndicator>
          )}
        </Header>
      </ModalHeader>

      <ModalContent>
        <ContentWrapper>
          <EditorContainer>
            <EditorHeader>
              <TitleInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note title..."
              />
              <div className="meta">
                <div className="meta-item">
                  <FileText size={14} />
                  {data?.note.document?.title || "Document"}
                </div>
                <div className="meta-item">
                  <GitBranch size={14} />
                  Version {data?.note.currentVersion || 1}
                </div>
                <div className="meta-item">
                  <Clock size={14} />
                  Modified{" "}
                  {data?.note.modified
                    ? formatDistanceToNow(new Date(data.note.modified), {
                        addSuffix: true,
                      })
                    : "recently"}
                </div>
              </div>
            </EditorHeader>

            <EditorWrapper>
              <Editor
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your note in Markdown..."
              />
              <Preview>
                <SafeMarkdown>{content}</SafeMarkdown>
              </Preview>
            </EditorWrapper>
          </EditorContainer>

          <AnimatePresence>
            {showHistory && (
              <HistoryPanel
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: "min(400px, 40vw)", opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
              >
                <HistoryHeader>
                  <h4>
                    <History size={18} />
                    Version History
                  </h4>
                  <div className="version-count">
                    {revisions.length} version
                    {revisions.length !== 1 ? "s" : ""}
                  </div>
                </HistoryHeader>

                <HistoryList>
                  {revisions.map((revision: NoteRevision, index: number) => (
                    <div key={revision.id}>
                      <VersionItem
                        $isActive={
                          revision.version === data?.note.currentVersion
                        }
                        $isViewing={
                          revision.version === viewingVersion?.version
                        }
                        onClick={() => handleVersionClick(revision)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="version-header">
                          <div className="version-number">
                            Version {revision.version}
                            {revision.version === data?.note.currentVersion && (
                              <span className="version-badge">Current</span>
                            )}
                            {index === 0 &&
                              revision.version !==
                                data?.note.currentVersion && (
                                <span className="version-badge">Latest</span>
                              )}
                          </div>
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

                      <AnimatePresence>
                        {viewingVersion?.version === revision.version &&
                          revision.snapshot && (
                            <VersionDetails
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <div
                                style={{
                                  fontSize: "0.875rem",
                                  color: "#64748b",
                                  marginBottom: "0.5rem",
                                }}
                              >
                                <Eye
                                  size={14}
                                  style={{
                                    display: "inline",
                                    marginRight: "0.25rem",
                                  }}
                                />
                                Version {revision.version} snapshot
                              </div>
                              <div className="version-content">
                                <SafeMarkdown>{revision.snapshot}</SafeMarkdown>
                              </div>
                              <div className="version-actions">
                                <StyledButton
                                  $variant="success"
                                  $size="small"
                                  onClick={() => handleReapplyVersion(revision)}
                                  disabled={updating}
                                >
                                  <Copy size={14} />
                                  Reapply as New Version
                                </StyledButton>
                                <StyledButton
                                  $variant="primary"
                                  $size="small"
                                  onClick={() =>
                                    handleEditFromVersion(revision)
                                  }
                                  disabled={updating || hasChanges}
                                >
                                  <Edit size={14} />
                                  Edit from This Version
                                </StyledButton>
                                {hasChanges && (
                                  <div
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "#ef4444",
                                      width: "100%",
                                      marginTop: "0.5rem",
                                    }}
                                  >
                                    Save current changes first
                                  </div>
                                )}
                              </div>
                            </VersionDetails>
                          )}
                      </AnimatePresence>
                    </div>
                  ))}
                </HistoryList>
              </HistoryPanel>
            )}
          </AnimatePresence>
        </ContentWrapper>
      </ModalContent>

      <ActionBar>
        <ActionGroup>
          <StyledButton
            $variant="secondary"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History size={16} />
            {showHistory ? "Hide" : "Show"} History
          </StyledButton>
        </ActionGroup>

        <ActionGroup>
          {editingFromVersion && (
            <StyledButton
              $variant="secondary"
              onClick={() => {
                if (data?.note) {
                  setContent(data.note.content);
                  setTitle(data.note.title);
                  setEditingFromVersion(null);
                }
              }}
            >
              <X size={16} />
              Cancel Version Edit
            </StyledButton>
          )}
          <StyledButton $variant="secondary" onClick={handleClose}>
            <X size={16} />
            Close
          </StyledButton>
          <StyledButton
            $variant="primary"
            onClick={handleSave}
            disabled={!hasChanges || updating}
            loading={updating}
          >
            <Save size={16} />
            Save Changes
            {hasChanges && !updating && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#10b981",
                  marginLeft: 8,
                }}
              />
            )}
          </StyledButton>
        </ActionGroup>
      </ActionBar>
    </StyledModal>
  );
};
