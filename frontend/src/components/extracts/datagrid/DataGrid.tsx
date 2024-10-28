import React, {
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect,
} from "react";
import DataGrid, { RowsChangeData, textEditor } from "react-data-grid";
import { useMutation } from "@apollo/client";
import { toast } from "react-toastify";
import { Button, Icon, Popup } from "semantic-ui-react";
import {
  REQUEST_APPROVE_DATACELL,
  REQUEST_EDIT_DATACELL,
  REQUEST_REJECT_DATACELL,
  RequestApproveDatacellInputType,
  RequestApproveDatacellOutputType,
  RequestEditDatacellInputType,
  RequestEditDatacellOutputType,
  RequestRejectDatacellInputType,
  RequestRejectDatacellOutputType,
} from "../../../graphql/mutations";
import { ExtractCellFormatter } from "./ExtractCellFormatter";
import {
  ExtractGridColumn,
  ExtractGridRow,
  CellStatus,
} from "../../../types/extract-grid";
import {
  ColumnType,
  DatacellType,
  DocumentType,
  ExtractType,
} from "../../../types/graphql-api";
import "react-data-grid/lib/styles.css";
import { useDropzone } from "react-dropzone";
import { addingColumnToExtract } from "../../../graphql/cache";
import { CreateColumnModal } from "../../widgets/modals/CreateColumnModal";
import { UPLOAD_DOCUMENT } from "../../../graphql/mutations";
import styled from "styled-components";
import { Dimmer, Loader } from "semantic-ui-react";

interface DragState {
  isDragging: boolean;
  dragY: number | null;
}

interface DataGridProps {
  extract: ExtractType;
  cells: DatacellType[];
  rows: DocumentType[];
  columns: ColumnType[];
  onAddDocIds: (extractId: string, documentIds: string[]) => void;
  onRemoveDocIds: (extractId: string, documentIds: string[]) => void;
  onRemoveColumnId: (columnId: string) => void;
  onUpdateRow?: (newRow: DocumentType) => void; // Add this prop
  loading?: boolean;
}

// Add these styles near the top of the file
const styles = {
  gridWrapper: {
    height: "100%",
    width: "100%",
    position: "relative" as const,
    backgroundColor: "#fff",
    borderRadius: "8px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
  },
  headerCell: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 16px",
    backgroundColor: "#f8f9fa",
    borderBottom: "2px solid #e9ecef",
    fontWeight: 600,
  },
  phantomColumn: {
    position: "absolute" as const,
    right: 0,
    top: 0,
    bottom: 0,
    width: "60px",
    cursor: "pointer",
    border: "2px dashed #dee2e6",
    borderLeft: "none",
    background: "#fff",
    transition: "all 0.2s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    "&:hover": {
      background: "#f8f9fa",
      borderColor: "#4caf50",
    },
  },
  dropOverlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 120, 255, 0.05)",
    backdropFilter: "blur(2px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
    pointerEvents: "none" as const,
  },
  dropMessage: {
    padding: "20px 30px",
    backgroundColor: "white",
    borderRadius: "8px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
    border: "2px dashed #0078ff",
    fontSize: "1.1em",
  },
};

// Add this styled component at the top if using styled-components
const AddColumnDropzone = styled.div`
  min-width: 200px;
  border: 2px dashed rgba(34, 36, 38, 0.15); // Semantic UI's default border color
  border-radius: 0.28571429rem; // Semantic UI's default border radius
  background-color: rgba(0, 0, 0, 0.02);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  margin: 1rem 0;
  height: calc(100% - 2rem);

  &:hover {
    border-color: #21ba45; // Semantic UI's green
    background-color: rgba(33, 186, 69, 0.05);

    .add-icon {
      opacity: 1;
      transform: scale(1);
    }
  }

  .add-icon {
    color: #21ba45;
    opacity: 0;
    transform: scale(0.8);
    transition: all 0.2s ease;
    font-size: 2rem;
  }
`;

