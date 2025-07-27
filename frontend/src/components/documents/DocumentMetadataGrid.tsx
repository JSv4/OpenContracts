import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Table,
  Loader,
  Dimmer,
  Button,
  Icon,
  Popup,
  Input,
  Checkbox,
  Dropdown,
  Message,
} from "semantic-ui-react";
import { useQuery, useMutation } from "@apollo/client";
import { toast } from "react-toastify";
import styled from "styled-components";
import { debounce } from "lodash";

import {
  GET_CORPUS_METADATA_COLUMNS,
  GET_DOCUMENT_METADATA_DATACELLS,
  SET_METADATA_VALUE,
  DELETE_METADATA_VALUE,
  GetCorpusMetadataColumnsInput,
  GetCorpusMetadataColumnsOutput,
  GetDocumentMetadataDatacellsInput,
  GetDocumentMetadataDatacellsOutput,
  SetMetadataValueInput,
  SetMetadataValueOutput,
  DeleteMetadataValueInput,
  DeleteMetadataValueOutput,
} from "../../graphql/metadataOperations";
import {
  MetadataColumn,
  MetadataDataType,
  MetadataDatacell,
  validateMetadataValue,
  formatMetadataValue,
  getDefaultValueForDataType,
} from "../../types/metadata";
import { DocumentType } from "../../types/graphql-api";
import { MetadataCellEditor } from "../metadata/editors/MetadataCellEditor";

interface DocumentMetadataGridProps {
  corpusId: string;
  documents: DocumentType[];
  loading?: boolean;
  onDocumentClick?: (document: DocumentType) => void;
}

const GridContainer = styled.div`
  height: 100%;
  width: 100%;
  position: relative;
  background: #ffffff;
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const GridWrapper = styled.div`
  flex: 1;
  overflow: auto;
  position: relative;
  min-height: 0;
  -webkit-overflow-scrolling: touch;
`;

const StyledTable = styled(Table)`
  &.ui.table {
    margin: 0;
    border: none;
    border-radius: 0;

    thead {
      position: sticky;
      top: 0;
      z-index: 10;
      background: white;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

      th {
        background: #f8fafc;
        font-weight: 600;
        color: #475569;
        text-transform: uppercase;
        font-size: 0.75rem;
        letter-spacing: 0.05em;
        white-space: nowrap;
        position: relative;

        &:first-child {
          position: sticky;
          left: 0;
          z-index: 11;
          background: #f8fafc;
          box-shadow: 2px 0 4px rgba(0, 0, 0, 0.05);
        }
      }
    }

    tbody {
      tr {
        transition: background-color 0.2s ease;

        &:hover {
          background-color: #f8fafc;
        }

        td {
          padding: 0.5rem;
          border-bottom: 1px solid #e2e8f0;

          &:first-child {
            position: sticky;
            left: 0;
            background: white;
            box-shadow: 2px 0 4px rgba(0, 0, 0, 0.05);
            z-index: 5;
            font-weight: 600;
            cursor: pointer;
            color: #3b82f6;

            &:hover {
              color: #2563eb;
              text-decoration: underline;
            }
          }
        }
      }
    }
  }
`;

const EditableCell = styled.div<{ isEditing: boolean; hasError: boolean }>`
  min-height: 2rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  background: ${(props) =>
    props.isEditing ? "#f0f9ff" : props.hasError ? "#fef2f2" : "transparent"};
  border: 1px solid
    ${(props) =>
      props.isEditing ? "#3b82f6" : props.hasError ? "#ef4444" : "transparent"};

  &:hover {
    background: ${(props) => (props.isEditing ? "#f0f9ff" : "#f8fafc")};
  }
`;

const EmptyValue = styled.span`
  color: #cbd5e1;
  font-style: italic;
`;

const ErrorTooltip = styled.div`
  background: #dc2626;
  color: white;
  padding: 0.5rem;
  border-radius: 4px;
  font-size: 0.875rem;
  max-width: 200px;
