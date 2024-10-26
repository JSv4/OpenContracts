import React from "react";
import { RenderCellProps } from "react-data-grid";
import { Icon } from "semantic-ui-react";
import { ExtractGridRow } from "../../../types/extract-grid";
import { CellStatus } from "../../../types/extract-grid";

interface CellRendererProps extends RenderCellProps<ExtractGridRow, unknown> {
  cellStatus: CellStatus;
}

export const CellRenderer: React.FC<CellRendererProps> = ({
  column,
  row,
  cellStatus,
}) => {
  const value = row[column.key as keyof ExtractGridRow];

  const cellStyle = {
    display: "flex",
    alignItems: "center",
    width: "100%",
    height: "100%",
    padding: "0 8px",
  };

  if (cellStatus.isLoading) {
    return (
      <div style={cellStyle}>
        <Icon name="spinner" loading />
      </div>
    );
  }

  return (
    <div style={cellStyle}>
      {value}
      {cellStatus.isApproved && (
        <Icon name="check" color="green" style={{ marginLeft: "auto" }} />
      )}
      {cellStatus.isRejected && (
        <Icon name="x" color="red" style={{ marginLeft: "auto" }} />
      )}
      {cellStatus.isEdited && (
        <Icon name="edit" color="blue" style={{ marginLeft: "auto" }} />
      )}
    </div>
  );
};
