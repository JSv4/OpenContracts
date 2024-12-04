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
import { ColumnType, DatacellType } from "../../types/graphql-api";
import { useMutation } from "@apollo/client";
import { LabelDisplayBehavior } from "../../types/graphql-api";
import { toast } from "react-toastify";
import {
  REQUEST_APPROVE_DATACELL,
  REQUEST_REJECT_DATACELL,
  RequestApproveDatacellInputType,
  RequestApproveDatacellOutputType,
  RequestRejectDatacellInputType,
  RequestRejectDatacellOutputType,
} from "../../graphql/mutations";
import { useAnnotationRefs } from "../annotator/hooks/useAnnotationRefs";
import { usePdfAnnotations } from "../annotator/hooks/AnnotationHooks";
import {
  useAnnotationDisplay,
  useAnnotationSelection,
} from "../annotator/context/UISettingsAtom";

interface SingleDocumentExtractResultsProps {
  datacells: DatacellType[];
  columns: ColumnType[];
}

export const SingleDocumentExtractResults: React.FC<
  SingleDocumentExtractResultsProps
> = ({ datacells, columns }) => {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [lastCells, setLastCells] = useState(datacells);
  const { annotationElementRefs } = useAnnotationRefs();
  const { replaceAnnotations } = usePdfAnnotations();

  const { setShowBoundingBoxes, setShowLabels, setShowSelectedOnly } =
    useAnnotationDisplay();
  const { setSelectedAnnotations } = useAnnotationSelection();

  useEffect(() => {
    setLastCells(datacells);
  }, [datacells]);

  const handleRowClick = (cell: DatacellType) => {
    if (cell.fullSourceList && cell.fullSourceList.length > 0) {
      console.log("Jumping to row", cell);
      const annotationId = cell.fullSourceList[0].id;
      setSelectedAnnotations([annotationId]);
      setShowBoundingBoxes(true);
      setShowLabels(LabelDisplayBehavior.ALWAYS);
      setShowSelectedOnly(false);
    } else {
      console.log("Could not jump to row");
    }
  };

  const [requestApprove, { loading: trying_approve }] = useMutation<
    RequestApproveDatacellOutputType,
    RequestApproveDatacellInputType
  >(REQUEST_APPROVE_DATACELL, {
    onCompleted: (data) => {
      toast.success("Approved!");
      console.log("Approved data", data);
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
      console.log("Reject mutation received data", data);
      setLastCells((prevCells) =>
        prevCells.map((cell) =>
          cell.id === data.rejectDatacell.obj.id
            ? { ...cell, ...data.rejectDatacell.obj }
            : cell
        )
      );
    },
    onError: () => toast.error("Could not register feedback!"),
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

  const renderActionButtons = (cell: DatacellType) => (
    <Button.Group size="mini" vertical>
      <Button
        icon="thumbs up"
        color="green"
        onClick={(e) => {
          e.stopPropagation();
          requestApprove({ variables: { datacellId: cell.id } });
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
    </Button.Group>
  );

  return (
    <Segment style={{ padding: 0, height: "100%", overflow: "hidden" }}>
      <Dimmer.Dimmable
        as={Segment}
        dimmed={trying_approve || trying_reject}
        style={{ height: "100%", overflow: "auto", margin: 0 }}
      >
        <Dimmer active={trying_approve || trying_reject}>
          <Loader>
            {trying_approve && "Approving..."}
            {trying_reject && "Rejecting..."}
          </Loader>
        </Dimmer>
        <Table compact size="small" style={{ fontSize: "0.8em" }}>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Column</Table.HeaderCell>
              <Table.HeaderCell>Data</Table.HeaderCell>
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
                  <Table.Cell>
                    {column.name}
                    {cell && (
                      <div style={{ float: "right" }}>
                        {cell.approvedBy && <Icon name="check" color="green" />}
                        {cell.rejectedBy && <Icon name="x" color="red" />}
                        {cell.correctedData && (
                          <Icon name="edit" color="blue" />
                        )}
                      </div>
                    )}
                  </Table.Cell>
                  <Table.Cell>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      {cell ? renderJsonPreview(cell.data) : "-"}
                      {cell && renderActionButtons(cell)}
                    </div>
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table>
      </Dimmer.Dimmable>
    </Segment>
  );
};
