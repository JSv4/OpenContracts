import React, { useState } from "react";
import { Table, Button, Icon, Dropdown } from "semantic-ui-react";
import {
  ColumnType,
  DatacellType,
  DocumentType,
  ExtractType,
} from "../../graphql/types";
import { SelectDocumentsModal } from "../../components/widgets/modals/SelectDocumentsModal";
import {
  addingColumnToExtract,
  editingColumnForExtract,
} from "../../graphql/cache";
import { EmptyDatacell } from "./EmptyDataCell";
import { ExtractDatacell } from "./DataCell";
import { useMutation } from "@apollo/client";
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
} from "../../graphql/mutations";

interface DataGridProps {
  extract: ExtractType;
  cells: DatacellType[];
  rows: DocumentType[];
  onAddDocIds: (extractId: string, documentIds: string[]) => void;
  onRemoveDocIds: (extractId: string, documentIds: string[]) => void;
  onRemoveColumnId: (columnId: string) => void;
  columns: ColumnType[];
}

export const DataGrid = ({
  extract,
  cells,
  rows,
  columns,
  onAddDocIds,
  onRemoveDocIds,
  onRemoveColumnId,
}: DataGridProps) => {
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [showAddRowButton, setShowAddRowButton] = useState(false);
  const [openAddRowModal, setOpenAddRowModal] = useState(false);

  const [requestApprove] = useMutation<
    RequestApproveDatacellOutputType,
    RequestApproveDatacellInputType
  >(REQUEST_APPROVE_DATACELL);
  const [requestReject] = useMutation<
    RequestRejectDatacellOutputType,
    RequestRejectDatacellInputType
  >(REQUEST_REJECT_DATACELL);
  const [requestEdit] = useMutation<
    RequestEditDatacellOutputType,
    RequestEditDatacellInputType
  >(REQUEST_EDIT_DATACELL);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
        height: "100%",
        width: "100%",
        position: "relative",
      }}
      onMouseMove={(e) => {
        const rightEdge = e.currentTarget.getBoundingClientRect().right;
        const mouseX = e.clientX;
        setIsAddingColumn(mouseX >= rightEdge - 20);
      }}
      onMouseEnter={() => setShowAddRowButton(true)}
      onMouseLeave={() => setShowAddRowButton(false)}
    >
      <SelectDocumentsModal
        open={openAddRowModal}
        onAddDocumentIds={(documentIds: string[]) =>
          onAddDocIds(extract.id, documentIds)
        }
        filterDocIds={rows.map((row) => row.id)}
        toggleModal={() => setOpenAddRowModal(!openAddRowModal)}
      />
      <Table celled style={{ flex: 1 }}>
        <Table.Header fullWidth>
          <Table.Row>
            <Table.HeaderCell>
              <h3>Document</h3>
            </Table.HeaderCell>
            {columns.map((column) => (
              <Table.HeaderCell key={column.id}>
                {column.name}
                <Dropdown
                  icon={null}
                  trigger={<Icon name="cog" style={{ float: "right" }} />}
                  pointing="right"
                  style={{ float: "right" }}
                >
                  <Dropdown.Menu>
                    <Dropdown.Item
                      text="Edit"
                      onClick={() => editingColumnForExtract(column)}
                    />
                    <Dropdown.Item
                      text="Delete"
                      onClick={() => onRemoveColumnId(column.id)}
                    />
                  </Dropdown.Menu>
                </Dropdown>
              </Table.HeaderCell>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.length === 0 ? (
            <Table.Row>
              <Table.Cell colSpan={columns.length + 1} textAlign="center">
                Please Click the "+" at the Bottom to Add Documents...
              </Table.Cell>
            </Table.Row>
          ) : (
            rows.map((row) => (
              <Table.Row key={row.id}>
                <Table.Cell>
                  {row.title}
                  <Dropdown
                    icon={null}
                    trigger={<Icon name="cog" style={{ float: "right" }} />}
                    pointing="bottom right"
                    style={{ float: "right" }}
                  >
                    <Dropdown.Menu>
                      <Dropdown.Item
                        text="Delete"
                        icon="trash"
                        onClick={() => onRemoveDocIds(extract.id, [row.id])}
                      />
                    </Dropdown.Menu>
                  </Dropdown>
                </Table.Cell>
                {columns.map((column) => {
                  const cell = cells.find(
                    (cell) =>
                      cell.document.id === row.id &&
                      cell.column.id === column.id
                  );
                  if (cell) {
                    return (
                      <ExtractDatacell
                        cellData={cell.data}
                        onApprove={() =>
                          requestApprove({ variables: { datacellId: cell.id } })
                        }
                        onReject={() =>
                          requestReject({ variables: { datacellId: cell.id } })
                        }
                        onEdit={(id: string, editedData: Record<string, any>) =>
                          requestEdit({
                            variables: { datacellId: cell.id, editedData },
                          })
                        }
                      />
                    );
                  }
                  return <EmptyDatacell id={`CELL_${row.id}.${column.id}`} />;
                })}
              </Table.Row>
            ))
          )}
        </Table.Body>
      </Table>
      {isAddingColumn && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: "40px",
            background: "rgba(0, 0, 0, 0.1)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            cursor: "pointer",
            zIndex: 100000,
          }}
        >
          <Button
            icon="plus"
            circular
            onClick={() => addingColumnToExtract(extract)}
          />
        </div>
      )}
      {showAddRowButton && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: rows.length === 0 ? "40px" : 0,
            height: "40px",
            background: "rgba(0, 0, 0, 0.1)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Button
            icon="plus"
            circular
            onClick={() => setOpenAddRowModal(true)}
          />
        </div>
      )}
    </div>
  );
};