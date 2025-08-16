import React, { useEffect, useState } from "react";
import {
  Container,
  Button,
  Divider,
  Header,
  Icon,
  Table,
  Confirm,
} from "semantic-ui-react";
import { useQuery, useReactiveVar, useMutation } from "@apollo/client";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { editingCorpus } from "../../graphql/cache";
import {
  GET_CORPUS_ACTIONS,
  GetCorpusActionsInput,
  GetCorpusActionsOutput,
} from "../../graphql/queries";
import {
  DELETE_CORPUS_ACTION,
  DeleteCorpusActionInput,
  DeleteCorpusActionOutput,
} from "../../graphql/mutations";
import { CreateCorpusActionModal } from "./CreateCorpusActionModal";
import { CorpusMetadataSettings } from "./CorpusMetadataSettings";
import {
  UPDATE_CORPUS,
  UpdateCorpusInputs,
  UpdateCorpusOutputs,
} from "../../graphql/mutations";
import { CorpusType } from "../../types/graphql-api";
import { PermissionTypes } from "../types";
import { getPermissions } from "../../utils/transform";

interface CorpusSettingsProps {
  corpus: {
    id: string;
    title: string;
    description: string;
    allowComments: boolean;
    preferredEmbedder?: string | null;
    slug?: string | null;
    creator?: {
      email: string;
      username?: string;
      slug?: string;
    };
    created?: string;
    modified?: string;
    isPublic?: boolean;
    myPermissions?: PermissionTypes[] | string[] | undefined;
    documents?: {
      totalCount: number;
    };
    annotations?: {
      totalCount: number;
    };
  };
}

const ActionCard = styled.div`
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  margin: 1rem 0;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.12);
  transition: all 0.2s ease;
  position: relative;
  border: 1px solid #eaeaea;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.16);
  }

  &::before {
    content: "";
    position: absolute;
    left: -2rem;
    top: 50%;
    width: 1.5rem;
    height: 3px;
    background: #d1d1d1;
  }
`;

const TriggerBadge = styled.span<{ trigger: "add_document" | "edit_document" }>`
  background: ${(props) =>
    props.trigger === "add_document" ? "#15803d" : "#1d4ed8"};
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0.3px;
  box-shadow: 0 2px 4px
    ${(props) =>
      props.trigger === "add_document"
        ? "rgba(21, 128, 61, 0.2)"
        : "rgba(29, 78, 216, 0.2)"};
`;

const ActionFlow = styled.div`
  padding-left: 2rem;
  border-left: 2px dashed #c1c1c1;
  margin: 2rem 0;
`;

const PageContainer = styled(Container)`
  padding: 2rem;
  max-width: 1200px !important;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;

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
`;

const CorpusHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid #f1f5f9;
`;

const TitleArea = styled.div`
  flex: 1;
`;

const CorpusTitle = styled.h1`
  font-size: 2rem;
  font-weight: 600;
  color: #1a202c;
  margin: 0 0 0.5rem 0;
  letter-spacing: -0.02em;
`;

const CorpusDescription = styled.p`
  color: #4a5568;
  font-size: 1rem;
  margin: 0;
  max-width: 600px;
`;

const EditButton = styled(Button)`
  &&& {
    background: white;
    color: #3b82f6;
    border: 1px solid #e2e8f0;
    padding: 0.75rem 1rem;
    font-weight: 500;
    border-radius: 8px;
    transition: all 0.2s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    margin-left: 1rem;

    &:hover {
      border-color: #3b82f6;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      background: #f9fafb;
    }

    .icon {
      margin-right: 0.5rem !important;
      opacity: 0.8;
    }
  }
`;

const InfoSection = styled.div`
  margin-bottom: 3.5rem;
  background: white;
  border-radius: 12px;
  border: 1px solid #f1f5f9;
  overflow: hidden;
`;

const SectionHeader = styled.div`
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #f1f5f9;
  display: flex;
  align-items: center;
`;

const SectionTitle = styled.h2`
  font-size: 1rem;
  font-weight: 600;
  color: #1a202c;
  margin: 0;
  display: flex;
  align-items: center;

  &:before {
    content: "";
    width: 4px;
    height: 1rem;
    background: #3b82f6;
    margin-right: 0.75rem;
    border-radius: 2px;
  }
