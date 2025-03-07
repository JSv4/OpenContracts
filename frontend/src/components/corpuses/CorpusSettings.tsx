import React, { useEffect } from "react";
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
import { CorpusType } from "../../types/graphql-api";

interface CorpusSettingsProps {
  corpus: {
    id: string;
    title: string;
    description: string;
    allowComments: boolean;
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
  background: linear-gradient(
    180deg,
    rgba(248, 250, 252, 0.8) 0%,
    rgba(255, 255, 255, 1) 100%
  );
  border-radius: 16px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.02);
`;

const HeaderContainer = styled.div`
  background: linear-gradient(to right, #ffffff, #f8fafc);
  padding: 3rem 2rem 2rem 2rem;
  margin: 1rem -1rem 2rem -1rem;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
`;

const TopMetadataBar = styled.div`
  display: flex;
  gap: 1.5rem;
  padding: 0.75rem 1.5rem;
  margin: 0.5rem 0 1.5rem 0;
  background: white;
  border-radius: 10px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  border: 1px solid #f1f5f9;

  .icon {
    color: #3b82f6;
    margin-right: 0.5rem;
  }
`;

const TopMetadataItem = styled.div`
  display: flex;
  align-items: center;
  color: #475569;
  font-size: 0.95rem;
  font-weight: 500;

  &:not(:last-child) {
    padding-right: 1.5rem;
    border-right: 1px solid #e2e8f0;
  }
`;

const MetadataBar = styled.div`
  display: flex;
  gap: 2rem;
  padding: 1.25rem 1.5rem;
  margin: -1rem 0 2rem 0;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.03);
  border: 1px solid #f1f5f9;
`;

const MetadataItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #475569;
  font-weight: 500;

  .icon {
    background: #f8fafc;
    padding: 0.5rem;
    border-radius: 8px;
    color: #3b82f6;
  }
`;

const ActionSectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 2rem 0;
  padding-bottom: 1rem;
  border-bottom: 2px solid #f1f5f9;

  h2 {
    font-size: 1.5rem;
    font-weight: 700;
    color: #1e293b;
    margin: 0;
  }
`;

const AddActionButton = styled(Button)`
  &&& {
    background: #3b82f6;
    color: white;
    padding: 0.75rem 1.25rem;
    border-radius: 10px;
    font-weight: 600;
    box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
    transition: all 0.2s ease;

    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
      background: #2563eb;
    }

    .icon {
      margin-right: 0.5rem !important;
    }
  }
`;

const HeaderContent = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 2rem;
`;

const TitleSection = styled.div`
  flex: 1;
`;

const CorpusTitle = styled.h1`
  font-size: 2.5rem;
  font-weight: 800;
  background: linear-gradient(120deg, #0f2b77, #2563eb);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin: 0;
  letter-spacing: -0.02em;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
`;

const CorpusDescription = styled.p`
  color: #334155;
  font-size: 1.1rem;
  margin: 0.75rem 0 0 0;
  max-width: 600px;
  line-height: 1.6;
  font-weight: 450;
`;

const EditButton = styled(Button)`
  &&& {
    background: linear-gradient(135deg, #1e40af, #3b82f6);
    color: white;
    padding: 1rem 1.5rem;
    font-weight: 600;
    border-radius: 12px;
    transition: all 0.2s ease;
    border: none;
    box-shadow: 0 4px 6px rgba(59, 130, 246, 0.2);

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 12px rgba(59, 130, 246, 0.3);
      background: linear-gradient(135deg, #1e40af, #60a5fa);
    }

    .icon {
      background: rgba(255, 255, 255, 0.2);
      padding: 0.5rem;
      border-radius: 8px;
      margin-right: 0.5rem !important;
    }
  }
`;

const ActionDescription = styled.div`
  background: linear-gradient(to right, #f8fafc, #ffffff);
  border-left: 4px solid #3b82f6;
  padding: 1.25rem 1.5rem;
  margin: 1rem 0 2rem 0;
  border-radius: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);

  p {
    color: #475569;
    font-size: 1.05rem;
    line-height: 1.6;
    margin: 0;

    strong {
      color: #1e293b;
      font-weight: 600;
    }
  }

  .highlight {
    color: #3b82f6;
    font-weight: 500;
  }
`;

/**
 * Component for managing corpus settings and actions
 * Only visible to users with update permissions
 */
export const CorpusSettings: React.FC<CorpusSettingsProps> = ({ corpus }) => {
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
    <PageContainer>
      <HeaderContainer>
        <HeaderContent>
          <TitleSection>
            <CorpusTitle>{corpus.title}</CorpusTitle>
            <CorpusDescription>
              {corpus.description ||
                "No description provided yet. Add one to help your team understand this corpus better."}
            </CorpusDescription>
          </TitleSection>

          <EditButton
            icon
            labelPosition="left"
            onClick={() => editingCorpus(corpus as unknown as CorpusType)}
          >
            <Icon name="edit outline" />
            Edit Corpus Details
          </EditButton>
        </HeaderContent>
      </HeaderContainer>

      <TopMetadataBar>
        <TopMetadataItem>
          <Icon name="file text" />2 Actions
        </TopMetadataItem>
        <TopMetadataItem>
          <Icon name="clock" />
          Last updated 2 days ago
        </TopMetadataItem>
        {corpus.allowComments && (
          <TopMetadataItem>
            <Icon name="comments" />
            Comments enabled
          </TopMetadataItem>
        )}
      </TopMetadataBar>

      <MetadataBar></MetadataBar>

      <ActionSectionHeader>
        <h2>Corpus Actions</h2>
        <AddActionButton onClick={() => setIsModalOpen(true)}>
          <Icon name="plus" />
          Add Action
        </AddActionButton>
      </ActionSectionHeader>

      <ActionDescription>
        <p>
          This system allows you to <strong>automate actions</strong> when
          documents are
          <span className="highlight"> added</span> or{" "}
          <span className="highlight">edited</span> in a corpus, either running
          extractions via <strong>fieldsets</strong> or analyses via{" "}
          <strong>analyzers</strong>.
        </p>
      </ActionDescription>

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
                    trigger={action.trigger as "add_document" | "edit_document"}
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
                style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
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
                    name={action.disabled ? "pause circle" : "play circle"}
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
  );
};
