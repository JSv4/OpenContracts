import React from "react";
import { Button, Table } from "semantic-ui-react";
import { useMutation, useQuery } from "@apollo/client";
import { toast } from "react-toastify";

import { ColumnDetails } from "./ColumnDetails";
import { ColumnType, ExtractType, RowType } from "../graphql/types";
import { REQUEST_GET_EXTRACT } from "../graphql/queries";
import { REQUEST_START_EXTRACT } from "../graphql/mutations";

interface ExtractDataGridProps {
  extractId: string;
}

export const ExtractDataGrid: React.FC<ExtractDataGridProps> = ({
  extractId,
}) => {
  const { data, refetch } = useQuery<{ extract: ExtractType }>(
    REQUEST_GET_EXTRACT,
    {
      variables: { id: extractId },
    }
  );
  const [startExtract] = useMutation(REQUEST_START_EXTRACT);

  const handleStartExtract = async () => {
    try {
      await startExtract({ variables: { id: extractId } });
      refetch();
      toast.success("Extract started successfully");
    } catch (error) {
      toast.error("Error starting extract");
    }
  };

  if (!data?.extract) {
    return null;
  }

  const { extract } = data;
  const columns = extract.fieldset.columns;
  const rows = extract.rows;

  return (
    <div>
      <Table celled>
        <Table.Header>
          <Table.Row>
            {columns.map((column) => (
              <Table.HeaderCell key={column.id}>
                {column.query}
              </Table.HeaderCell>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row: RowType) => (
            <Table.Row key={row.id}>
              {columns.map((column: ColumnType) => (
                <Table.Cell key={column.id}>{row.data[column.id]}</Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      {!extract.started && (
        <>
          <h3>Edit Columns</h3>
          {columns.map((column) => (
            <ColumnDetails
              key={column.id}
              column={column}
              fieldsetId={extract.fieldset.id}
              onSave={refetch}
            />
          ))}
          <Button primary onClick={handleStartExtract}>
            Start Extract
          </Button>
        </>
      )}
    </div>
  );
};
