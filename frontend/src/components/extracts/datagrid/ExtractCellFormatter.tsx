import React, { useState, useEffect } from "react";
import { Button, Popup, Icon, Modal } from "semantic-ui-react";
import { CellStatus } from "../../../types/extract-grid";
import styled from "styled-components";
import { JSONSchema7 } from "json-schema";
import { ExtractCellEditor } from "./ExtractCellEditor";
import ReactJson from "react-json-view";

const StatusDot = styled.div<{ statusColor: string }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: ${({ statusColor }) => statusColor};
  position: absolute;
  top: 4px;
  right: 4px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  animation: pulse 2s infinite;
  box-shadow: 0 0 10px ${({ statusColor }) => statusColor};

  &:hover {
    transform: scale(1.3);
    background-color: ${({ statusColor }) => statusColor};
    box-shadow: 0 0 15px ${({ statusColor }) => statusColor};
  }

  @keyframes pulse {
    0% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 ${({ statusColor }) => statusColor};
    }
    70% {
      transform: scale(1);
      box-shadow: 0 0 0 10px rgba(76, 175, 80, 0);
    }
    100% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 ${({ statusColor }) => statusColor};
    }
  }
`;

const ButtonContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.98);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(10px);

  .buttons {
    display: flex;
    gap: 12px;
  }

  .status-message {
    font-size: 11px;
    color: #666;
    text-align: center;
    margin-top: 4px;
  }

  .ui.button {
    margin: 0;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 6px;
    min-width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    &:active:not(:disabled) {
      transform: translateY(0);
    }

    &.green {
      background: linear-gradient(135deg, #4caf50, #45a049);

      &:hover:not(:disabled) {
        background: linear-gradient(135deg, #45a049, #388e3c);
      }
    }

    &.red {
      background: linear-gradient(135deg, #f44336, #e53935);

      &:hover:not(:disabled) {
        background: linear-gradient(135deg, #e53935, #d32f2f);
      }
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      filter: grayscale(40%);
    }

    i.icon {
      margin: 0 !important;
      font-size: 1.1em;
    }
  }
`;

const CellContainer = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  padding: 8px;
  transition: background 0.3s ease;
