import React, { useState } from "react";
import {
  Table,
  Input,
  Button,
  Icon,
  Popup,
  Modal,
  List,
  Dropdown,
} from "semantic-ui-react";
import { ColumnType, DatacellType, DocumentType } from "../../graphql/types";
import { useMutation } from "@apollo/client";
import {
  REQUEST_DELETE_COLUMN,
  REQUEST_UPDATE_COLUMN,
  RequestDeleteColumnInputType,
  RequestDeleteColumnOutputType,
  RequestUpdateColumnInputType,
  RequestUpdateColumnOutputType,
} from "../../graphql/mutations";
import { toast } from "react-toastify";

interface DataGridProps {
  columns: ColumnType[];
  rows: DocumentType[];
  cells: DatacellType[];
}

export const DataGrid = ({ columns, rows, cells }: DataGridProps) => {
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [showAddRowButton, setShowAddRowButton] = useState(false);
  const [];

  const [
    deleteColumn,
    {
      loading: delete_column_loading,
      error: delete_column_error,
      data: delete_column_data,
    },
  ] = useMutation<RequestDeleteColumnOutputType, RequestDeleteColumnInputType>(
    REQUEST_DELETE_COLUMN,
    {
      onCompleted: (data) => {
        toast.success("SUCCESS! Removed column from Extract.");
      },
      onError: (err) => {
        toast.error("ERROR! Could not remove column.");
      },
    }
  );

  const [
    updateColumn,
    {
      loading: update_column_loading,
      error: update_column_error,
      data: update_column_data,
    },
  ] = useMutation<RequestUpdateColumnOutputType, RequestUpdateColumnInputType>(
    REQUEST_UPDATE_COLUMN,
    {
      onCompleted: (data) => {
        toast.success("SUCCESS! Updated column.");
      },
      onError: (err) => {
        toast.error("ERROR! Could not update column.");
      },
    }
  );

  return (
    <div
      style={{
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
      <Table celled>
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
                  pointing="top right"
                  style={{ float: "right" }}
                >
                  <Dropdown.Menu>
                    <Dropdown.Item
                      text="Edit"
                      onClick={() => editColumn(column)}
                    />
                    <Dropdown.Item
                      text="Delete"
                      onClick={() =>
                        deleteColumn({ variables: { id: column.id } })
                      }
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
                    pointing="top right"
                    style={{ float: "right" }}
                  >
                    <Dropdown.Menu>
                      <Dropdown.Item text="Edit" onClick={() => editRow(row)} />
                      <Dropdown.Item
                        text="Delete"
                        onClick={() => removeRow(row.id)}
                      />
                    </Dropdown.Menu>
                  </Dropdown>
                </Table.Cell>
                {cells
                  .filter((cell) => cell.document.id == row.id)
                  .map((cell) => (
                    <Table.Cell key={cell.id}>{cell.data}</Table.Cell>
                  ))}
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
          }}
          onClick={addColumn}
        >
          <Icon name="plus" size="large" />
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
          <Button icon="plus" circular onClick={openAddRowModal} />
        </div>
      )}
    </div>
  );
};
