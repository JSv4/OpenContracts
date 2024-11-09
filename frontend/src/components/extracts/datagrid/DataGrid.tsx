import React, {
  forwardRef,
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
} from "react";
import DataGrid, {
  RowsChangeData,
  CopyEvent,
  PasteEvent,
  SelectColumn,
  SortColumn,
} from "react-data-grid";
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
  REQUEST_UPDATE_COLUMN,
  RequestUpdateColumnInputType,
  RequestUpdateColumnOutputType,
  REQUEST_DELETE_COLUMN,
  RequestDeleteColumnInputType,
  RequestDeleteColumnOutputType,
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
import { UPLOAD_DOCUMENT } from "../../../graphql/mutations";
import { Dimmer, Loader } from "semantic-ui-react";
import { parseOutputType } from "../../../utils/parseOutputType";
import { JSONSchema7 } from "json-schema";
import { TruncatedText } from "../../widgets/data-display/TruncatedText";
import { CreateColumnModal } from "../../widgets/modals/CreateColumnModal";
import { SelectDocumentsModal } from "../../widgets/modals/SelectDocumentsModal";

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
  onUpdateRow?: (newRow: DocumentType) => void;
  onAddColumn: () => void;
  loading?: boolean;
}

// Update the styles object with modern styling
const styles = {
  gridWrapper: {
    height: "100%",
    width: "100%",
    position: "relative" as const,
    backgroundColor: "#fff",
    borderRadius: "12px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
    minHeight: "400px",
    display: "flex",
    flexDirection: "column" as const,
    border: "1px solid rgba(0,0,0,0.08)",
    overflow: "hidden",
  },
  headerCell: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    backgroundColor: "#f8fafc",
    borderBottom: "2px solid #e2e8f0",
    fontWeight: 600,
    fontSize: "0.9rem",
    color: "#334155",
  },
  phantomColumn: {
    position: "absolute" as const,
    right: 0,
    top: 0,
    bottom: 0,
    width: "60px",
    cursor: "pointer",
    border: "2px dashed #cbd5e1",
    borderLeft: "none",
    background: "linear-gradient(to right, rgba(255,255,255,0), #fff)",
    transition: "all 0.2s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    "&:hover": {
      background: "linear-gradient(to right, rgba(248,250,252,0), #f8fafc)",
      borderColor: "#0ea5e9",
    },
  },
  dropOverlay: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(59, 130, 246, 0.03)",
    backdropFilter: "blur(4px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
    pointerEvents: "none" as const,
  },
  dropMessage: {
    padding: "24px 36px",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: "12px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
    border: "2px dashed #3b82f6",
    fontSize: "1.1em",
    color: "#1e293b",
    backdropFilter: "blur(8px)",
  },
};

// Add new interfaces for filter state
interface ColumnFilter {
  value: string;
  enabled: boolean;
}

interface FilterState {
  [columnId: string]: ColumnFilter;
}

// Add an interface for the exposed methods
export interface ExtractDataGridHandle {
  exportToCsv: () => void;
}

