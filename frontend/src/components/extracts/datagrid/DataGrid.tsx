import React, { useCallback, useMemo, useState } from "react";
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

interface DataGridProps {
  extract: ExtractType;
  cells: DatacellType[];
  rows: DocumentType[];
  columns: ColumnType[];
  onAddDocIds: (extractId: string, documentIds: string[]) => void;
  onRemoveDocIds: (extractId: string, documentIds: string[]) => void;
  onRemoveColumnId: (columnId: string) => void;
}

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

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <DataGrid
        columns={gridColumns}
        rows={gridRows}
        rowKeyGetter={(row) => row.id}
        selectedRows={selectedRows}
        onSelectedRowsChange={setSelectedRows}
        onRowsChange={() => {}} // Handle edits here
      />
    </div>
  );
};
