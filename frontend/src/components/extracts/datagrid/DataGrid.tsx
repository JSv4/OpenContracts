import React, { useCallback, useMemo, useState, useRef } from "react";
import DataGrid from "react-data-grid";
import { useMutation } from "@apollo/client";
import { toast } from "react-toastify";
import { Button, Icon, Popup } from "semantic-ui-react";
import {
  REQUEST_APPROVE_DATACELL,
  REQUEST_EDIT_DATACELL,
  REQUEST_REJECT_DATACELL,
} from "../../../graphql/mutations";
import { ExtractCellFormatter } from "./ExtractCellFormatter";
import {
  ExtractGridColumn,
  ExtractGridRow,
  CellStatus,
  FormatterProps,
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

export const ExtractDataGrid: React.FC<DataGridProps> = ({
  extract,
  cells,
  rows,
  columns,
  onAddDocIds,
  onRemoveDocIds,
  onRemoveColumnId,
}) => {
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [cellStatuses, setCellStatuses] = useState<Record<string, CellStatus>>(
    {}
  );
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dragY: null,
  });
  const gridRef = useRef<HTMLDivElement>(null);

  // Convert data to grid format
  const gridRows = useMemo<ExtractGridRow[]>(
    () =>
      rows.map((row) => ({
        id: row.id,
        documentId: row.id,
        documentTitle: row.title || "",
        ...cells
          .filter((cell) => cell.document.id === row.id)
          .reduce(
            (acc, cell) => ({
              ...acc,
              [cell.column.id]: cell.correctedData || cell.data,
            }),
            {}
          ),
      })),
    [rows, cells]
  );

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

  // Mutations
  const [requestApprove] = useMutation(REQUEST_APPROVE_DATACELL, {
    onCompleted: (data) => {
      toast.success("Approved!");
      setCellStatuses((prev) => ({
        ...prev,
        [data.approveDatacell.obj.id]: {
          ...prev[data.approveDatacell.obj.id],
          isApproved: true,
          isRejected: false,
          approvedBy: data.approveDatacell.obj.approvedBy,
        },
      }));
    },
    onError: () => toast.error("Could not register feedback!"),
  });

  const getCellContent = useCallback(
    (row: ExtractGridRow, column: ExtractGridColumn) => {
      const cell = cells.find(
        (c) => c.document.id === row.documentId && c.column.id === column.key
      );

      if (!cell) return null;

      const status = cellStatuses[cell.id] || {
        isApproved: Boolean(cell.approvedBy),
        isRejected: Boolean(cell.rejectedBy),
        isEdited: Boolean(cell.correctedData),
        originalData: cell.data,
        correctedData: cell.correctedData,
      };

      return {
        value: row[column.key],
        cellStatus: status,
        onApprove: () => requestApprove({ variables: { datacellId: cell.id } }),
        // ... other handlers
      };
    },
    [cells, cellStatuses, requestApprove]
  );

  const gridColumns = useMemo<ExtractGridColumn[]>(
    () => [
      {
        key: "documentTitle",
        name: "Document",
        frozen: true,
        width: 200,
        headerRenderer: (props: { column: { name: string } }) => (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0 8px",
            }}
          >
            <span>{props.column.name}</span>
            <div style={{ display: "flex", gap: "8px" }}>
              {selectedRows.size > 0 && (
                <Button
                  icon="trash"
                  color="red"
                  size="mini"
                  onClick={() => {
                    onRemoveDocIds(extract.id, Array.from(selectedRows));
                    setSelectedRows(new Set());
                  }}
                />
              )}
              <Button
                icon="plus"
                color="green"
                size="mini"
                onClick={() => {
                  const newDocIds = ["example-id"]; // Replace with actual document selection
                  onAddDocIds(extract.id, newDocIds);
                }}
              />
            </div>
          </div>
        ),
      },
      ...columns.map((col) => ({
        key: col.id,
        name: col.name,
        formatter: (
          props: JSX.IntrinsicAttributes &
            FormatterProps & { children?: React.ReactNode | undefined }
        ) => {
          const content = getCellContent(props.row, props.column);
          if (!content) return null;
          return <ExtractCellFormatter {...props} {...content} />;
        },
        editable: !extract.started,
        sortable: true,
        width: 250,
        headerRenderer: (props: { column: ExtractGridColumn }) => (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0 8px",
            }}
          >
            <span>{props.column.name}</span>
            <ColumnActions column={props.column} />
          </div>
        ),
      })),
    ],
    [
      columns,
      extract.started,
      extract.id,
      selectedRows,
      onRemoveDocIds,
      onAddDocIds,
      onRemoveColumnId,
      getCellContent,
    ]
  );

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

  return (
    <>
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
        />

        <div
          style={styles.phantomColumn}
          onClick={() => setIsAddingColumn(true)}
          title="Add new column"
        >
          <Icon
            name="plus"
            size="large"
            style={{ color: "#ccc" }}
            className="phantom-column-icon"
          />
        </div>

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
