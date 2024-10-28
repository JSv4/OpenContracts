import React, { useState } from "react";
import { Button, Popup } from "semantic-ui-react";
import { CellStatus } from "../../../types/extract-grid";
import styled from "styled-components";

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
  value: string;
  cellStatus: CellStatus;
  cellId: string;
  onApprove: () => void;
  onReject: () => void;
  isExtractComplete: boolean;
}

export const ExtractCellFormatter: React.FC<ExtractCellFormatterProps> = ({
  value,
  cellStatus,
  cellId,
  onApprove,
  onReject,
  isExtractComplete,
}) => {
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  console.log("Cell status:", cellStatus);
  console.log("Is extract complete:", isExtractComplete);
  console.log("Value:", value);

  const getCellBackground = () => {
    if (cellStatus === undefined) return "transparent";
    if (cellStatus.isApproved) return "rgba(76, 175, 80, 0.1)";
    if (cellStatus.isRejected) return "rgba(244, 67, 54, 0.1)";
    return "transparent";
  };

  return (
    <CellContainer style={{ background: getCellBackground() }}>
      <div className="cell-value">{value}</div>
      {cellStatus?.isLoading && <div className="cell-loader">Loading...</div>}
      {!cellStatus?.isLoading && isExtractComplete && (
        <Popup
          trigger={<StatusDot />}
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
                  disabled={cellStatus?.isApproved || !isExtractComplete}
                  title="Approve"
                />
                <Button
                  icon="close"
                  color="red"
                  size="tiny"
                  onClick={() => {
                    onReject();
                    setIsPopupOpen(false);
                  }}
                  disabled={cellStatus?.isRejected || !isExtractComplete}
                  title="Reject"
                />
              </div>
              {cellStatus?.isApproved && (
                <div className="status-message">Cell is currently approved</div>
              )}
            </ButtonContainer>
          }
        />
      )}
    </CellContainer>
  );
};
