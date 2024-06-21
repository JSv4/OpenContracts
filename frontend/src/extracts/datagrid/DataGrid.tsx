import React, { useEffect, useState } from "react";
import {
  Table,
  Button,
  Icon,
  Dropdown,
  Segment,
  Dimmer,
  Loader,
} from "semantic-ui-react";
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
import { toast } from "react-toastify";

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
  const [lastCells, setLastCells] = useState(cells);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [showAddRowButton, setShowAddRowButton] = useState(false);
  const [openAddRowModal, setOpenAddRowModal] = useState(false);

  useEffect(() => {
    setLastCells(cells);
  }, [cells]);

  const [requestApprove, { loading: trying_approve }] = useMutation<
    RequestApproveDatacellOutputType,
    RequestApproveDatacellInputType
  >(REQUEST_APPROVE_DATACELL, {
    onCompleted: (data) => {
      toast.success("Approved!");
      setLastCells((prevCells) =>
        prevCells.map((cell) =>
          cell.id === data.approveDatacell.obj.id
            ? { ...cell, ...data.approveDatacell.obj }
            : cell
        )
      );
    },
    onError: () => toast.error("Could not register feedback!"),
  });

  const [requestReject, { loading: trying_reject }] = useMutation<
    RequestRejectDatacellOutputType,
    RequestRejectDatacellInputType
  >(REQUEST_REJECT_DATACELL, {
    onCompleted: (data) => {
      toast.success("Rejected!");
      setLastCells((prevCells) =>
        prevCells.map((cell) =>
          cell.id === data.rejectDatacell.obj.id
            ? { ...data.rejectDatacell.obj, ...cell }
            : cell
        )
      );
    },
    onError: () => toast.error("Could not register feedback!"),
  });

  const [requestEdit, { loading: trying_edit }] = useMutation<
    RequestEditDatacellOutputType,
    RequestEditDatacellInputType
  >(REQUEST_EDIT_DATACELL, {
    onCompleted: (data) => {
      toast.success("Edit Saved!");
      setLastCells((prevCells) =>
        prevCells.map((cell) =>
          cell.id === data.editDatacell.obj.id
            ? { ...data.editDatacell.obj, ...cell }
            : cell
        )
      );
    },
    onError: (error) => {
      toast.error("Could not register feedback!");
      // Roll back the state if the mutation fails
      setLastCells((prevCells) => [...prevCells]);
    },
  });

  return (
    <Segment
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
        width: "100%",
        position: "relative",
      }}
      onMouseMove={(e: {
        currentTarget: {
          getBoundingClientRect: () => { (): any; new (): any; right: any };
        };
        clientX: any;
      }) => {
        const rightEdge = e.currentTarget.getBoundingClientRect().right;
        const mouseX = e.clientX;
        setIsAddingColumn(mouseX >= rightEdge - 20);
      }}
      onMouseEnter={() => setShowAddRowButton(true)}
      onMouseLeave={() => setShowAddRowButton(false)}
    >
      {trying_approve ? (
        <Dimmer>
          <Loader>Approving...</Loader>
        </Dimmer>
      ) : (
        <></>
      )}
      {trying_edit ? (
        <Dimmer>
          <Loader>Editing...</Loader>
        </Dimmer>
      ) : (
        <></>
      )}
      {trying_reject ? (
        <Dimmer>
          <Loader>Rejecting...</Loader>
        </Dimmer>
      ) : (
        <></>
      )}

      <SelectDocumentsModal
        open={openAddRowModal}
        onAddDocumentIds={(documentIds: string[]) =>
          onAddDocIds(extract.id, documentIds)
        }
        filterDocIds={rows.map((row) => row.id)}
        toggleModal={() => setOpenAddRowModal(!openAddRowModal)}
      />
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <Table celled style={{ flex: "none" }}>
          <Table.Header fullWidth fixed>
            <Table.Row>
              <Table.HeaderCell>
                <h3>Document</h3>
              </Table.HeaderCell>
              {columns.map((column) => (
                <Table.HeaderCell key={column.id}>
                  {column.name}
                  {!extract.started ? (
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
                  ) : (
                    <></>
                  )}
                </Table.HeaderCell>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body style={{ overflow: "auto", maxHeight: "100%" }}>
            {rows.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={columns.length + 1} textAlign="center">
                  Please Click the "+" at the Bottom to Add Documents...
                </Table.Cell>
              </Table.Row>
            ) : (
              rows.map((row) => (
                <Table.Row key={`Row_${row.id}`}>
                  <Table.Cell>
                    {row.title}
                    {!extract.started ? (
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
                    ) : (
                      <></>
                    )}
                  </Table.Cell>
                  {columns.map((column) => {
                    const cell = lastCells.find(
                      (cell) =>
                        cell.document.id === row.id &&
                        cell.column.id === column.id
                    );
                    if (cell) {
                      return (
                        <ExtractDatacell
                          key={`Cell_ ${cell.id}`}
                          cellData={cell}
                          onApprove={() =>
                            requestApprove({
                              variables: { datacellId: cell.id },
                            })
                          }
                          onReject={() =>
                            requestReject({
                              variables: { datacellId: cell.id },
                            })
                          }
                          onEdit={(
                            id: string,
                            editedData: Record<string, any>
                          ) =>
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
        <div style={{ flex: 1 }} />
      </div>
      {!extract.started && isAddingColumn && (
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
      {!extract.started && showAddRowButton && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: "40px",
            background: "rgba(0, 0, 0, 0.1)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            marginTop: "8px",
          }}
        >
          <Button
            icon="plus"
            circular
            onClick={() => setOpenAddRowModal(true)}
          />
        </div>
      )}
    </Segment>
  );
};
