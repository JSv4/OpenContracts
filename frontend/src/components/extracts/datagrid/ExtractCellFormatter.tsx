import React, { useState } from "react";
import { CellStatus, FormatterProps } from "../../../types/extract-grid";
import { Button, Icon } from "semantic-ui-react";

interface ExtractCellFormatterProps extends FormatterProps {
  value: string;
  cellStatus: CellStatus;
  onApprove: () => void;
  onReject: () => void;
  onEdit: (value: string) => void;
}

export const ExtractCellFormatter: React.FC<ExtractCellFormatterProps> = ({
  value,
  cellStatus,
  onApprove,
  onReject,
  onEdit,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  return (
    <div
      className={`cell-formatter ${cellStatus.isApproved ? "approved" : ""} ${
        cellStatus.isRejected ? "rejected" : ""
      }`}
    >
      {isEditing ? (
        <input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => {
            setIsEditing(false);
            if (editValue !== value) {
              onEdit(editValue);
            }
          }}
        />
      ) : (
        <>
          <span>{value}</span>
          <div className="cell-actions">
            <Button icon="check" onClick={onApprove} />
            <Button icon="x" onClick={onReject} />
            <Button icon="edit" onClick={() => setIsEditing(true)} />
          </div>
        </>
      )}
    </div>
  );
};
