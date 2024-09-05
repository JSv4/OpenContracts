import React, { useState, useEffect } from "react";
import {
  Table,
  Segment,
  Icon,
  Popup,
  Button,
  Dimmer,
  Loader,
} from "semantic-ui-react";
import { JSONTree } from "react-json-tree";
import {
  ColumnType,
  DatacellType,
  ServerAnnotationType,
} from "../../graphql/types";
import { useReactiveVar, useMutation } from "@apollo/client";
import {
  onlyDisplayTheseAnnotations,
  showSelectedAnnotationOnly,
  showAnnotationBoundingBoxes,
  showAnnotationLabels,
} from "../../graphql/cache";
import { LabelDisplayBehavior } from "../../graphql/types";
import { toast } from "react-toastify";
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

interface SingleDocumentExtractResultsProps {
  datacells: DatacellType[];
  columns: ColumnType[];
}

export const SingleDocumentExtractResults: React.FC<
  SingleDocumentExtractResultsProps
> = ({ datacells, columns }) => {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [viewSourceAnnotations, setViewSourceAnnotations] = useState<
    ServerAnnotationType[] | null
  >(null);
  const [lastCells, setLastCells] = useState(datacells);
  const only_display_these_annotations = useReactiveVar(
    onlyDisplayTheseAnnotations
  );

  useEffect(() => {
    setLastCells(datacells);
  }, [datacells]);

  useEffect(() => {
    if (viewSourceAnnotations !== null) {
      onlyDisplayTheseAnnotations(viewSourceAnnotations);
      showSelectedAnnotationOnly(false);
      showAnnotationBoundingBoxes(true);
      showAnnotationLabels(LabelDisplayBehavior.ALWAYS);
    }
  }, [viewSourceAnnotations]);

  useEffect(() => {
    if (only_display_these_annotations) {
      // openedDocument(only_display_these_annotations[0].document);
      setViewSourceAnnotations(null);
    }
  }, [only_display_these_annotations]);

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
      setLastCells((prevCells) => [...prevCells]);
    },
  });

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

  const handleRowClick = (cell: DatacellType) => {
    if (cell?.fullSourceList) {
      setViewSourceAnnotations(cell.fullSourceList as ServerAnnotationType[]);
    }
  };

  return (
    <Segment style={{ overflow: "auto", maxHeight: "100%" }}>
      {(trying_approve || trying_edit || trying_reject) && (
        <Dimmer active>
          <Loader>
            {trying_approve && "Approving..."}
            {trying_edit && "Editing..."}
            {trying_reject && "Rejecting..."}
          </Loader>
        </Dimmer>
      )}
      <Table celled>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Column</Table.HeaderCell>
            <Table.HeaderCell>Data</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
            <Table.HeaderCell>Actions</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {columns.map((column: ColumnType) => {
            const cell = lastCells.find((c) => c.column.id === column.id);
            return (
              <Table.Row
                key={column.id}
                onClick={() => cell && handleRowClick(cell)}
                onMouseEnter={() => setHoveredRow(column.id)}
                onMouseLeave={() => setHoveredRow(null)}
                style={{
                  cursor: "pointer",
                  backgroundColor:
                    hoveredRow === column.id ? "#e6ffe6" : "inherit",
                  transition: "background-color 0.3s ease",
                }}
              >
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
                <Table.Cell>
                  {cell && (
                    <Button.Group size="mini">
                      <Button
                        icon="thumbs up"
                        color="green"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestApprove({
                            variables: { datacellId: cell.id },
                          });
                        }}
                      />
                      <Button
                        icon="thumbs down"
                        color="red"
                        onClick={(e) => {
                          e.stopPropagation();
                          requestReject({ variables: { datacellId: cell.id } });
                        }}
                      />
                      <Button
                        icon="edit"
                        color="blue"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Note: You might want to implement an edit modal or form here
                          // For now, we're just passing the current data
                          requestEdit({
                            variables: {
                              datacellId: cell.id,
                              editedData: cell.data,
                            },
                          });
                        }}
                      />
                    </Button.Group>
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
