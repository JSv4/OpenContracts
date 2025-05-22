import React, {
  forwardRef,
  useCallback,
  useMemo,
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
} from "react";
import {
  DataGrid,
  RowsChangeData,
  CellCopyEvent,
  CellPasteEvent,
  SelectColumn,
  SortColumn,
  CalculatedColumn,
} from "react-data-grid";
import { useMutation } from "@apollo/client";
import { toast } from "react-toastify";
import {
  Button,
  Icon,
  Popup,
  Dimmer,
  Loader,
  Modal,
  Message,
} from "semantic-ui-react";
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
  REQUEST_CREATE_COLUMN,
  RequestCreateColumnInputType,
  RequestCreateColumnOutputType,
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
import { parseOutputType } from "../../../utils/parseOutputType";
import { JSONSchema7 } from "json-schema";
import { TruncatedText } from "../../widgets/data-display/TruncatedText";
import { CreateColumnModal } from "../../widgets/modals/CreateColumnModal";
import { SelectDocumentsModal } from "../../widgets/modals/SelectDocumentsModal";
import { REQUEST_GET_EXTRACT } from "../../../graphql/queries";

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
    position: "relative",
    backgroundColor: "#fff",
    borderRadius: "16px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
    display: "flex",
    flexDirection: "column",
    border: "1px solid rgba(0,0,0,0.08)",
    overflow: "hidden",
    minHeight: 0,
  } as React.CSSProperties,
  headerCell: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    backgroundColor: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
    fontWeight: 500,
    fontSize: "0.9rem",
    color: "#334155",
    height: "100%",
  },
  headerControls: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    marginLeft: "8px",
    position: "relative",
    zIndex: 3,
  },
  headerButton: {
    padding: "4px",
    background: "none",
    border: "none",
    color: "#94a3b8",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "color 0.2s ease",
    "&:hover": {
      color: "#64748b",
    },
  },
  phantomColumn: {
    position: "absolute" as const,
    right: 0,
    top: 0,
    bottom: 0,
    width: "48px",
    cursor: "pointer",
    background:
      "linear-gradient(to right, rgba(248,250,252,0), rgba(248,250,252,0.8))",
    transition: "all 0.2s ease",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    "&:hover": {
      background:
        "linear-gradient(to right, rgba(248,250,252,0), rgba(248,250,252,1))",
    },
  },
  addColumnButton: {
    width: "28px",
    height: "28px",
    padding: 0,
    borderRadius: "8px",
    border: "1.5px dashed #cbd5e1",
    background: "transparent",
    color: "#94a3b8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "all 0.2s ease",
    "&:hover": {
      borderColor: "#10b981",
      color: "#10b981",
      transform: "translateY(-1px)",
      background: "rgba(16, 185, 129, 0.05)",
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
    borderRadius: "16px",
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

// Add new interface for the delete modal state
interface DeleteColumnModalState {
  isOpen: boolean;
  columnToDelete: ColumnType | null;
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
    // console.log("ExtractDataGrid received columns:", columns);
    // console.log("ExtractDataGrid received extract:", extract);
    // console.log("ExtractDataGrid received rows:", rows);
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const [sortColumns, setSortColumns] = useState<readonly SortColumn[]>([]);

    // Add state and handlers for editing columns
    const [isCreateColumnModalOpen, setIsCreateColumnModalOpen] =
      useState(false);
    const [editingColumn, setEditingColumn] = useState<ColumnType | null>(null);

    useEffect(() => {
      console.log("Editing column:", columns);
    }, [columns]);

    const [dragState, setDragState] = useState<DragState>({
      isDragging: false,
      dragY: null,
    });
    const gridRef = useRef<HTMLDivElement>(null);

    // Local state for cells
    const [localCells, setLocalCells] = useState<DatacellType[]>(initialCells);

    // Add an effect to update localCells when initialCells changes
    useEffect(() => {
      // console.log("Initial cells received:", initialCells);
      setLocalCells(initialCells);
    }, [initialCells]);

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

      // console.log("Creating gridRows with:", {
      //   rows,
      //   cells: initialCells,
      //   columns,
      //   extract,
      //});
      return rows.map((row) => {
        const rowData: ExtractGridRow = {
          id: row.id,
          documentId: row.id,
          documentTitle: row.title || "",
        };

        // console.log("Processing row:", row.id);

        columns.forEach((column) => {
          // console.log("Processing column for row:", {
          //   rowId: row.id,
          //   columnId: column.id,
          // });
          const cell = initialCells.find(
            (c) => c.document.id === row.id && c.column.id === column.id
          );
          // console.log("Found cell:", cell);

          if (cell) {
            // console.log("Cell data:", cell.data?.data);
            rowData[column.id] = cell.data?.data || ""; // Ensure empty string instead of empty object
          } else {
            rowData[column.id] = ""; // Ensure empty string instead of empty object
          }
        });

        // console.log("Final rowData:", rowData);
        return rowData;
      });
    }, [rows, initialCells, columns, extract]);

    // TODO - re-enable(?) Column Actions Component
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
          // console.log("Updated cell:", updatedCell);
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
          // console.log("Updated cell:", updatedCell);
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

      // console.log("Updating cell statuses:", newStatuses);
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

    const handleEditColumn = (column: ColumnType) => {
      setEditingColumn(column);
      setIsCreateColumnModalOpen(true);
    };

    const handleAddColumn = () => {
      setIsCreateColumnModalOpen(true);
      setEditingColumn(null);
    };

    const handleColumnSubmit = async (data: any) => {
      if (editingColumn) {
        // Handle edit case
        await updateColumnMutation({ variables: { ...data } });
      } else {
        // Handle create case
        await createColumn({
          variables: {
            fieldsetId: extract.fieldset?.id,
            ...data,
          },
        });
      }
      setIsCreateColumnModalOpen(false);
      setEditingColumn(null);
    };

    // Add createColumn mutation
    const [createColumn] = useMutation<
      RequestCreateColumnOutputType,
      RequestCreateColumnInputType
    >(REQUEST_CREATE_COLUMN, {
      refetchQueries: [
        {
          query: REQUEST_GET_EXTRACT,
          variables: { id: extract ? extract.id : "" },
        },
      ],
      onCompleted: (data) => {
        if (data.createColumn.ok) {
          toast.success("Column created successfully!");
          // Update your state or refetch queries as needed
        } else {
          toast.error(`Failed to create column: ${data.createColumn.message}`);
        }
      },
      onError: (error) => {
        console.error("Create column error:", error);
        toast.error("An error occurred while creating the column.");
      },
    });

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

    // Add state for delete modal
    const [deleteModalState, setDeleteModalState] =
      useState<DeleteColumnModalState>({
        isOpen: false,
        columnToDelete: null,
      });

    // Update the column deletion handler
    const handleDeleteColumn = (column: ColumnType) => {
      setDeleteModalState({
        isOpen: true,
        columnToDelete: column,
      });
    };

    // Simplify to a regular async function
    const confirmDeleteColumn = async () => {
      if (!deleteModalState.columnToDelete) return;
      onRemoveColumnId(deleteModalState.columnToDelete.id);
      setDeleteModalState({
        isOpen: false,
        columnToDelete: null,
      });
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
          headerCellClass: "rdg-header-cell-frozen",
          cellClass: "rdg-cell-frozen",
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
                {!extract.started && (
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
                      onClick={() => handleDeleteColumn(col)}
                      disabled={Boolean(extract.started)}
                    />
                  </div>
                )}
              </div>
            ),
            renderCell: (props: any) => {
              if (props.row.id === "placeholder") {
                return <div>Bro</div>;
              }
              const content = getCellContent(props.row, gridColumn);
              const cellStatus = cellStatusMap.get(`${props.row.id}-${col.id}`);

              // Find the corresponding cell
              const cell = localCells.find(
                (c) =>
                  c.document?.id === props.row.id && c.column?.id === col.id
              );

              return (
                <ExtractCellFormatter
                  value={content.value}
                  cellStatus={cellStatus || null}
                  onApprove={() => handleApproveCell(content.cellId)}
                  onReject={() => handleRejectCell(content.cellId)}
                  onEdit={handleEditDatacell}
                  cellId={content.cellId}
                  readOnly={Boolean(!isExtractComplete || loading)}
                  isExtractComplete={Boolean(isExtractComplete)}
                  schema={columnSchemas.get(col.id) || {}}
                  extractIsList={Boolean(col.extractIsList)}
                  row={props.row}
                  column={gridColumn}
                  cell={cell}
                  extract={extract}
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
          width: 48,
          minWidth: 48,
          maxWidth: 48,
          resizable: false,
          renderHeaderCell: () => (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                width: "100%",
              }}
            >
              <button
                onClick={handleAddColumn}
                style={styles.addColumnButton}
                title="Add new column"
                disabled={loading}
              >
                <Icon name="plus" style={{ margin: 0, fontSize: "12px" }} />
              </button>
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
      handleDeleteColumn,
      onRemoveColumnId,
      onAddColumn,
      cellStatusMap,
      handleApproveCell,
      handleRejectCell,
      handleEditDatacell,
      isExtractComplete,
      loading,
      getCellContent,
      columnSchemas,
    ]);

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

    // Copy / paste helpers
    /**
     * React-Data-Grid compatible "copied cell" handle.
     * When non-null it stores the source cell that was copied so that a
     * subsequent paste can grab its value (CTRL-C → CTRL-V behaviour).
     */
    const [copiedCell, setCopiedCell] = useState<{
      readonly row: ExtractGridRow;
      readonly column: CalculatedColumn<ExtractGridRow>;
    } | null>(null);

    /**
     * Convert a raw clipboard/string value into the best-guess type for the
     * destination column (number, boolean, list, object, …).
     */
    const parsePastedValue = useCallback(
      (raw: unknown, targetColumnKey: string): unknown => {
        const col = columns.find((c) => c.id === targetColumnKey);
        if (!col) return raw;

        try {
          const schema = parseOutputType(col.outputType);

          switch (schema.type) {
            case "number":
              return Number(raw);
            case "boolean":
              if (typeof raw === "string") {
                return raw.toLowerCase() === "true";
              }
              return Boolean(raw);
            case "object":
              return typeof raw === "string" ? JSON.parse(raw) : raw;
            default:
              // Lists are stored as JSON strings
              if (col.extractIsList && typeof raw === "string") {
                return JSON.parse(raw);
              }
              return String(raw);
          }
        } catch {
          // Fallback – just return what we were given
          return raw;
        }
      },
      [columns]
    );

    /**
     * Handle CTRL-C / ⌘-C on a cell.
     */
    const handleCellCopy = useCallback(
      (
        { row, column }: CellCopyEvent<ExtractGridRow>,
        event: React.ClipboardEvent<HTMLDivElement>
      ): void => {
        // If the user is selecting text inside the cell we do not treat it as a
        // grid copy operation.
        if (window.getSelection()?.isCollapsed === false) {
          setCopiedCell(null);
          return;
        }

        setCopiedCell({ row, column });

        const value = row[column.key as keyof ExtractGridRow];
        const text =
          typeof value === "object"
            ? JSON.stringify(value)
            : String(value ?? "");

        event.clipboardData.setData("text/plain", text);
        event.preventDefault();
      },
      []
    );

    /**
     * Handle CTRL-V / ⌘-V on a cell.
     */
    const handleCellPaste = useCallback(
      (
        { row, column }: CellPasteEvent<ExtractGridRow>,
        event: React.ClipboardEvent<HTMLDivElement>
      ): ExtractGridRow => {
        const targetColumnKey = column.key;

        /* ───── 1️⃣ Copy-from-grid → grid  ───── */
        if (copiedCell !== null) {
          const sourceValue =
            copiedCell.row[copiedCell.column.key as keyof ExtractGridRow];

          return {
            ...row,
            [targetColumnKey]: parsePastedValue(sourceValue, targetColumnKey),
          };
        }

        /* ───── 2️⃣ Copy-from-clipboard → grid ───── */
        const clipboardText = event.clipboardData.getData("text/plain");
        if (clipboardText !== "") {
          return {
            ...row,
            [targetColumnKey]: parsePastedValue(clipboardText, targetColumnKey),
          };
        }

        /* Nothing to paste */
        return row;
      },
      [copiedCell, parsePastedValue]
    );

    const [updateColumnMutation] = useMutation<
      RequestUpdateColumnOutputType,
      RequestUpdateColumnInputType
    >(REQUEST_UPDATE_COLUMN, {
      refetchQueries: [
        {
          query: REQUEST_GET_EXTRACT,
          variables: { id: extract ? extract.id : "" },
        },
      ],
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

    const [openSelectDocumentsModal, setOpenSelectDocumentsModal] =
      useState<boolean>(false);

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

    // TODO - re-enable Clear filters
    const clearFilters = useCallback(() => {
      setFilters({});
    }, []);

    // TODO - re-enable Toggle filters
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
          style={{ ...styles.gridWrapper, position: "relative" }}
        >
          {loading && (
            <Dimmer
              active
              inverted
              style={{ position: "absolute", margin: 0, borderRadius: "12px" }}
            >
              <Loader>
                {extract.started && !extract.finished
                  ? "Processing..."
                  : "Loading..."}
              </Loader>
            </Dimmer>
          )}
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
            onSelectedRowsChange={!loading ? setSelectedRows : undefined}
            isRowSelectionDisabled={(row) =>
              Boolean(extract.started) || row.id === "placeholder"
            }
            className="custom-data-grid"
            onRowsChange={!loading ? onRowsChange : undefined}
            onCellCopy={!loading ? handleCellCopy : undefined}
            onCellPaste={!loading ? handleCellPaste : undefined}
            headerRowHeight={56}
            defaultColumnOptions={{ sortable: true }}
            sortColumns={sortColumns}
            onSortColumnsChange={!loading ? setSortColumns : undefined}
            rowHeight={getRowHeight}
          />

          {!extract.started && (
            <Button
              icon="file outline"
              circular
              onClick={() => setOpenSelectDocumentsModal(true)}
              style={{
                position: "absolute",
                bottom: "16px",
                left: "16px",
                zIndex: 1000,
              }}
              disabled={loading}
            >
              <Icon name="plus" corner="top right" />
            </Button>
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
          open={isCreateColumnModalOpen || editingColumn !== null}
          existing_column={editingColumn}
          onClose={() => {
            setIsCreateColumnModalOpen(false);
            setEditingColumn(null);
          }}
          onSubmit={handleColumnSubmit}
        />

        {/* Add Delete Confirmation Modal */}
        <Modal
          size="tiny"
          open={deleteModalState.isOpen}
          onClose={() =>
            setDeleteModalState({ isOpen: false, columnToDelete: null })
          }
          style={{ borderRadius: "12px", padding: "1.5rem" }}
        >
          <Modal.Header
            style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: "1rem" }}
          >
            Confirm Delete
          </Modal.Header>
          <Modal.Content>
            <p style={{ color: "#475569" }}>
              Are you sure you want to delete the column "
              {deleteModalState.columnToDelete?.name}"?
            </p>
            {extract.fieldset?.inUse && (
              <Message warning>
                <Message.Header>Note:</Message.Header>
                <p>
                  This fieldset is used in multiple places. Deleting this column
                  will create a new copy of the fieldset for this extract only.
                </p>
              </Message>
            )}
          </Modal.Content>
          <Modal.Actions
            style={{ borderTop: "1px solid #f1f5f9", paddingTop: "1rem" }}
          >
            <Button
              basic
              onClick={() =>
                setDeleteModalState({ isOpen: false, columnToDelete: null })
              }
              style={{
                borderRadius: "6px",
                boxShadow: "none",
                border: "1px solid #e2e8f0",
              }}
            >
              Cancel
            </Button>
            <Button
              negative
              onClick={confirmDeleteColumn}
              style={{
                borderRadius: "6px",
                backgroundColor: "#ef4444",
                marginLeft: "0.75rem",
              }}
            >
              Delete
            </Button>
          </Modal.Actions>
        </Modal>

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
            overflow-y: scroll;
            flex: 1 1 auto !important;
            min-height: 0 !important;
            height: 100% !important;
            --rdg-header-row-height: 56px;
          }

          .rdg-header-row {
            position: sticky !important;
            top: 0 !important;
            z-index: 3 !important;
            background-color: #f8fafc !important;
          }

          .rdg-cell-frozen {
            position: sticky !important;
            left: 0 !important;
            z-index: 2 !important;
          }

          .rdg-cell-frozen.rdg-cell-frozen-last {
            box-shadow: 2px 0 4px rgba(0,0,0,0.1) !important;
          }

          .rdg-cell {
            border-right: 1px solid #e2e8f0 !important;
            border-bottom: 1px solid #e2e8f0 !important;
            padding: 12px 16px !important;
            color: #334155;
            font-size: 0.9rem;
            line-height: 1.5;
          }

          .rdg-row:hover .rdg-cell {
            background-color: #f8fafc;
          }

          .rdg-row.rdg-row-selected .rdg-cell {
            background-color: #eff6ff !important;
          }

          .rdg-header-row {
            background-color: #f8fafc !important;
            font-weight: 500 !important;
            border-bottom: 1px solid #e2e8f0 !important;
            color: #334155;
          }

          .rdg-header-row .rdg-cell {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 12px 16px !important;
            height: 48px !important;
          }

          .rdg-header-row .rdg-cell > div {
            display: flex !important;
            align-items: center !important;
            width: 100% !important;
          }

          .rdg-header-row .rdg-cell span {
            flex: 1 !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            white-space: nowrap !important;
          }

          .header-controls {
            display: flex !important;
            align-items: center !important;
            gap: 4px !important;
            margin-left: 8px !important;
            opacity: 0.6;
            transition: opacity 0.2s ease;
            position: relative !important;
            z-index: 3 !important;
          }

          .rdg-header-row .rdg-cell:hover .header-controls {
            opacity: 1;
          }

          .header-controls .ui.button {
            position: relative !important;
            z-index: 3 !important;
            padding: 4px !important;
            min-width: 24px !important;
            height: 24px !important;
            background: none !important;
            border: none !important;
            box-shadow: none !important;
            color: #64748b !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }

          .header-controls .ui.button:hover {
            color: #334155 !important;
            background: none !important;
            transform: none !important;
          }

          .header-controls .ui.button.red {
            color: #ef4444 !important;
          }

          .header-controls .ui.button.red:hover {
            color: #dc2626 !important;
          }

          .header-controls .ui.button i.icon {
            margin: 0 !important;
            font-size: 14px !important;
            height: auto !important;
            width: auto !important;
          }

          .rdg-checkbox {
            width: 18px !important;
            height: 18px !important;
            border: 2px solid #cbd5e1 !important;
            border-radius: 4px !important;
            transition: all 0.2s ease !important;
          }

          .rdg-checkbox:checked {
            background-color: #3b82f6 !important;
            border-color: #3b82f6 !important;
          }

          .rdg-checkbox:hover:not(:checked) {
            border-color: #94a3b8 !important;
          }

          .rdg-cell-resizer {
            width: 4px !important;
            background-color: #e2e8f0 !important;
            opacity: 0;
            transition: opacity 0.2s ease;
            z-index: 1 !important;
          }

          .rdg-cell:hover .rdg-cell-resizer {
            opacity: 1;
          }

          .rdg-cell-resizer:hover,
          .rdg-cell-resizer.rdg-cell-resizer-hover {
            background-color: #3b82f6 !important;
            opacity: 1;
          }

          .filter-cell input {
            width: 100% !important;
            padding: 8px 12px !important;
            border: 1px solid #e2e8f0 !important;
            border-radius: 8px !important;
            font-size: 0.9rem !important;
            transition: all 0.2s ease !important;
          }

          .filter-cell input:focus {
            border-color: #3b82f6 !important;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1) !important;
            outline: none !important;
          }

          .ui.button {
            border-radius: 8px !important;
            font-weight: 500 !important;
            transition: all 0.2s ease !important;
          }

          .ui.button:hover {
            transform: translateY(-1px) !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05) !important;
          }

          .ui.button.circular {
            width: 40px !important;
            height: 40px !important;
            padding: 0 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05) !important;
          }

          .ui.button.circular:hover {
            transform: translateY(-2px) !important;
            box-shadow: 0 8px 16px rgba(0,0,0,0.08) !important;
          }

          .ui.loader {
            color: #3b82f6 !important;
          }

          .ui.dimmer {
            background-color: rgba(255, 255, 255, 0.8) !important;
            backdrop-filter: blur(1px) !important;
          }

          .rdg-header-row .rdg-cell:last-child {
            background: linear-gradient(to right, rgba(248,250,252,0), rgba(248,250,252,0.8)) !important;
            transition: background 0.2s ease;
          }

          .rdg-header-row .rdg-cell:last-child:hover {
            background: linear-gradient(to right, rgba(248,250,252,0), rgba(248,250,252,1)) !important;
          }

          .rdg-row {
            border-top: none !important;
          }

          .rdg-cell {
            border-right: 1px solid #e2e8f0 !important;
            border-bottom: 1px solid #e2e8f0 !important;
            padding: 12px 16px !important;
            color: #334155;
            font-size: 0.9rem;
            line-height: 1.5;
          }

          .rdg-header-row .rdg-cell {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 12px 16px !important;
            height: 48px !important;
            border-bottom: 1px solid #e2e8f0 !important;
          }

          .rdg-header-cell-frozen {
            position: sticky !important;
            left: 0 !important;
            z-index: 4 !important; // Higher z-index to stay above other cells
            background-color: #f8fafc !important;
          }

          .rdg-header-row .rdg-cell.rdg-header-cell-frozen {
            box-shadow: 2px 0 4px rgba(0,0,0,0.1) !important;
            background-color: #f8fafc !important; // Ensure header background is consistent
          }

          .rdg-header-row {
            z-index: 3 !important;
          }
        `}</style>
      </>
    );
  }
);