export const ExtractDataGrid = forwardRef<ExtractDataGridHandle, DataGridProps>(
  (
    {
      extract,
      cells: initialCells,
      rows,
      columns,
      onAddDocIds,
      onRemoveDocIds,
      onRemoveColumnId,
      onUpdateRow,
      onAddColumn,
      loading,
    },
    ref
  ) => {
    console.log("ExtractDataGrid received columns:", columns);
    console.log("ExtractDataGrid received extract:", extract);
    console.log("ExtractDataGrid received rows:", rows);

    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const [sortColumns, setSortColumns] = useState<readonly SortColumn[]>([]);

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
        const cellIsProcessing =
          cell.started && !cell.completed && !cell.failed;
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
      if (!rows || rows.length === 0) {
        return [
          {
            id: "placeholder",
            documentId: "",
            documentTitle: "Drop PDF documents here or click to upload",
            ...columns.reduce((acc, col) => {
              acc[col.id] = "";
              return acc;
            }, {} as Record<string, string>),
          },
        ];
      }

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
            prev.map((cell) =>
              cell.id === updatedCell.id ? updatedCell : cell
            )
          );
        } else {
          toast.error(
            "Failed to approve cell: " + data.approveDatacell.message
          );
        }
      },
      onError: () => toast.error("Failed to approve cell!"),
    });

    const [rejectDatacell] = useMutation<
      RequestRejectDatacellOutputType,
      RequestRejectDatacellInputType
    >(REQUEST_REJECT_DATACELL, {
      onCompleted: (data) => {
        if (data.rejectDatacell.ok) {
          toast.success("Cell rejected!");
          const updatedCell = data.rejectDatacell.obj;
          console.log("Updated cell:", updatedCell);
          setLocalCells((prev) =>
            prev.map((cell) =>
              cell.id === updatedCell.id ? updatedCell : cell
            )
          );
        } else {
          toast.error("Failed to reject cell: " + data.rejectDatacell.message);
        }
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
        const cellIsProcessing =
          cell.started && !cell.completed && !cell.failed;
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
            value: row.documentTitle || "",
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
          value: row[column.key] !== undefined ? row[column.key] : "",
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

    // Add state and handlers for editing columns
    const [isCreateColumnModalOpen, setIsCreateColumnModalOpen] =
      useState(false);
    const [editingColumn, setEditingColumn] = useState<ColumnType | null>(null);

    const handleEditColumn = (column: ColumnType) => {
      setEditingColumn(column);
      setIsCreateColumnModalOpen(true);
    };

    const handleColumnSubmit = async (data: any) => {
      // Implement the logic to update the column
      // For example, you might have:
      await updateColumnMutation({ variables: { ...data } });
      // Refresh the columns data or refetch queries as needed
      setIsCreateColumnModalOpen(false);
    };

    const gridColumns = useMemo(() => {
      const columnsArray = [
        {
          ...SelectColumn,
          width: 60,
          minWidth: 60,
          resizable: false,
        },
        {
          key: "documentTitle",
          name: "Document",
          frozen: true,
          width: 300,
          minWidth: 200,
          renderCell: (props: any) => {
            if (props.row.id === "placeholder") {
              return (
                <div
                  style={{
                    width: "100%",
                    textAlign: "center",
                    color: "#6c757d",
                    fontStyle: "italic",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                  }}
                >
                  <Icon name="file pdf outline" />
                  {props.row.documentTitle}
                </div>
              );
            }
            return (
              <div
                style={{
                  maxWidth: "100%",
                  minWidth: 0,
                  overflow: "hidden",
                }}
              >
                <TruncatedText
                  text={props.row.documentTitle || ""}
                  limit={100}
                />
              </div>
            );
          },
        },
        ...columns.map((col) => {
          const gridColumn: ExtractGridColumn = {
            key: col.id,
            name: col.name,
            id: col.id,
            width: 250,
            resizable: true,
          };

          return {
            ...gridColumn,
            renderHeaderCell: () => (
              <div>
                <span>{col.name}</span>
                <div className="header-controls">
                  <Button
                    icon="edit"
                    size="mini"
                    onClick={() => handleEditColumn(col)}
                    disabled={Boolean(extract.started)}
                  />
                  <Button
                    icon="trash"
                    size="mini"
                    color="red"
                    onClick={() => onRemoveColumnId(col.id)}
                    disabled={Boolean(extract.started)}
                  />
                </div>
              </div>
            ),
            renderCell: (props: any) => {
              if (props.row.id === "placeholder") {
                return <div>Bro</div>;
              }
              const content = getCellContent(props.row, gridColumn);
              const cellStatus = cellStatusMap.get(`${props.row.id}-${col.id}`);

              return (
                <ExtractCellFormatter
                  value={content.value}
                  cellStatus={cellStatus || null}
                  onApprove={() => handleApproveCell(content.cellId)}
                  onReject={() => handleRejectCell(content.cellId)}
                  onEdit={handleEditDatacell}
                  cellId={content.cellId}
                  readOnly={!isExtractComplete}
                  isExtractComplete={Boolean(isExtractComplete)}
                  schema={columnSchemas.get(col.id) || {}}
                  extractIsList={Boolean(col.extractIsList)}
                  row={props.row}
                  column={gridColumn}
                />
              );
            },
          };
        }),
      ];

      if (!extract.started) {
        columnsArray.push({
          key: "addColumn",
          name: "",
          width: 60,
          minWidth: 60,
          maxWidth: 60,
          resizable: false,
          renderHeaderCell: () => (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                width: "100%",
              }}
            >
              <Button
                icon="plus"
                circular
                size="mini"
                color="green"
                onClick={onAddColumn}
              />
            </div>
          ),
          renderCell: () => null,
        });
      }

      return columnsArray;
    }, [
      extract.started,
      columns,
      handleEditColumn,
      onRemoveColumnId,
      onAddColumn,
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
            c.document.id === updatedRow.documentId &&
            c.column.id === column.key
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

    const handleCopy = useCallback((args: CopyEvent<ExtractGridRow>): void => {
      const { sourceRow, sourceColumnKey } = args;
      const value = sourceRow[sourceColumnKey as keyof ExtractGridRow];
      if (window.isSecureContext) {
        // Serialize value to string
        const textToCopy =
          typeof value === "object" ? JSON.stringify(value) : String(value);
        navigator.clipboard.writeText(textToCopy);
      }
    }, []);

    const handlePaste = useCallback(
      (args: PasteEvent<ExtractGridRow>): ExtractGridRow => {
        const { sourceColumnKey, sourceRow, targetColumnKey, targetRow } = args;
        const sourceValue = sourceRow[sourceColumnKey as keyof ExtractGridRow];

        // Retrieve the target column to get its outputType and schema
        const targetColumn = columns.find((col) => col.id === targetColumnKey);
        if (!targetColumn) return targetRow;

        let parsedValue = sourceValue;

        // Parse the pasted value based on the target column's outputType
        try {
          const schema = parseOutputType(targetColumn.outputType);

          if (schema.type === "number") {
            parsedValue = Number(sourceValue);
          } else if (schema.type === "boolean") {
            parsedValue = sourceValue === "true";
          } else if (schema.type === "object" || targetColumn.extractIsList) {
            parsedValue = JSON.parse(sourceValue);
          } else {
            parsedValue = String(sourceValue);
          }
        } catch (error) {
          console.error("Failed to parse pasted value:", error);
          parsedValue = sourceValue;
        }

        // Return the updated row
        return {
          ...targetRow,
          [targetColumnKey]: parsedValue,
        };
      },
      [columns]
    );

    // Add this near the top of the component, with other memoized values
    const columnSchemas = useMemo(() => {
      const schemas = new Map<string, JSONSchema7>();
      columns.forEach((col) => {
        try {
          schemas.set(col.id, parseOutputType(col.outputType));
        } catch (error) {
          console.error(`Failed to parse schema for column ${col.id}:`, error);
          schemas.set(col.id, {}); // Fallback empty schema
        }
      });
      return schemas;
    }, [columns]);

    const handleRowsDelete = useCallback(async () => {
      if (!extract.started && selectedRows.size > 0) {
        setIsDeleting(true);
        try {
          const documentIds = Array.from(selectedRows);
          await onRemoveDocIds(extract.id, documentIds);
          setSelectedRows(new Set()); // Clear selection after delete
          toast.success(
            `Successfully removed ${documentIds.length} document(s)`
          );
        } catch (error) {
          toast.error("Failed to remove selected documents");
          console.error("Delete error:", error);
        } finally {
          setIsDeleting(false);
        }
      }
    }, [extract.id, selectedRows, onRemoveDocIds]);

    // Add filter state
    const [filters, setFilters] = useState<FilterState>({});
    const [filtersEnabled, setFiltersEnabled] = useState(false);

    // Add filter-related styles
    const filterColumnClassName = "filter-cell";

    const filterStyles = {
      filterInput: {
        width: "100%",
        padding: "4px",
        fontSize: "14px",
        border: "1px solid #ddd",
        borderRadius: "4px",
      },
      filterContainer: {
        padding: "8px",
        borderBottom: "1px solid var(--rdg-border-color)",
      },
    };

    // Function to determine if a column is primitive
    const isPrimitiveColumn = useCallback(
      (columnId: string) => {
        const column = columns.find((col) => col.id === columnId);
        if (!column) return false;

        try {
          const schema = parseOutputType(column.outputType);
          return ["string", "number", "boolean"].includes(
            schema.type as string
          );
        } catch {
          return false;
        }
      },
      [columns]
    );

    // Filter handler
    const handleFilterChange = useCallback(
      (columnId: string, value: string) => {
        setFilters((prev) => ({
          ...prev,
          [columnId]: {
            value,
            enabled: true,
          },
        }));
      },
      []
    );

    // Clear filters
    const clearFilters = useCallback(() => {
      setFilters({});
    }, []);

    // Toggle filters
    const toggleFilters = useCallback(() => {
      setFiltersEnabled((prev) => !prev);
    }, []);

    // Filter the rows
    const filteredGridRows = useMemo(() => {
      if (!filtersEnabled || Object.keys(filters).length === 0) return gridRows;

      return gridRows.filter((row) => {
        return Object.entries(filters).every(([columnId, filter]) => {
          if (!filter.enabled || !filter.value) return true;

          const cellValue = String(row[columnId] || "").toLowerCase();
          const filterValue = filter.value.toLowerCase();

          return cellValue.includes(filterValue);
        });
      });
    }, [gridRows, filters, filtersEnabled]);

    // Update gridColumns to include filter headers
    const gridColumnsWithFilters = useMemo(() => {
      return gridColumns.map((col) => {
        const isPrimitive = isPrimitiveColumn(col.key);

        return {
          ...col,
          headerCellClass: isPrimitive ? filterColumnClassName : undefined,
          renderHeaderCell: (props: any) => (
            <div>
              {/* Retain existing renderHeaderCell */}
              {"renderHeaderCell" in col && col.renderHeaderCell ? (
                col.renderHeaderCell(props)
              ) : (
                <div>{col.name}</div>
              )}
              {/* Add filter input for primitive columns */}
              {isPrimitive && filtersEnabled && (
                <div style={filterStyles.filterContainer}>
                  <input
                    style={filterStyles.filterInput}
                    value={filters[col.key]?.value || ""}
                    onChange={(e) =>
                      handleFilterChange(col.key, e.target.value)
                    }
                    placeholder={`Filter ${col.name}...`}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                </div>
              )}
            </div>
          ),
          sortable: true,
        };
      });
    }, [
      gridColumns,
      filters,
      filtersEnabled,
      isPrimitiveColumn,
      handleFilterChange,
    ]);

    const [updateColumnMutation] = useMutation<
      RequestUpdateColumnOutputType,
      RequestUpdateColumnInputType
    >(REQUEST_UPDATE_COLUMN, {
      onCompleted: (data) => {
        if (data.updateColumn.ok) {
          toast.success("Column updated successfully!");
          // Update your state or refetch queries as needed
        } else {
          toast.error(`Failed to update column: ${data.updateColumn.message}`);
        }
      },
      onError: (error) => {
        console.error("Update column error:", error);
        toast.error("An error occurred while updating the column.");
      },
    });

    const [deleteColumnMutation] = useMutation<
      RequestDeleteColumnOutputType,
      RequestDeleteColumnInputType
    >(REQUEST_DELETE_COLUMN, {
      onCompleted: (data) => {
        if (data.deleteColumn.ok) {
          toast.success("Column deleted successfully!");
          // Update your state or refetch queries as needed
        } else {
          toast.error(`Failed to delete column: ${data.deleteColumn.message}`);
        }
      },
      onError: (error) => {
        console.error("Delete column error:", error);
        toast.error("An error occurred while deleting the column.");
      },
    });

    const [openSelectDocumentsModal, setOpenSelectDocumentsModal] =
      useState<boolean>(false);

    // Add this function inside your component
    const getComparator = useCallback((sortColumn: string) => {
      return (a: ExtractGridRow, b: ExtractGridRow) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        // Handle undefined or null values
        if (aValue == null && bValue != null) return -1;
        if (aValue != null && bValue == null) return 1;
        if (aValue == null && bValue == null) return 0;

        // Compare numbers
        if (typeof aValue === "number" && typeof bValue === "number") {
          return aValue - bValue;
        }

        // Compare strings
        if (typeof aValue === "string" && typeof bValue === "string") {
          return aValue.localeCompare(bValue);
        }

        // Fallback
        return 0;
      };
    }, []);

    // Replace your existing filteredGridRows with sortedGridRows
    const sortedGridRows = useMemo(() => {
      if (sortColumns.length === 0) return filteredGridRows;

      return [...filteredGridRows].sort((a, b) => {
        for (const sort of sortColumns) {
          const comparator = getComparator(sort.columnKey);
          const compResult = comparator(a, b);
          if (compResult !== 0) {
            return sort.direction === "ASC" ? compResult : -compResult;
          }
        }
        return 0;
      });
    }, [filteredGridRows, sortColumns, getComparator]);

    // **Add the exportToCsv function**

    const exportToCsv = useCallback(() => {
      const csvRows = [];

      // Get headers
      const headers = gridColumnsWithFilters.map((col) => col.name);
      csvRows.push(headers.join(","));

      // Get data rows
      sortedGridRows.forEach((row) => {
        const csvRow = gridColumnsWithFilters.map((col) => {
          let cellValue = row[col.key];

          if (cellValue == null) {
            cellValue = "";
          } else if (typeof cellValue === "object") {
            cellValue = JSON.stringify(cellValue);
          } else {
            cellValue = String(cellValue);
          }

          // Escape double quotes
          cellValue = cellValue.replace(/"/g, '""');

          // If cellValue contains commas, wrap it in double quotes
          if (cellValue.includes(",") || cellValue.includes("\n")) {
            cellValue = `"${cellValue}"`;
          }

          return cellValue;
        });
        csvRows.push(csvRow.join(","));
      });

      const csvContent = csvRows.join("\n");

      // Create Blob and trigger download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${extract.name || "data"}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, [gridColumnsWithFilters, sortedGridRows, extract.name]);

    // **Expose the exportToCsv function via ref**

    useImperativeHandle(ref, () => ({
      exportToCsv,
    }));

    // Add this function near your other utility functions
    const getRowHeight = useCallback((row: ExtractGridRow) => {
      if (row.id === "placeholder") {
        return 40;
      }

      const documentTitleLength = row.documentTitle?.length || 0;
      const baseHeight = 44;
      const lineHeight = 20;
      const charsPerLine = 30;

      const estimatedLines = Math.ceil(documentTitleLength / charsPerLine);
      return Math.max(baseHeight, estimatedLines * lineHeight + 28); // Increased padding
    }, []);

    return (
      <>
        {loading && (
          <Dimmer active>
            <Loader>Loading...</Loader>
          </Dimmer>
        )}

        <SelectDocumentsModal
          open={openSelectDocumentsModal}
          onAddDocumentIds={(documentIds: string[]) =>
            onAddDocIds(extract.id, documentIds)
          }
          filterDocIds={rows.map((row) => row.id)}
          toggleModal={() =>
            setOpenSelectDocumentsModal(!openSelectDocumentsModal)
          }
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

          {!extract.started && selectedRows.size > 0 && (
            <div
              style={{
                padding: "8px",
                borderBottom: "1px solid #e0e0e0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Button
                negative
                size="small"
                onClick={handleRowsDelete}
                icon
                labelPosition="left"
                loading={isDeleting}
                disabled={isDeleting}
              >
                <Icon name="trash" />
                Delete Selected ({selectedRows.size})
              </Button>
            </div>
          )}

          <DataGrid
            style={{ minHeight: 300 }}
            columns={gridColumnsWithFilters}
            rows={sortedGridRows}
            rowKeyGetter={(row) => row.id}
            selectedRows={selectedRows}
            onSelectedRowsChange={setSelectedRows}
            isRowSelectionDisabled={(row) =>
              Boolean(extract.started) || row.id === "placeholder"
            }
            className="custom-data-grid"
            onRowsChange={onRowsChange}
            onCopy={handleCopy}
            onPaste={handlePaste}
            headerRowHeight={56}
            defaultColumnOptions={{ sortable: true }}
            sortColumns={sortColumns}
            onSortColumnsChange={setSortColumns}
            rowHeight={getRowHeight}
          />

          {!extract.started && (
            <Button
              icon="plus"
              circular
              onClick={() => setOpenSelectDocumentsModal(true)}
              style={{
                position: "absolute",
                bottom: "16px",
                left: "16px",
                zIndex: 1000,
              }}
            />
          )}

          {isDragActive && (
            <div style={styles.dropOverlay}>
              <div style={styles.dropMessage}>
                Drop PDF documents here to add to{" "}
                {extract.corpus ? "corpus and extract" : "extract"}
              </div>
            </div>
          )}
        </div>

        <CreateColumnModal
          open={isCreateColumnModalOpen}
          existing_column={editingColumn}
          onClose={() => {
            setIsCreateColumnModalOpen(false);
            setEditingColumn(null);
          }}
          onSubmit={handleColumnSubmit}
        />

        <style>{`
          @keyframes gradientMove {
            0% {
              background-position: 0% 50%;
            }
            50% {
              background-position: 100% 50%;
            }
            100% {
              background-position: 0% 50%;
            }
          }

          .custom-data-grid {
            border: none !important;
            height: 100% !important;
            background: white;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }

          .rdg {
            border: none !important;
            flex: 1;
            --rdg-selection-color: #eff6ff;
            --rdg-border-color: #e2e8f0;
          }

          .rdg-cell {
            border-right: 1px solid #e2e8f0 !important;
            border-bottom: 1px solid #e2e8f0 !important;
            padding: 12px 16px !important;
            color: #334155;
            font-size: 0.9rem;
            line-height: 1.5;
          }

          .rdg-header-row {
            background-color: #f8fafc !important;
            font-weight: 600 !important;
            border-bottom: 2px solid #e2e8f0 !important;
            color: #334155;
          }

          .rdg-cell-frozen {
            box-shadow: 2px 0 4px rgba(0,0,0,0.04) !important;
          }

          .rdg-cell-frozen-last {
            box-shadow: 2px 0 4px rgba(0,0,0,0.04) !important;
          }

          /* Only the essential header controls styling */
          .header-controls {
            display: flex !important;
            gap: 6px !important;
            margin-left: 12px !important;
            flex-shrink: 0 !important;
          }

          .rdg-header-row .rdg-cell > div {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            width: 100% !important;
            white-space: nowrap !important;
          }

          .header-controls {
            display: flex !important;
            gap: 6px !important;
            margin-left: 12px !important;
            flex-shrink: 0 !important;
          }

          .rdg-header-row .rdg-cell span {
            flex: 1 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            min-width: 0 !important;
          }

          /* Target the specific nested structure */
          .rdg-cell[role="columnheader"] > div {
            display: flex !important;
            flex-direction: column !important;
          }

          .rdg-cell[role="columnheader"] > div > div {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            width: 100% !important;
            white-space: nowrap !important;
            min-height: 32px !important;
          }

          .rdg-cell[role="columnheader"] span {
            flex: 1 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            min-width: 0 !important;
          }

          /* Ensure resize handle doesn't interfere with buttons and is visible */
          .rdg-cell-resizer {
            position: absolute !important;
            right: 0 !important;
            width: 8px !important;
            z-index: 1 !important;
            background-color: rgba(0, 0, 0, 0.1) !important;  /* subtle background */
          }

          .rdg-cell-resizer:hover {
            background-color: rgba(0, 0, 0, 0.2) !important;  /* darker on hover */
          }

          /* Make the resize cursor black */
          .rdg-cell-resizer.rdg-cell-resizer-hover {
            cursor: col-resize !important;
            color: black !important;
          }

          .header-controls {
            position: relative !important;
            z-index: 2 !important;
          }

          /* Make resize cursor black throughout header */
          .rdg-header-row .rdg-cell-resizable {
            cursor: col-resize !important;
            color: black !important;
          }

          /* Ensure resize handle doesn't interfere with buttons */
          .rdg-cell-resizer {
            position: absolute !important;
            right: 0 !important;
            width: 8px !important;
            z-index: 1 !important;
          }

          .header-controls {
            position: relative !important;
            z-index: 2 !important;
          }

          /* Center align checkboxes in both header and content cells */
          .rdg-row > .rdg-cell:first-child,
          .rdg-header-row > .rdg-cell:first-child {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }

          /* If needed, also ensure the checkbox container itself is centered */
          .rdg-checkbox-label {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: 100% !important;
          }
        `}</style>
      </>
    );
  }
);
