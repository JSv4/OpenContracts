import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Icon,
  Popup,
  Confirm,
  Loader,
  Message,
  Dropdown,
} from "semantic-ui-react";
import { useQuery, useMutation } from "@apollo/client";
import { toast } from "react-toastify";
import styled from "styled-components";
// import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";

import {
  GET_CORPUS_METADATA_COLUMNS,
  CREATE_METADATA_COLUMN,
  UPDATE_METADATA_COLUMN,
  DELETE_METADATA_COLUMN,
  GetCorpusMetadataColumnsInput,
  GetCorpusMetadataColumnsOutput,
  CreateMetadataColumnInput,
  CreateMetadataColumnOutput,
  UpdateMetadataColumnInput,
  UpdateMetadataColumnOutput,
  DeleteMetadataColumnInput,
  DeleteMetadataColumnOutput,
} from "../../graphql/metadataOperations";
import { MetadataColumn } from "../../types/metadata";
import { MetadataColumnModal } from "../widgets/modals/MetadataColumnModal";

interface CorpusMetadataSettingsProps {
  corpusId: string;
}

const Container = styled.div`
  padding: 1.5rem;
`;

const HeaderSection = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
`;

const Title = styled.h3`
  margin: 0;
  color: #1e293b;
  font-size: 1.125rem;
  font-weight: 600;
`;

const HelperText = styled.p`
  color: #64748b;
  font-size: 0.875rem;
  margin: 0 0 1.5rem 0;
  line-height: 1.5;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem;
  color: #64748b;

  .icon {
    font-size: 3rem;
    margin-bottom: 1rem;
    opacity: 0.3;
  }

  h4 {
    color: #475569;
    margin-bottom: 0.5rem;
  }

  p {
    margin-bottom: 1.5rem;
  }
`;

const StyledTable = styled(Table)`
  &.ui.table {
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

    thead th {
      background-color: #f8fafc;
      font-weight: 600;
      color: #475569;
      text-transform: uppercase;
      font-size: 0.75rem;
      letter-spacing: 0.05em;
    }

    tbody tr {
      transition: all 0.2s ease;

      &:hover {
        background-color: #f8fafc;
      }
    }
  }
`;

const OrderButtons = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const DataTypeBadge = styled.span<{ dataType: string }>`
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  background-color: ${(props) => {
    switch (props.dataType) {
      case "STRING":
      case "TEXT":
        return "#dbeafe";
      case "INTEGER":
      case "FLOAT":
        return "#fef3c7";
      case "BOOLEAN":
        return "#d1fae5";
      case "DATE":
      case "DATETIME":
        return "#e0e7ff";
      case "CHOICE":
      case "MULTI_CHOICE":
        return "#fce7f3";
      case "JSON":
        return "#f3e8ff";
      default:
        return "#f3f4f6";
    }
  }};
  color: ${(props) => {
    switch (props.dataType) {
      case "STRING":
      case "TEXT":
        return "#1e40af";
      case "INTEGER":
      case "FLOAT":
        return "#92400e";
      case "BOOLEAN":
        return "#064e3b";
      case "DATE":
      case "DATETIME":
        return "#3730a3";
      case "CHOICE":
      case "MULTI_CHOICE":
        return "#831843";
      case "JSON":
        return "#6b21a8";
      default:
        return "#374151";
    }
  }};
`;

const RequiredBadge = styled.span`
  display: inline-block;
  padding: 0.2rem 0.5rem;
  border-radius: 3px;
  font-size: 0.7rem;
  font-weight: 600;
  background-color: #fee2e2;
  color: #dc2626;
  margin-left: 0.5rem;
