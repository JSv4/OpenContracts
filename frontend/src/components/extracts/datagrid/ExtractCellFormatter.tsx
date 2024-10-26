import React from "react";
import { FormatterProps } from "../../../types/extract-grid";
import { Icon } from "semantic-ui-react";

interface ExtractCellFormatterProps extends FormatterProps {
  value: string;
  cellStatus: {
    isLoading: boolean;
    isApproved: boolean;
    isRejected: boolean;
    isEdited: boolean;
    originalData: any;
    correctedData: any;
  };
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
}

export const ExtractCellFormatter: React.FC<ExtractCellFormatterProps> = ({
  value,
  cellStatus,
  onApprove,
  onReject,
  onEdit,
}) => {
  console.log("ExtractCellFormatter received:", { value, cellStatus });

  return (
    <div className="cell-content">
      {cellStatus.isLoading ? (
        <Icon name="spinner" loading />
      ) : (
        <span>{String(value || "")}</span>
      )}
    </div>
  );
};