`;

interface CellKey {
  documentId: string;
  columnId: string;
}

export const DocumentMetadataGrid: React.FC<DocumentMetadataGridProps> = ({
  corpusId,
  documents,
  loading: documentsLoading,
  onDocumentClick,
}) => {
  const [editingCell, setEditingCell] = useState<CellKey | null>(null);
  const [cellValues, setCellValues] = useState<Record<string, any>>({});
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());

  // Query metadata columns
  const { data: columnsData, loading: columnsLoading } = useQuery<
    GetCorpusMetadataColumnsOutput,
    GetCorpusMetadataColumnsInput
  >(GET_CORPUS_METADATA_COLUMNS, {
    variables: { corpusId },
  });

  // For now, we'll need to load metadata per document
  // In a real implementation, we'd want a batch query
  const [datacellsMap, setDatacellsMap] = useState<
    Record<string, MetadataDatacell[]>
  >({});

  // Mutations
  const [setMetadataValue] = useMutation<
    SetMetadataValueOutput,
    SetMetadataValueInput
  >(SET_METADATA_VALUE, {
    onCompleted: (data) => {
      if (data.setMetadataValue.ok) {
        const key = getCellKey(editingCell!);
        setDirtyFields((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      } else {
        toast.error(data.setMetadataValue.message);
      }
    },
    onError: (error) => {
      toast.error(`Error saving value: ${error.message}`);
    },
  });

  const [deleteMetadataValue] = useMutation<
    DeleteMetadataValueOutput,
    DeleteMetadataValueInput
  >(DELETE_METADATA_VALUE);

  // Helper functions
  const getCellKey = (cell: CellKey): string =>
    `${cell.documentId}-${cell.columnId}`;

  const getDatacell = (
    documentId: string,
    columnId: string
  ): MetadataDatacell | undefined => {
    const datacells = datacellsMap[documentId] || [];
    return datacells.find((d) => d.column.id === columnId);
  };

  const getCellValue = (documentId: string, columnId: string): any => {
    const key = getCellKey({ documentId, columnId });
    if (cellValues.hasOwnProperty(key)) {
      return cellValues[key];
    }
    const datacell = getDatacell(documentId, columnId);
    return datacell?.data?.value;
  };

  const handleCellClick = (documentId: string, columnId: string) => {
    setEditingCell({ documentId, columnId });
  };

  const handleCellChange = (value: any) => {
    if (!editingCell) return;

    const key = getCellKey(editingCell);
    setCellValues((prev) => ({ ...prev, [key]: value }));
    setDirtyFields((prev) => new Set(prev).add(key));

    // Validate
    const column = columns.find((c) => c.id === editingCell.columnId);
    if (column) {
      const isValid = validateMetadataValue(value, column);
      if (isValid) {
        setValidationErrors((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      } else {
        setValidationErrors((prev) => ({
          ...prev,
          [key]: "Invalid value",
        }));
      }
    }

    // Debounced save
    debouncedSave(editingCell.documentId, editingCell.columnId, value);
  };

  const debouncedSave = useCallback(
    debounce(async (documentId: string, columnId: string, value: any) => {
      const key = getCellKey({ documentId, columnId });
      const error = validationErrors[key];

      if (error) {
        return; // Don't save if there's a validation error
      }

      // Save the value
      if (value === null || value === undefined || value === "") {
        // Delete the datacell if value is empty
        await deleteMetadataValue({
          variables: { documentId, corpusId, columnId },
        });
      } else {
        await setMetadataValue({
          variables: { documentId, corpusId, columnId, value },
        });
      }
    }, 1500),
    [corpusId, validationErrors]
  );

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!editingCell) return;

    switch (e.key) {
      case "Escape":
        // Cancel editing
        const key = getCellKey(editingCell);
        setCellValues((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setValidationErrors((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
        setEditingCell(null);
        break;
      case "Enter":
        if (!e.shiftKey) {
          // Save and move to next row
          e.preventDefault();
          const currentDocIndex = documents.findIndex(
            (d) => d.id === editingCell.documentId
          );
          if (currentDocIndex < documents.length - 1) {
            setEditingCell({
              documentId: documents[currentDocIndex + 1].id,
              columnId: editingCell.columnId,
            });
          } else {
            setEditingCell(null);
          }
        }
        break;
      case "Tab":
        // Move to next column
        e.preventDefault();
        const currentColIndex = columns.findIndex(
          (c) => c.id === editingCell.columnId
        );
        if (e.shiftKey) {
          // Move to previous column
          if (currentColIndex > 0) {
            setEditingCell({
              documentId: editingCell.documentId,
              columnId: columns[currentColIndex - 1].id,
            });
          }
        } else {
          // Move to next column
          if (currentColIndex < columns.length - 1) {
            setEditingCell({
              documentId: editingCell.documentId,
              columnId: columns[currentColIndex + 1].id,
            });
          }
        }
        break;
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editingCell]);

  // Process columns
  const columns = (columnsData?.corpusMetadataColumns || [])
    .filter((col) => col.isManualEntry)
    .map((col) => ({
      ...col,
      dataType: col.dataType as MetadataDataType,
    }))
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const loading = columnsLoading || documentsLoading;

  if (loading) {
    return (
      <GridContainer>
        <Dimmer active inverted>
          <Loader>Loading metadata...</Loader>
        </Dimmer>
      </GridContainer>
    );
  }

  if (columns.length === 0) {
    return (
      <GridContainer>
        <Message info>
          <Message.Header>No Metadata Fields Defined</Message.Header>
          <p>
            This corpus doesn't have any metadata fields yet. Go to corpus
            settings to create metadata fields.
          </p>
        </Message>
      </GridContainer>
    );
  }

  return (
    <GridContainer>
      <GridWrapper role="grid">
        <StyledTable celled compact>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell width={3}>Document</Table.HeaderCell>
              {columns.map((column) => (
                <Table.HeaderCell key={column.id}>
                  {column.name}
                  {column.validationConfig?.required && (
                    <span style={{ color: "#ef4444", marginLeft: "0.25rem" }}>
                      *
                    </span>
                  )}
                </Table.HeaderCell>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {documents.map((document) => (
              <Table.Row key={document.id}>
                <Table.Cell onClick={() => onDocumentClick?.(document)}>
                  {document.title}
                </Table.Cell>
                {columns.map((column) => {
                  const isEditing =
                    editingCell?.documentId === document.id &&
                    editingCell?.columnId === column.id;
                  const cellKey = getCellKey({
                    documentId: document.id,
                    columnId: column.id,
                  });
                  const value = getCellValue(document.id, column.id);
                  const hasError = !!validationErrors[cellKey];
                  const isDirty = dirtyFields.has(cellKey);

                  return (
                    <Table.Cell key={column.id}>
                      {isEditing ? (
                        <MetadataCellEditor
                          column={column}
                          value={value}
                          onChange={handleCellChange}
                          onBlur={() => setEditingCell(null)}
                          error={validationErrors[cellKey]}
                          autoFocus
                        />
                      ) : (
                        <Popup
                          content={
                            <ErrorTooltip>
                              {validationErrors[cellKey]}
                            </ErrorTooltip>
                          }
                          open={hasError}
                          position="top center"
                          trigger={
                            <EditableCell
                              isEditing={false}
                              hasError={hasError}
                              onClick={() =>
                                handleCellClick(document.id, column.id)
                              }
                            >
                              {value !== null &&
                              value !== undefined &&
                              value !== "" ? (
                                <span>
                                  {formatMetadataValue(value, column.dataType)}
                                  {isDirty && (
                                    <Icon
                                      name="circle"
                                      size="tiny"
                                      color="blue"
                                      style={{ marginLeft: "0.5rem" }}
                                    />
                                  )}
                                </span>
                              ) : (
                                <EmptyValue>Click to edit</EmptyValue>
                              )}
                            </EditableCell>
                          }
                        />
                      )}
                    </Table.Cell>
                  );
                })}
              </Table.Row>
            ))}
          </Table.Body>
        </StyledTable>
      </GridWrapper>
    </GridContainer>
  );
};
