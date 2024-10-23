import React from "react";
import { FormatterProps } from "../../../types/extract-grid";
import { Button, Popup, Icon } from "semantic-ui-react";
import { JSONTree } from "react-json-tree";

export const ExtractCellFormatter: React.FC<FormatterProps> = ({
  row,
  column,
  cellStatus,
  onApprove,
  onReject,
  onEdit,
  onViewSource,
}) => {
  const getCellColor = () => {
    if (cellStatus.isApproved) return "rgba(0, 255, 0, 0.1)";
    if (cellStatus.isRejected) return "rgba(255, 0, 0, 0.1)";
    if (cellStatus.isEdited) return "rgba(255, 255, 0, 0.1)";
    return undefined;
  };

  const value = cellStatus.correctedData || row[column.key];

  return (
    <div
      style={{
        backgroundColor: getCellColor(),
        padding: "8px",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Popup
        trigger={
          <div
            style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {typeof value === "object" ? (
              <JSONTree data={value} hideRoot />
            ) : (
              String(value)
            )}
          </div>
        }
        content={
          <div
            style={{ maxWidth: "400px", maxHeight: "400px", overflow: "auto" }}
          >
            <JSONTree data={value} hideRoot />
          </div>
        }
        wide="very"
      />

      <div style={{ display: "flex", gap: "4px" }}>
        {onViewSource && (
          <Button icon size="mini" onClick={onViewSource}>
            <Icon name="eye" />
          </Button>
        )}
        {onApprove && (
          <Button icon size="mini" color="green" onClick={onApprove}>
            <Icon name="thumbs up" />
          </Button>
        )}
        {onReject && (
          <Button icon size="mini" color="red" onClick={onReject}>
            <Icon name="thumbs down" />
          </Button>
        )}
        {onEdit && (
          <Button icon size="mini" onClick={() => onEdit(value)}>
            <Icon name="edit" />
          </Button>
        )}
      </div>
    </div>
  );
};