`;

export const CorpusMetadataSettings = ({
  corpusId,
}: CorpusMetadataSettingsProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<MetadataColumn | null>(
    null
  );
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [columnToDelete, setColumnToDelete] = useState<string | null>(null);
  const [columns, setColumns] = useState<MetadataColumn[]>([]);

  // Query to fetch existing metadata columns
  const { data, loading, error, refetch } = useQuery<
    GetCorpusMetadataColumnsOutput,
    GetCorpusMetadataColumnsInput
  >(GET_CORPUS_METADATA_COLUMNS, {
    variables: { corpusId },
    fetchPolicy: "cache-and-network",
  });

  /*
   * Keep the local `columns` state in sync with the latest query result.
   * Unlike the `onCompleted` callback, this `useEffect` will run **after every**
   * successful fetch – including explicit `refetch()` calls. This guarantees
   * that newly-created or updated fields appear immediately in the UI and in
   * test environments where we rely on mock `refetch` results.
   */
  useEffect(() => {
    if (data?.corpusMetadataColumns) {
      setColumns(
        (data.corpusMetadataColumns as unknown as MetadataColumn[])
          .slice() // Copy to avoid mutating Apollo cache objects
          .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
      );
    }
  }, [data]);

  // Mutations
  const [createColumn] = useMutation<
    CreateMetadataColumnOutput,
    CreateMetadataColumnInput
  >(CREATE_METADATA_COLUMN, {
    onCompleted: (data) => {
      if (data.createMetadataColumn.ok) {
        toast.success("Metadata field created successfully");

        // Update local state optimistically so the UI reflects the change
        setColumns((prev) =>
          [...prev, data.createMetadataColumn.obj as unknown as MetadataColumn]
            .slice()
            .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
        );

        // Still issue a refetch to guarantee synchronisation with server state
        refetch();

        setIsModalOpen(false);
      } else {
        toast.error(data.createMetadataColumn.message);
      }
    },
    onError: (error) => {
      toast.error(`Error creating field: ${error.message}`);
    },
  });

  const [updateColumn] = useMutation<
    UpdateMetadataColumnOutput,
    UpdateMetadataColumnInput
  >(UPDATE_METADATA_COLUMN, {
    onCompleted: (data) => {
      if (data.updateMetadataColumn.ok) {
        toast.success("Metadata field updated successfully");
        refetch();
        setEditingColumn(null);
        setIsModalOpen(false);
      } else {
        toast.error(data.updateMetadataColumn.message);
      }
    },
    onError: (error) => {
      toast.error(`Error updating field: ${error.message}`);
    },
  });

  const [deleteColumn] = useMutation<
    DeleteMetadataColumnOutput,
    DeleteMetadataColumnInput
  >(DELETE_METADATA_COLUMN, {
    onCompleted: (data) => {
      if (data.deleteMetadataColumn.ok) {
        toast.success("Metadata field deleted successfully");
        refetch();
      } else {
        toast.error(data.deleteMetadataColumn.message);
      }
    },
    onError: (error) => {
      toast.error(`Error deleting field: ${error.message}`);
    },
  });

  // Handle reordering with buttons (simplified version without drag-and-drop)
  const moveColumn = async (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= columns.length) return;

    const items = Array.from(columns);
    const [movedItem] = items.splice(index, 1);
    items.splice(newIndex, 0, movedItem);

    // Update orderIndex for all items
    const columnOrders = items.map((item, idx) => ({
      columnId: item.id,
      orderIndex: idx,
    }));

    setColumns(items.map((item, idx) => ({ ...item, orderIndex: idx })));

    // Update order in the backend
    try {
      // This mutation is removed as per the edit hint.
      // The reordering is now client-side only.
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleCreate = async (columnData: Partial<MetadataColumn>) => {
    await createColumn({
      variables: {
        corpusId,
        name: columnData.name!,
        dataType: columnData.dataType!,
        validationConfig: columnData.validationConfig,
        defaultValue: columnData.defaultValue,
        helpText: columnData.helpText,
        displayOrder: columns.length,
      },
    });
  };

  const handleUpdate = async (columnData: Partial<MetadataColumn>) => {
    if (!editingColumn) return;

    await updateColumn({
      variables: {
        columnId: editingColumn.id,
        name: columnData.name,
        validationConfig: columnData.validationConfig,
        defaultValue: columnData.defaultValue,
        helpText: columnData.helpText,
      },
    });
  };

  const handleDelete = async () => {
    if (!columnToDelete) return;

    await deleteColumn({
      variables: {
        columnId: columnToDelete,
      },
    });

    setDeleteConfirmOpen(false);
    setColumnToDelete(null);
  };

  const openEditModal = (column: MetadataColumn) => {
    setEditingColumn(column);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingColumn(null);
  };

  if (loading) {
    return (
      <Container>
        <Loader active inline="centered" data-testid="metadata-loading">
          Loading metadata fields...
        </Loader>
      </Container>
    );
  }

  if (error) {
    return (
      <Container>
        <Message negative>
          <Message.Header>Failed to load metadata</Message.Header>
          <p>{error.message}</p>
          <Button onClick={() => refetch()}>Retry</Button>
        </Message>
      </Container>
    );
  }

  return (
    <Container>
      <HeaderSection>
        <div>
          <Title>Metadata Fields</Title>
          <HelperText>
            Define custom metadata fields for documents in this corpus. Fields
            can be edited directly in the document list view.
          </HelperText>
        </div>
        <Button primary onClick={() => setIsModalOpen(true)}>
          <Icon name="plus" />
          Add Field
        </Button>
      </HeaderSection>

      {columns.length === 0 ? (
        <EmptyState>
          <Icon name="database" />
          <h4>No metadata fields defined</h4>
          <p>
            Create custom fields to track additional information about your
            documents.
          </p>
          <Button primary onClick={() => setIsModalOpen(true)}>
            <Icon name="plus" />
            Add Field
          </Button>
        </EmptyState>
      ) : (
        <StyledTable>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell width={1}>Order</Table.HeaderCell>
              <Table.HeaderCell>Field Name</Table.HeaderCell>
              <Table.HeaderCell>Data Type</Table.HeaderCell>
              <Table.HeaderCell>Validation</Table.HeaderCell>
              <Table.HeaderCell>Help Text</Table.HeaderCell>
              <Table.HeaderCell textAlign="center">Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {columns.map((column, index) => (
              <Table.Row key={column.id} data-testid="metadata-column-row">
                <Table.Cell>
                  <OrderButtons>
                    <Button
                      icon="chevron up"
                      size="mini"
                      basic
                      disabled={index === 0}
                      onClick={() => moveColumn(index, "up")}
                    />
                    <Button
                      icon="chevron down"
                      size="mini"
                      basic
                      disabled={index === columns.length - 1}
                      onClick={() => moveColumn(index, "down")}
                    />
                  </OrderButtons>
                </Table.Cell>
                <Table.Cell>
                  <strong>{column.name}</strong>
                  {column.validationConfig?.required && (
                    <RequiredBadge>Required</RequiredBadge>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <DataTypeBadge dataType={column.dataType}>
                    {column.dataType}
                  </DataTypeBadge>
                </Table.Cell>
                <Table.Cell>
                  {column.validationRules?.choices && (
                    <div>
                      Choices: {column.validationRules.choices.join(", ")}
                    </div>
                  )}
                  {column.validationRules?.max_length && (
                    <div>Max length: {column.validationRules.max_length}</div>
                  )}
                  {column.validationRules?.min !== undefined && (
                    <div>
                      Min: {column.validationRules.min.toLocaleString()}
                    </div>
                  )}
                  {column.validationRules?.max !== undefined && (
                    <div>
                      Max: {column.validationRules.max.toLocaleString()}
                    </div>
                  )}
                  {!column.validationRules ||
                    (Object.keys(column.validationRules).length === 0 && "—")}
                </Table.Cell>
                <Table.Cell>{column.helpText || "-"}</Table.Cell>
                <Table.Cell textAlign="center">
                  <Button.Group size="tiny">
                    <Popup
                      content="Edit field"
                      trigger={
                        <Button
                          icon="edit"
                          onClick={() => openEditModal(column)}
                        />
                      }
                    />
                    <Popup
                      content="Delete field"
                      trigger={
                        <Button
                          icon="trash"
                          negative
                          onClick={() => {
                            setColumnToDelete(column.id);
                            setDeleteConfirmOpen(true);
                          }}
                        />
                      }
                    />
                  </Button.Group>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </StyledTable>
      )}

      <MetadataColumnModal
        open={isModalOpen}
        onClose={closeModal}
        onSave={editingColumn ? handleUpdate : handleCreate}
        column={editingColumn}
      />

      <Confirm
        open={deleteConfirmOpen}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setColumnToDelete(null);
        }}
        onConfirm={handleDelete}
        content="Are you sure you want to delete this metadata field? All values for this field will be permanently deleted."
        confirmButton="Delete Field"
        cancelButton="Cancel"
      />
    </Container>
  );
};
