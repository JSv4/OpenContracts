import React from "react";
import { MetadataColumn } from "../src/types/metadata";

// Debug component to log metadata column state
export const MetadataDebugComponent = ({
  columns,
}: {
  columns: MetadataColumn[];
}) => {
  React.useEffect(() => {
    console.log("DEBUG - Metadata columns:", columns);
    columns.forEach((col) => {
      console.log(`DEBUG - Column ${col.id}:`, {
        name: col.name,
        dataType: col.dataType,
        extractIsList: col.extractIsList,
        validationRules: col.validationRules,
        orderIndex: col.orderIndex,
      });
    });
  }, [columns]);
  return null;
};

// Debug component for tracking metadata value changes
export const MetadataValueDebugger = ({
  documentId,
  columnId,
  value,
}: {
  documentId: string;
  columnId: string;
  value: any;
}) => {
  const [changeCount, setChangeCount] = React.useState(0);

  React.useEffect(() => {
    setChangeCount((prev) => prev + 1);
    console.log(`DEBUG - Metadata value change #${changeCount + 1}:`, {
      documentId,
      columnId,
      value,
      timestamp: new Date().toISOString(),
    });
  }, [value]);

  return (
    <div data-testid="metadata-value-debugger" style={{ display: "none" }}>
      Changes: {changeCount}
    </div>
  );
};

// Debug component for validation state
export const ValidationDebugger = ({
  isValid,
  errors,
}: {
  isValid: boolean;
  errors: string[];
}) => {
  React.useEffect(() => {
    console.log("DEBUG - Validation state:", { isValid, errors });
  }, [isValid, errors]);

  return null;
};