`;

const MetadataContent = styled.div`
  padding: 1.5rem;
`;

const MetadataGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;

  @media (max-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const MetadataItem = styled.div`
  .label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }

  .value {
    font-size: 1rem;
    color: #1e293b;
    font-weight: 500;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
    font-size: 0.875rem;

    &.private {
      background-color: #f1f5f9;
      color: #475569;
    }

    &.public {
      background-color: #ecfdf5;
      color: #10b981;
    }

    .icon {
      margin-right: 0.25rem;
      font-size: 0.75rem;
    }
  }
`;

const ActionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #f1f5f9;
`;

const ActionContent = styled.div`
  padding: 1.5rem;
`;

const AddActionButton = styled(Button)`
  &&& {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 0.6rem 1rem;
    font-weight: 500;
    border-radius: 6px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);

    &:hover {
      background: #2563eb;
    }

    .icon {
      margin-right: 0.5rem !important;
      opacity: 0.9;
    }
  }
`;

const ActionNote = styled.div`
  font-size: 0.95rem;
  color: #4a5568;
  margin-bottom: 2rem;
  line-height: 1.6;

  strong {
    color: #1e293b;
    font-weight: 600;
  }

  .highlight {
    color: #3b82f6;
  }
`;

/**
 * Component for managing corpus settings and actions
 * Only visible to users with update permissions
 */
const SettingsContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  position: relative;
`;

export const CorpusSettings: React.FC<CorpusSettingsProps> = ({ corpus }) => {
  const navigate = useNavigate();

  // Check if myPermissions is already processed (array of PermissionTypes) or raw
  const permissions =
    Array.isArray(corpus.myPermissions) &&
    corpus.myPermissions.length > 0 &&
    typeof corpus.myPermissions[0] === "string" &&
    corpus.myPermissions[0].includes("CAN_")
      ? (corpus.myPermissions as PermissionTypes[]) // Already processed
      : getPermissions(corpus.myPermissions || []); // Need to process

  const canUpdate = permissions.includes(PermissionTypes.CAN_UPDATE);
  const canPermission = permissions.includes(PermissionTypes.CAN_PERMISSION);
  const [slugDraft, setSlugDraft] = useState<string>("");
  const [publicDraft, setPublicDraft] = useState<boolean>(
    Boolean(corpus.isPublic)
  );
  const [originalSlug, setOriginalSlug] = useState<string>("");

  useEffect(() => {
    setSlugDraft(corpus.slug || "");
    setOriginalSlug(corpus.slug || "");
    setPublicDraft(Boolean(corpus.isPublic));
  }, [corpus]);

  const [updateCorpusMutation, { loading: updatingVisibility }] = useMutation<
    UpdateCorpusOutputs,
    UpdateCorpusInputs
  >(UPDATE_CORPUS, {
    onCompleted: (data) => {
      if (data.updateCorpus?.ok) {
        toast.success("Updated corpus settings");

        // If slug was updated, navigate to the new URL
        if (slugDraft && slugDraft !== originalSlug && corpus.creator?.slug) {
          const newUrl = `/c/${corpus.creator.slug}/${slugDraft}`;
          navigate(newUrl, { replace: true });
        }
      } else {
        toast.error(data.updateCorpus?.message || "Failed to update corpus");
      }
    },
    onError: (err) => toast.error(err.message),
  });
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [actionToDelete, setActionToDelete] = React.useState<string | null>(
    null
  );

  const { data: actionsData, refetch: refetchActions } = useQuery<
    GetCorpusActionsOutput,
    GetCorpusActionsInput
  >(GET_CORPUS_ACTIONS, {
    variables: { corpusId: corpus.id },
    fetchPolicy: "network-only",
  });

  // Refetch actions when component mounts
  useEffect(() => {
    refetchActions();
  }, []);

  const [deleteCorpusAction] = useMutation<
    DeleteCorpusActionOutput,
    DeleteCorpusActionInput
  >(DELETE_CORPUS_ACTION, {
    onCompleted: (data) => {
      if (data.deleteCorpusAction.ok) {
        toast.success("Action deleted successfully");
        refetchActions();
      } else {
        toast.error(
          `Failed to delete action: ${data.deleteCorpusAction.message}`
        );
      }
    },
    onError: (error) => {
      toast.error(`Error deleting action: ${error.message}`);
    },
  });

  const handleDelete = async (id: string) => {
    try {
      await deleteCorpusAction({
        variables: { id },
      });
    } catch (error) {
      // Error handled by onError callback
    } finally {
      setActionToDelete(null);
    }
  };

  return (
    <SettingsContainer>
      <PageContainer>
        <CorpusHeader>
          <TitleArea>
            <CorpusTitle>{corpus.title}</CorpusTitle>
            <CorpusDescription>
              {corpus.description || "No description provided."}
            </CorpusDescription>
          </TitleArea>
          <EditButton
            icon
            labelPosition="left"
            onClick={() => editingCorpus(corpus as unknown as CorpusType)}
          >
            <Icon name="edit outline" />
            Edit
          </EditButton>
        </CorpusHeader>

        <InfoSection>
          <SectionHeader>
            <SectionTitle>Corpus Information</SectionTitle>
          </SectionHeader>

          <MetadataContent>
            <MetadataGrid>
              <MetadataItem>
                <div className="label">Created by</div>
                <div className="value">
                  {corpus.creator?.email || "Unknown"}
                </div>
              </MetadataItem>

              <MetadataItem>
                <div className="label">Preferred Embedder</div>
                <div className="value">
                  {corpus.preferredEmbedder || "Default"}
                </div>
              </MetadataItem>

              <MetadataItem>
                <div className="label">Created</div>
                <div className="value">
                  {corpus.created
                    ? new Date(corpus.created).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "Unknown"}
                </div>
              </MetadataItem>

              <MetadataItem>
                <div className="label">Last Updated</div>
                <div className="value">
                  {corpus.modified
                    ? new Date(corpus.modified).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })
                    : "Unknown"}
                </div>
              </MetadataItem>

              <MetadataItem>
                <div className="label">Visibility</div>
                <div className="value">
                  <span
                    className={`badge ${
                      corpus.isPublic ? "public" : "private"
                    }`}
                  >
                    <Icon
                      name={corpus.isPublic ? "unlock" : "lock"}
                      size="small"
                    />
                    {corpus.isPublic ? "Public" : "Private"}
                  </span>
                </div>
              </MetadataItem>

              {corpus.allowComments && (
                <MetadataItem>
                  <div className="label">Comments</div>
                  <div className="value">
                    <span className="badge public">
                      <Icon name="comments" size="small" />
                      Enabled
                    </span>
                  </div>
                </MetadataItem>
              )}
            </MetadataGrid>
          </MetadataContent>
        </InfoSection>

        <InfoSection>
          <SectionHeader>
            <SectionTitle>Visibility & Slug</SectionTitle>
          </SectionHeader>
          <MetadataContent>
            {!canUpdate && !canPermission && (
              <div
                style={{
                  background: "#fef3c7",
                  border: "1px solid #fbbf24",
                  borderRadius: "6px",
                  padding: "0.75rem",
                  marginBottom: "1rem",
                  fontSize: "0.875rem",
                  color: "#92400e",
                }}
              >
                ⚠️ You don't have permission to update these settings. Contact
                the corpus owner for access.
              </div>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1.5rem",
                alignItems: "end",
              }}
            >
              <div>
                <div className="label">
                  Public visibility {!canPermission && "(No permission)"}
                </div>
                <div
                  className="value"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                  }}
                >
                  <input
                    id="corpus-is-public-checkbox"
                    type="checkbox"
                    checked={publicDraft}
                    disabled={!canPermission}
                    onChange={(e) => setPublicDraft(e.target.checked)}
                    style={{
                      cursor: !canPermission ? "not-allowed" : "pointer",
                      opacity: !canPermission ? 0.5 : 1,
                    }}
                  />
                  <label htmlFor="corpus-is-public-checkbox">
                    {publicDraft ? "Public" : "Private"}
                  </label>
                </div>
              </div>
              <div>
                <div className="label">
                  Slug {!canUpdate && "(No permission)"}
                </div>
                <input
                  id="corpus-slug-input"
                  type="text"
                  placeholder="Repo slug (case-sensitive)"
                  value={slugDraft}
                  disabled={!canUpdate}
                  onChange={(e) => setSlugDraft(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.6rem",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    background: !canUpdate ? "#f5f5f5" : "white",
                    cursor: !canUpdate ? "not-allowed" : "text",
                    opacity: !canUpdate ? 0.7 : 1,
                  }}
                />
              </div>
              <div style={{ gridColumn: "1 / span 2" }}>
                <Button
                  primary
                  loading={updatingVisibility}
                  disabled={!canUpdate && !canPermission}
                  onClick={() => {
                    const vars: UpdateCorpusInputs = { id: corpus.id } as any;
                    if (canPermission) vars.isPublic = publicDraft;
                    if (canUpdate) vars.slug = slugDraft || undefined;
                    updateCorpusMutation({ variables: vars });
                  }}
                >
                  <Icon name="save" /> Save
                </Button>
              </div>
            </div>
          </MetadataContent>
        </InfoSection>

        <InfoSection>
          <ActionHeader>
            <SectionTitle>Corpus Actions</SectionTitle>
            <AddActionButton onClick={() => setIsModalOpen(true)}>
              <Icon name="plus" />
              Add Action
            </AddActionButton>
          </ActionHeader>

          <ActionContent>
            <ActionNote>
              This system allows you to <strong>automate actions</strong> when
              documents are
              <span className="highlight"> added</span> or{" "}
              <span className="highlight"> edited</span> in a corpus, either
              running extractions via <strong>fieldsets</strong> or analyses via{" "}
              <strong>analyzers</strong>.
            </ActionNote>

            <ActionFlow>
              {actionsData?.corpusActions?.edges.map(({ node: action }) => (
                <ActionCard key={action.id}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "flex",
                          gap: "1rem",
                          alignItems: "center",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <h3
                          style={{
                            margin: 0,
                            color: "#111827",
                            fontSize: "1.25rem",
                            fontWeight: 600,
                          }}
                        >
                          {action.name}
                        </h3>
                        <TriggerBadge
                          trigger={
                            action.trigger as "add_document" | "edit_document"
                          }
                        >
                          {action.trigger === "add_document"
                            ? "📥 On Add"
                            : "✏️ On Edit"}
                        </TriggerBadge>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "2rem",
                          color: "rgba(0,0,0,0.75)",
                          marginTop: "1rem",
                          fontSize: "0.95rem",
                        }}
                      >
                        <div>
                          <Icon name="code" />
                          {action.fieldset
                            ? `Fieldset: ${action.fieldset.name}`
                            : `Analyzer: ${action.analyzer?.name}`}
                        </div>
                        <div>
                          <Icon name="user" />
                          {action.creator.username}
                        </div>
                        <div>
                          <Icon name="calendar" />
                          {new Date(action.created).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          padding: "0.5rem 1rem",
                          borderRadius: "6px",
                          background: action.disabled ? "#fef2f2" : "#f0fdf4",
                          color: action.disabled ? "#dc2626" : "#16a34a",
                          fontWeight: 600,
                          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                        }}
                      >
                        <Icon
                          name={
                            action.disabled ? "pause circle" : "play circle"
                          }
                        />
                        {action.disabled ? "Disabled" : "Active"}
                      </div>

                      <Button
                        icon
                        negative
                        size="tiny"
                        onClick={() => setActionToDelete(action.id)}
                      >
                        <Icon name="trash" />
                      </Button>
                    </div>
                  </div>
                </ActionCard>
              ))}
            </ActionFlow>
          </ActionContent>
        </InfoSection>

        <InfoSection>
          <SectionHeader>
            <SectionTitle>Metadata Fields</SectionTitle>
          </SectionHeader>
          <MetadataContent>
            <CorpusMetadataSettings corpusId={corpus.id} />
          </MetadataContent>
        </InfoSection>

        <CreateCorpusActionModal
          corpusId={corpus.id}
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            setIsModalOpen(false);
            refetchActions();
          }}
        />

        <Confirm
          open={!!actionToDelete}
          onCancel={() => setActionToDelete(null)}
          onConfirm={() => actionToDelete && handleDelete(actionToDelete)}
          content="Are you sure you want to delete this action? This cannot be undone."
          confirmButton="Delete"
          cancelButton="Cancel"
        />
      </PageContainer>
    </SettingsContainer>
  );
};
