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
  // Ensure value is always a string
  const displayValue =
    value === null || value === undefined || typeof value === "object"
      ? "-"
      : String(value);

  if (cellStatus?.isLoading) {
    return <div>Loading...</div>;
  }

  if (cellStatus?.error) {
    return <div>Error</div>;
  }

  return <div>{displayValue}</div>;
};
