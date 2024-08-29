import React from "react";
import { Table, Segment, Icon, Popup } from "semantic-ui-react";
import { JSONTree } from "react-json-tree";
import { ColumnType, DocumentType, ExtractType } from "../graphql/types";

interface SingleDocumentExtractResultsProps {
  extract: ExtractType;
  document: DocumentType;
}

export const SingleDocumentExtractResults: React.FC<
  SingleDocumentExtractResultsProps
> = ({
  extract,
  document,
}: {
  extract: ExtractType;
  document: DocumentType;
}) => {
  const columns = extract.fieldset.fullColumnList || [];
  const cells =
    extract.fullDatacellList?.filter(
      (cell) => cell.document.id === document.id
    ) || [];

  const renderJsonPreview = (data: Record<string, any>) => {
    const jsonString = JSON.stringify(data, null, 2);
    const preview = jsonString.split("\n").slice(0, 3).join("\n") + "\n...";
    return (
      <Popup
        trigger={<span>{preview}</span>}
        content={<JSONTree data={data} hideRoot />}
        wide="very"
      />
    );
  };

  return (
    <Segment style={{ overflow: "auto", maxHeight: "100%" }}>
      <Table celled>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Column</Table.HeaderCell>
            <Table.HeaderCell>Data</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {columns.map((column: ColumnType) => {
            const cell = cells.find((c) => c.column.id === column.id);
            return (
              <Table.Row key={column.id}>
                <Table.Cell>{column.name}</Table.Cell>
                <Table.Cell>
                  {cell ? renderJsonPreview(cell.data) : "-"}
                </Table.Cell>
                <Table.Cell>
                  {cell ? (
                    <>
                      {cell.approvedBy && <Icon name="check" color="green" />}
                      {cell.rejectedBy && <Icon name="x" color="red" />}
                      {cell.correctedData && <Icon name="edit" color="blue" />}
                    </>
                  ) : (
                    "-"
                  )}
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table>
    </Segment>
  );
};