`;

interface ExtractCellFormatterProps {
  value: any;
  cellStatus: CellStatus | null;
  cellId: string;
  onApprove: () => void;
  onReject: () => void;
  onEdit: (cellId: string, editedData: any) => void;
  readOnly: boolean;
  isExtractComplete: boolean;
  schema: JSONSchema7;
  extractIsList: boolean;
  row: any;
  column: any;
}

/**
 * ExtractCellFormatter component displays the content of a cell in the extract data grid.
 * It handles displaying the value, editing, approving, and rejecting the cell.
 * If the cell has correctedData, it displays that instead of the original data.
 * It also provides a control to view the original value when correctedData is present.
 */
export const ExtractCellFormatter: React.FC<ExtractCellFormatterProps> = ({
  value,
  cellStatus,
  cellId,
  onApprove,
  onReject,
  onEdit,
  readOnly,
  isExtractComplete,
  schema,
  extractIsList,
  row,
  column,
}) => {
  useEffect(() => {
    console.log("ExtractCellFormatter rendered with:", {
      value,
      cellStatus,
      cellId,
      isExtractComplete,
    });
  }, [value, cellStatus, cellId, isExtractComplete]);

  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOriginalModalOpen, setIsOriginalModalOpen] = useState(false); // New state for original value modal

  const getCellBackground = () => {
    if (!cellStatus) return "transparent";
    if (cellStatus.isApproved) return "rgba(76, 175, 80, 0.1)";
    if (cellStatus.isRejected) return "rgba(244, 67, 54, 0.1)";
    return "transparent";
  };

  const openViewer = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const openOriginalViewer = () => {
    setIsOriginalModalOpen(true);
  };

  const closeOriginalModal = () => {
    setIsOriginalModalOpen(false);
  };

  const handleJsonEdit = (edit: any) => {
    const updatedValue = edit.updated_src;
    onEdit(cellId, updatedValue);
  };

  const statusColor = () => {
    if (cellStatus?.isApproved) return "rgba(76, 175, 80, 1)";
    if (cellStatus?.isRejected) return "rgba(244, 67, 54, 1)";
    if (cellStatus?.isEdited) return "rgba(33, 150, 243, 1)";
    return "rgba(128, 128, 128, 1)";
  };

  const displayedValue =
    cellStatus?.correctedData != null ? cellStatus.correctedData : value;

  const displayValue = () => {
    if (typeof displayedValue === "object" && displayedValue !== null) {
      return (
        <div
          onClick={openViewer}
          style={{
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
          }}
        >
          <Icon name="code" />
          <span style={{ marginLeft: "5px" }}>View/Edit JSON</span>
        </div>
      );
    } else {
      return <div className="cell-value">{String(displayedValue)}</div>;
    }
  };

  return (
    <CellContainer style={{ background: getCellBackground() }}>
      {displayValue()}
      {cellStatus?.isLoading && <div className="cell-loader">Loading...</div>}
      {!cellStatus?.isLoading && isExtractComplete && (
        <>
          <Popup
            trigger={<StatusDot statusColor={statusColor()} />}
            on="click"
            position="top right"
            open={isPopupOpen}
            onOpen={() => setIsPopupOpen(true)}
            onClose={() => setIsPopupOpen(false)}
            mouseLeaveDelay={300}
            content={
              <ButtonContainer>
                <div className="buttons">
                  <Button
                    icon="check"
                    color="green"
                    size="tiny"
                    onClick={() => {
                      onApprove();
                      setIsPopupOpen(false);
                    }}
                    disabled={
                      cellStatus?.isApproved || readOnly || !isExtractComplete
                    }
                    title="Approve"
                  />
                  <Button
                    icon="edit"
                    color="grey"
                    size="tiny"
                    onClick={() => {
                      if (
                        typeof displayedValue === "object" &&
                        displayedValue !== null
                      ) {
                        openViewer();
                      } else {
                        setIsEditing(true);
                      }
                      setIsPopupOpen(false);
                    }}
                    disabled={readOnly || !isExtractComplete}
                    title="Edit"
                  />
                  <Button
                    icon="eye"
                    color="blue"
                    size="tiny"
                    onClick={() => {
                      openOriginalViewer();
                      setIsPopupOpen(false);
                    }}
                    disabled={!cellStatus?.correctedData}
                    title="View Original"
                  />
                  <Button
                    icon="close"
                    color="red"
                    size="tiny"
                    onClick={() => {
                      onReject();
                      setIsPopupOpen(false);
                    }}
                    disabled={
                      cellStatus?.isRejected || readOnly || !isExtractComplete
                    }
                    title="Reject"
                  />
                </div>
                {cellStatus?.isApproved && (
                  <div className="status-message">
                    Cell is currently approved
                  </div>
                )}
                {cellStatus?.isRejected && (
                  <div className="status-message">
                    Cell is currently rejected
                  </div>
                )}
                {cellStatus?.isEdited && !cellStatus?.isApproved && (
                  <div className="status-message">Cell has been edited</div>
                )}
              </ButtonContainer>
            }
          />
          {isEditing && (
            <ExtractCellEditor
              row={row}
              column={column}
              onRowChange={(updatedRow: any, commitChanges?: boolean) => {
                if (commitChanges) {
                  onEdit(cellId, updatedRow[column.key]);
                }
              }}
              onClose={() => setIsEditing(false)}
              schema={schema}
              extractIsList={extractIsList}
            />
          )}
          <Modal open={isModalOpen} onClose={closeModal} size="large">
            <Modal.Header>Edit JSON Data</Modal.Header>
            <Modal.Content>
              <ReactJson
                src={displayedValue}
                onEdit={handleJsonEdit}
                onAdd={handleJsonEdit}
                onDelete={handleJsonEdit}
                theme="rjv-default"
                style={{ padding: "20px" }}
                enableClipboard={false}
                displayDataTypes={false}
              />
            </Modal.Content>
            <Modal.Actions>
              <Button onClick={closeModal}>Close</Button>
            </Modal.Actions>
          </Modal>
          <Modal
            open={isOriginalModalOpen}
            onClose={closeOriginalModal}
            size="large"
          >
            <Modal.Header>Original Value</Modal.Header>
            <Modal.Content>
              {typeof value === "object" && value !== null ? (
                <ReactJson
                  src={value}
                  theme="rjv-default"
                  style={{ padding: "20px" }}
                  enableClipboard={false}
                  displayDataTypes={false}
                />
              ) : (
                <div style={{ padding: "20px" }}>{String(value)}</div>
              )}
            </Modal.Content>
            <Modal.Actions>
              <Button onClick={closeOriginalModal}>Close</Button>
            </Modal.Actions>
          </Modal>
        </>
      )}
    </CellContainer>
  );
};