export const ExtractDataGrid: React.FC<DataGridProps> = ({
  extract,
  cells: initialCells,
  rows,
  columns,
  onAddDocIds,
  onRemoveDocIds,
  onRemoveColumnId,
  onUpdateRow,
  loading,
}) => {
  console.log("ExtractDataGrid received columns:", columns);
  console.log("ExtractDataGrid received extract:", extract);
  console.log("ExtractDataGrid received rows:", rows);

  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  console.log("Cells", initialCells);

  useEffect(() => {
    console.log("Cells", initialCells);
    console.log("Columns", columns);
  }, [initialCells, columns]);

  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dragY: null,
  });
  const gridRef = useRef<HTMLDivElement>(null);

  // Local state for cells
  const [localCells, setLocalCells] = useState<DatacellType[]>(initialCells);

  // Add an effect to update localCells when initialCells changes
  useEffect(() => {
    console.log("Initial cells received:", initialCells);
    setLocalCells(initialCells);
  }, [initialCells]);

  // Also add this debug log
  useEffect(() => {
    console.log("Local cells state:", localCells);
  }, [localCells]);

  // Add a function to derive cell status from a cell
  const deriveCellStatus = useCallback(
    (cell: DatacellType): CellStatus => {
      const extractIsProcessing =
        extract.started && !extract.finished && !extract.error;
      const cellIsProcessing = cell.started && !cell.completed && !cell.failed;
      const isProcessing =
        cellIsProcessing || (extractIsProcessing && !cell.started);

      return {
        isLoading: Boolean(isProcessing),
        isApproved: Boolean(cell.approvedBy),
        isRejected: Boolean(cell.rejectedBy),
        isEdited: Boolean(cell.correctedData),
        originalData: cell.data || null,
        correctedData: cell.correctedData || null,
        error: cell.failed || null,
      };
    },
    [extract]
  );

  // Check if extract is complete
  const isExtractComplete =
    extract.started && extract.finished && !extract.error;

  // Convert data to grid format
  const gridRows = useMemo<ExtractGridRow[]>(() => {
    console.log("Creating gridRows with:", {
      rows,
      cells: initialCells,
      columns,
      extract,
    });
    return rows.map((row) => {
      const rowData: ExtractGridRow = {
        id: row.id,
        documentId: row.id,
        documentTitle: row.title || "",
      };

      console.log("Processing row:", row.id);

      columns.forEach((column) => {
        console.log("Processing column for row:", {
          rowId: row.id,
          columnId: column.id,
        });
        const cell = initialCells.find(
          (c) => c.document.id === row.id && c.column.id === column.id
        );
        console.log("Found cell:", cell);

        if (cell) {
          console.log("Cell data:", cell.data?.data);
          rowData[column.id] = cell.data?.data || ""; // Ensure empty string instead of empty object
        } else {
          rowData[column.id] = ""; // Ensure empty string instead of empty object
        }
      });

      console.log("Final rowData:", rowData);
      return rowData;
    });
  }, [rows, initialCells, columns, extract]);

  // Column Actions Component
  const ColumnActions: React.FC<{ column: ExtractGridColumn }> = ({
    column,
  }) => {
    if (column.key === "documentTitle") return null;

    return (
      <Popup
        trigger={
          <Icon name="ellipsis vertical" style={{ cursor: "pointer" }} />
        }
        content={
          <Button
            icon="trash"
            color="red"
            onClick={() => onRemoveColumnId(column.key)}
            content="Remove Column"
          />
        }
        position="bottom right"
      />
    );
  };

  // Separate mutations for edit, approve, and reject
  const [editDatacell] = useMutation<
    RequestEditDatacellOutputType,
    RequestEditDatacellInputType
  >(REQUEST_EDIT_DATACELL, {
    onCompleted: (data) => {
      toast.success("Cell updated!");
      const updatedCell = data.editDatacell.obj;
      setLocalCells((prev) =>
        prev.map((cell) => (cell.id === updatedCell.id ? updatedCell : cell))
      );
    },
    onError: () => toast.error("Failed to update cell!"),
  });

  const [approveDatacell] = useMutation<
    RequestApproveDatacellOutputType,
    RequestApproveDatacellInputType
  >(REQUEST_APPROVE_DATACELL, {
    onCompleted: (data) => {
      if (data.approveDatacell.ok) {
        toast.success("Cell approved!");
        const updatedCell = data.approveDatacell.obj;
        console.log("Updated cell:", updatedCell);
        setLocalCells((prev) =>
          prev.map((cell) => (cell.id === updatedCell.id ? updatedCell : cell))
        );
      } else {
        toast.error("Failed to approve cell: " + data.approveDatacell.message);
      }
    },
    onError: () => toast.error("Failed to approve cell!"),
  });

  const [rejectDatacell] = useMutation<
    RequestRejectDatacellOutputType,
    RequestRejectDatacellInputType
  >(REQUEST_REJECT_DATACELL, {
    onCompleted: (data) => {
      toast.success("Cell rejected!");
      const updatedCell = data.rejectDatacell.obj;
      setLocalCells((prev) =>
        prev.map((cell) => (cell.id === updatedCell.id ? updatedCell : cell))
      );
    },
    onError: () => toast.error("Failed to reject cell!"),
  });

  // Separate handlers for edit, approve, and reject
  const handleEditDatacell = useCallback(
    async (datacellId: string, editedData: any) => {
      if (!isExtractComplete) {
        toast.warn("Cannot edit cells until extract is complete");
        return;
      }

      // Set loading state
      setLocalCells((prev) =>
        prev.map((cell) =>
          cell.id === datacellId
            ? {
                ...cell,
                started: cell.started || "",
                completed: cell.completed || "",
              }
            : cell
        )
      );

      await editDatacell({
        variables: {
          datacellId,
          editedData,
        },
      });
    },
    [editDatacell, isExtractComplete]
  );

  const handleApproveCell = useCallback(
    async (datacellId: string) => {
      if (!isExtractComplete) {
        toast.warn("Cannot approve cells until extract is complete");
        return;
      }

      // Set loading state
      setLocalCells((prev) =>
        prev.map((cell) =>
          cell.id === datacellId
            ? { ...cell, started: new Date().toISOString(), completed: "" }
            : cell
        )
      );

      await approveDatacell({
        variables: {
          datacellId,
        },
      });
    },
    [approveDatacell, isExtractComplete]
  );

  const handleRejectCell = useCallback(
    async (datacellId: string) => {
      if (!isExtractComplete) {
        toast.warn("Cannot reject cells until extract is complete");
        return;
      }

      // Set loading state
      setLocalCells((prev) =>
        prev.map((cell) =>
          cell.id === datacellId
            ? { ...cell, started: new Date().toISOString(), completed: "" }
            : cell
        )
      );

      await rejectDatacell({
        variables: {
          datacellId,
        },
      });
    },
    [rejectDatacell, isExtractComplete]
  );

  // Update cell statuses when cells change
  useEffect(() => {
    const newStatuses: Record<string, CellStatus> = {};

    initialCells.forEach((cell) => {
      const extractIsProcessing =
        extract.started && !extract.finished && !extract.error;
      const cellIsProcessing = cell.started && !cell.completed && !cell.failed;
      const isProcessing =
        cellIsProcessing || (extractIsProcessing && !cell.started);

      newStatuses[cell.id] = {
        isLoading: Boolean(isProcessing),
        isApproved: Boolean(cell.approvedBy),
        isRejected: Boolean(cell.rejectedBy),
        isEdited: Boolean(cell.correctedData),
        originalData: cell.data || null,
        correctedData: cell.correctedData || null,
        error: cell.failed || null,
      };
    });

    console.log("Updating cell statuses:", newStatuses);
    setLocalCells((prev) =>
      prev.map((cell) =>
        newStatuses[cell.id] ? { ...cell, ...newStatuses[cell.id] } : cell
      )
    );
  }, [initialCells, extract]); // Added extract to dependencies

  const getCellContent = useCallback(
    (row: ExtractGridRow, column: ExtractGridColumn) => {
      if (column.key === "documentTitle") {
        return {
          value: String(row.documentTitle || ""),
          cellStatus: null,
          cellId: "",
        };
      }

      // Find the actual cell data
      const cell = localCells.find(
        (c) => c.document?.id === row.id && c.column?.id === column.key
      );

      // Derive cell status even if cell is not found
      const cellStatus = cell
        ? deriveCellStatus(cell)
        : {
            isLoading: false,
            isApproved: false,
            isRejected: false,
            isEdited: false,
            originalData: null,
            correctedData: null,
            error: null,
          };

      return {
        value: String(row[column.key] || ""),
        cellStatus, // This should now always be defined
        cellId: cell?.id || "",
      };
    },
    [localCells, deriveCellStatus]
  );

  // Map cell statuses for quick access
  const cellStatusMap = useMemo(() => {
    const map = new Map<string, CellStatus>();
    localCells.forEach((cell) => {
      if (cell?.document?.id && cell?.column?.id) {
        // Add null checks
        const status = deriveCellStatus(cell);
        map.set(`${cell.document.id}-${cell.column.id}`, status);
      }
    });
    return map;
  }, [localCells, deriveCellStatus]);

  // Prepare columns with custom renderCell functions
  const gridColumns = useMemo(() => {
    return [
      {
        key: "documentTitle",
        name: "Document",
        frozen: true,
        width: 200,
        renderCell: (props: any) => {
          return <div>{props.row.documentTitle}</div>;
        },
      },
      ...columns.map((col) => ({
        key: col.id,
        name: col.name,
        width: 250,
        resizable: true,
        renderCell: (props: any) => {
          // Add debug logging
          console.log("Looking for cell with:", {
            documentId: props.row.documentId,
            columnId: col.id,
            availableCells: localCells.map((c) => ({
              docId: c.document?.id,
              colId: c.column?.id,
              cellId: c.id,
            })),
          });

          const cell = localCells.find(
            (c) =>
              c.document?.id === props.row.documentId && c.column?.id === col.id
          );

          // Log if cell was found
          console.log("Found cell:", cell);

          const cellStatus = cell
            ? deriveCellStatus(cell)
            : {
                isLoading: false,
                isApproved: false,
                isRejected: false,
                isEdited: false,
                originalData: null,
                correctedData: null,
                error: null,
              };

          return (
            <ExtractCellFormatter
              value={String(props.row[col.id] || "")}
              cellStatus={cellStatus}
              cellId={cell?.id || ""}
              onApprove={() => {
                if (!cell?.id) {
                  console.warn("Cannot approve cell: No cell ID found", {
                    documentId: props.row.documentId,
                    columnId: col.id,
                    cell,
                  });
                  return;
                }
                console.log("Approving cell:", cell.id);
                handleApproveCell(cell.id);
              }}
              onReject={() => {
                if (!cell?.id) return;
                handleRejectCell(cell.id);
              }}
              isExtractComplete={Boolean(isExtractComplete)}
            />
          );
        },
      })),
    ];
  }, [
    columns,
    localCells,
    handleApproveCell,
    handleRejectCell,
    isExtractComplete,
    deriveCellStatus,
  ]);

  // Add an effect to monitor columns changes
  useEffect(() => {
    console.log("Columns changed:", columns);
    console.log("Current gridColumns:", gridColumns);
  }, [columns, gridColumns]);

  // Add debug logging after column processing
  useEffect(() => {
    console.log("Processed gridColumns:", gridColumns);
  }, [gridColumns]);

  useEffect(() => {
    console.log("Grid Columns", gridColumns);
    console.log("Grid Rows", gridRows);
  }, [gridColumns, gridRows]);

  // Upload document mutation - but we'll use the response to call onAddDocIds
  const [uploadDocument] = useMutation(UPLOAD_DOCUMENT);

  // Handle document drops
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      try {
        const uploadPromises = acceptedFiles.map(async (file) => {
          // Convert file to base64
          const base64String = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = (reader.result as string).split(",")[1];
              resolve(base64);
            };
            reader.readAsDataURL(file);
          });

          // Upload document
          const response = await uploadDocument({
            variables: {
              base64FileString: base64String,
              filename: file.name,
              title: file.name,
              description: "",
              customMeta: {},
              makePublic: false,
              ...(extract.corpus?.id
                ? { addToCorpusId: extract.corpus.id }
                : {}),
            },
          });

          return response.data.uploadDocument.document.id;
        });

        // Wait for all uploads to complete
        const newDocumentIds = await Promise.all(uploadPromises);

        // Use the parent's handler to add documents to extract
        onAddDocIds(extract.id, newDocumentIds);
      } catch (error) {
        toast.error("Failed to upload documents");
        console.error("Upload error:", error);
      }
    },
    [extract, uploadDocument, onAddDocIds]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    accept: {
      "application/pdf": [".pdf"],
    },
  });

  // Calculate drop position for preview row
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!gridRef.current) return;

    const gridRect = gridRef.current.getBoundingClientRect();
    const relativeY = e.clientY - gridRect.top;
    const rowHeight = 35; // Default row height
    const insertIndex = Math.floor(relativeY / rowHeight);

    setDragState({
      isDragging: true,
      dragY: insertIndex * rowHeight,
    });
  }, []);

  // Preview row component
  const DragPreviewRow = () => (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: dragState.dragY ?? 0,
        height: "35px",
        backgroundColor: "rgba(0, 120, 255, 0.1)",
        borderTop: "2px dashed #0078ff",
        borderBottom: "2px dashed #0078ff",
        pointerEvents: "none",
        zIndex: 1000,
      }}
    />
  );

  // Column management
  const [isAddingColumn, setIsAddingColumn] = useState(false);

  const handleCreateColumn = useCallback(
    (data: any) => {
      if (!extract.fieldset?.id) return;
      addingColumnToExtract({
        fieldset: extract.fieldset,
        ...data,
      });
    },
    [extract.fieldset]
  );

  // Handle row changes (edits)
  const onRowsChange = useCallback(
    (newRows: ExtractGridRow[], changes: RowsChangeData<ExtractGridRow>) => {
      // Get the updated cell
      const { indexes, column } = changes;
      if (column.key === "documentTitle") return; // Do not allow editing the title

      const rowIndex = indexes[0];
      const updatedRow = newRows[rowIndex];
      const newValue = updatedRow[column.key];

      // Find the datacellId
      const cell = localCells.find(
        (c) =>
          c.document.id === updatedRow.documentId && c.column.id === column.key
      );

      if (cell) {
        handleEditDatacell(cell.id, newValue);
      }

      // Notify parent of row update if callback provided
      if (onUpdateRow) {
        onUpdateRow(updatedRow);
      }
    },
    [localCells, handleEditDatacell, onUpdateRow]
  );

  return (
    <>
      {loading && (
        <Dimmer active>
          <Loader>Loading...</Loader>
        </Dimmer>
      )}

      <CreateColumnModal
        open={isAddingColumn}
        onSubmit={handleCreateColumn}
        onClose={() => setIsAddingColumn(false)}
      />

      <div
        {...getRootProps()}
        ref={gridRef}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragState({ isDragging: false, dragY: null })}
        style={styles.gridWrapper}
      >
        <input {...getInputProps()} />

        {isDragActive && dragState.isDragging && <DragPreviewRow />}

        {/* Remove the Add Column button here */}

        <DataGrid
          columns={gridColumns}
          rows={gridRows}
          rowKeyGetter={(row) => row.id}
          selectedRows={selectedRows}
          onSelectedRowsChange={setSelectedRows}
          className="custom-data-grid"
          onRowsChange={onRowsChange} // Use onRowsChange to handle cell edits
        />

        <AddColumnDropzone
          onClick={() => addingColumnToExtract(extract)}
          role="button"
          aria-label="Add new column"
        >
          <Icon name="plus circle" className="add-icon" />
        </AddColumnDropzone>

        {isDragActive && (
          <div style={styles.dropOverlay}>
            <div style={styles.dropMessage}>
              Drop PDF documents here to add to{" "}
              {extract.corpus ? "corpus and extract" : "extract"}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .custom-data-grid {
          border: 1px solid #e0e0e0 !important;
          height: 100% !important;
          background: white;
        }

        .rdg-cell {
          border-right: 1px solid #e0e0e0 !important;
          border-bottom: 1px solid #e0e0e0 !important;
          padding: 8px 16px !important;
        }

        .rdg-header-row {
          background-color: #f8f9fa !important;
          font-weight: 600 !important;
          border-bottom: 2px solid #dee2e6 !important;
        }

        .rdg-row:hover {
          background-color: #f8f9fa !important;
        }

        .rdg-row.rdg-row-selected {
          background-color: #e9ecef !important;
        }

        .phantom-column-icon {
          transition: all 0.2s ease !important;
        }

        ${styles.phantomColumn}:hover .phantom-column-icon {
          color: #4caf50 !important;
          transform: scale(1.2);
        }
      `}</style>
    </>
  );
};
