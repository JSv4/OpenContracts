import { Loader } from "semantic-ui-react";

interface CellStatus {
  isLoading?: boolean;
  isApproved: boolean;
  isRejected: boolean;
  isEdited: boolean;
  originalData: any;
  correctedData: any;
  error?: boolean;
}

interface FormatterProps {
  value: string;
  cellStatus: CellStatus;
  onApprove: () => void;
  onReject: () => void;
  onEdit: (value: string) => void;
}

export const ExtractCellFormatter: React.FC<FormatterProps> = ({
  value,
  cellStatus,
  onApprove,
  onReject,
  onEdit,
}) => {
  // Explicitly check isLoading is true (not just truthy)
  if (cellStatus.isLoading === true) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          backgroundColor: "rgba(0, 0, 0, 0.05)",
          width: "100%",
          padding: "8px",
          position: "relative",
        }}
      >
        <Loader active={true} size="small" inline="centered" />
      </div>
    );
  }

  if (cellStatus?.error) {
    return <div>Error</div>;
  }

  // Ensure value is always a string
  const displayValue =
    value === null || value === undefined || typeof value === "object"
      ? "-"
      : String(value);

  return <div style={{ padding: "8px" }}>{displayValue}</div>;
};
