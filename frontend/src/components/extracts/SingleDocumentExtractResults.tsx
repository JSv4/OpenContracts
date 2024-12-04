import React, { useState, useEffect } from "react";
import {
  Segment,
  Icon,
  Popup,
  Button,
  Dimmer,
  Loader,
} from "semantic-ui-react";
import styled from "styled-components";
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

// Styled Components
const Container = styled.div`
  height: 100%;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
  border: 1px solid rgba(0, 0, 0, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

const TableContainer = styled.div`
  flex: 1;
  overflow: auto;
  margin: 0;
  background: #fff;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  color: #1e293b;
`;

const TableHeader = styled.th`
  position: sticky;
  top: 0;
  background: #f1f5f9;
  padding: 12px 16px;
  text-align: left;
  font-weight: 600;
  border-bottom: 2px solid #e2e8f0;
  z-index: 1;
  color: #0f172a;
`;

const TableRow = styled.tr<{ isHovered: boolean }>`
  cursor: pointer;
  transition: background-color 0.2s ease;
  background-color: ${(props) => (props.isHovered ? "#f8fafc" : "#fff")};

  &:hover {
    background-color: #f1f5f9;
  }

  &:last-child td {
    border-bottom: none;
  }
`;

const TableCell = styled.td`
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: top;
  background-color: inherit;
`;

const CellContent = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
`;

const StatusIcons = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const JsonPreview = styled.div`
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85rem;
  white-space: pre-wrap;
  color: #334155;
  flex: 1;
  padding: 8px;
  background: #f8fafc;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
`;

const ActionButtons = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-left: 8px;
`;

// Component for cell status icons
const CellStatus: React.FC<{ cell: DatacellType }> = ({ cell }) => (
  <StatusIcons>
    {cell.approvedBy && <Icon name="check" color="green" />}
    {cell.rejectedBy && <Icon name="x" color="red" />}
    {cell.correctedData && <Icon name="edit" color="blue" />}
  </StatusIcons>
);

// Component for JSON preview with popup
const JsonPreviewCell: React.FC<{ data: Record<string, any> }> = ({ data }) => {
  const jsonString = JSON.stringify(data, null, 2);
  const preview =
    jsonString.split("\n").slice(0, 3).join("\n") +
    (jsonString.split("\n").length > 3 ? "\n..." : "");

  return (
    <Popup
      trigger={<JsonPreview>{preview}</JsonPreview>}
      content={
        <div style={{ maxHeight: "400px", overflow: "auto" }}>
          <JSONTree
            data={data}
            hideRoot
            theme={{
              base00: "#1e293b",
              base0D: "#3b82f6",
              base0B: "#10b981",
              base08: "#ef4444",
            }}
          />
        </div>
      }
      wide="very"
      on="click"
      position="right center"
    />
  );
};

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
    <Container>
      <Dimmer.Dimmable
        as={TableContainer}
        dimmed={trying_approve || trying_reject}
      >
        <Dimmer active={trying_approve || trying_reject}>
          <Loader>
            {trying_approve && "Approving..."}
            {trying_reject && "Rejecting..."}
          </Loader>
        </Dimmer>

        <Table>
          <thead>
            <tr>
              <TableHeader>Column</TableHeader>
              <TableHeader>Data</TableHeader>
            </tr>
          </thead>
          <tbody>
            {columns.map((column: ColumnType) => {
              const cell = lastCells.find((c) => c.column.id === column.id);
              return (
                <TableRow
                  key={column.id}
                  onClick={() => cell && handleRowClick(cell)}
                  isHovered={hoveredRow === column.id}
                  onMouseEnter={() => setHoveredRow(column.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                >
                  <TableCell>
                    <CellContent>
                      <span>{column.name}</span>
                      {cell && <CellStatus cell={cell} />}
                    </CellContent>
                  </TableCell>
                  <TableCell>
                    <CellContent>
                      {cell ? (
                        <>
                          <JsonPreviewCell data={cell.data} />
                          <ActionButtons>
                            {renderActionButtons(cell)}
                          </ActionButtons>
                        </>
                      ) : (
                        "-"
                      )}
                    </CellContent>
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
      </Dimmer.Dimmable>
    </Container>
  );
};
