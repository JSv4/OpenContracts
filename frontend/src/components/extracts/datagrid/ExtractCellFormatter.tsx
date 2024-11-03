import React, { useState } from "react";
import { Icon, Modal, Button } from "semantic-ui-react";
import { CellStatus } from "../../../types/extract-grid";
import styled from "styled-components";
import { JSONSchema7 } from "json-schema";
import ReactJson from "react-json-view";

const StatusDot = styled.div`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: #4caf50;
  position: absolute;
  top: 4px;
  right: 4px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  animation: pulse 2s infinite;
  box-shadow: 0 0 10px rgba(76, 175, 80, 0.4);

  &:hover {
    transform: scale(1.3);
    background-color: #45a049;
    box-shadow: 0 0 15px rgba(76, 175, 80, 0.6);
  }

  @keyframes pulse {
    0% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.7);
    }
    70% {
      transform: scale(1);
      box-shadow: 0 0 0 10px rgba(76, 175, 80, 0);
    }
    100% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(76, 175, 80, 0);
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
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openViewer = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const handleJsonEdit = (edit: any) => {
    const updatedValue = edit.updated_src;
    onEdit(cellId, updatedValue);
  };

  const displayValue = () => {
    if (typeof value === "object" && value !== null) {
      return (
        <div
          onClick={openViewer}
          style={{ cursor: "pointer", display: "flex", alignItems: "center" }}
        >
          <Icon name="code" />
          <span style={{ marginLeft: "5px" }}>View/Edit JSON</span>
        </div>
      );
    } else {
      return <div className="cell-value">{String(value)}</div>;
    }
  };

  return (
    <>
      {displayValue()}
      <Modal open={isModalOpen} onClose={closeModal} size="large">
        <Modal.Header>Edit JSON Data</Modal.Header>
        <Modal.Content>
          <ReactJson
            src={value}
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
    </>
  );
};
