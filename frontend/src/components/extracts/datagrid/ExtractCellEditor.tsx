import React, { useState } from "react";
import {
  Input,
  Checkbox,
  Modal,
  Button,
  InputOnChangeData,
  CheckboxProps,
} from "semantic-ui-react";
import { JSONSchema7 } from "json-schema";
import JsonView from "@uiw/react-json-view";
import { darkTheme } from "@uiw/react-json-view/dark";

interface ExtractCellEditorProps {
  row: any;
  column: any;
  onRowChange: (updatedRow: any, commitChanges?: boolean) => void;
  onClose: () => void;
  schema: JSONSchema7;
  extractIsList: boolean;
}

export const ExtractCellEditor: React.FC<ExtractCellEditorProps> = ({
  row,
  column,
  onRowChange,
  onClose,
  schema,
  extractIsList,
}) => {
  const initialValue = row[column.key];
  const [value, setValue] = useState(initialValue);
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);

  /**
   * Handles input change events for string and number types.
   * @param event - The input change event.
   * @param data - The input onChange data.
   */
  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    data: InputOnChangeData
  ) => {
    setValue(data.value);
  };

  /**
   * Handles checkbox change events for boolean types.
   * @param event - The checkbox change event.
   * @param data - The checkbox onChange data.
   */
  const handleCheckboxChange = (
    event: React.FormEvent<HTMLInputElement>,
    data: CheckboxProps
  ) => {
    setValue(data.checked);
  };

  const handleJsonChange = (updatedValue: any) => {
    setValue(updatedValue);
  };

  const handleCommit = () => {
    onRowChange({ ...row, [column.key]: value }, true);
    onClose();
  };

  const renderJsonEditor = () => (
    <Modal
      open={isJsonModalOpen}
      onClose={() => setIsJsonModalOpen(false)}
      style={{
        borderRadius: "12px",
        overflow: "hidden",
        boxShadow: "0 12px 48px rgba(0, 0, 0, 0.12)",
      }}
    >
      <Modal.Header
        style={{
          background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          padding: "16px 24px",
          fontSize: "1.1rem",
          color: "#0f172a",
        }}
      >
        Edit {column.name}
      </Modal.Header>
      <Modal.Content
        style={{
          padding: "24px",
          maxHeight: "70vh",
          overflow: "auto",
        }}
      >
        <JsonView
          src={value}
          theme={{
            ...darkTheme,
            backgroundColor: "#0f172a",
            fontSize: "14px",
            borderRadius: "8px",
          }}
          displayDataTypes={true}
          displayObjectSize={true}
          enableClipboard={true}
          onEdit={(edit: any) => {
            handleJsonChange(edit.updated_src);
          }}
          indentWidth={4}
          collapsed={false}
        />
      </Modal.Content>
      <Modal.Actions
        style={{
          background: "#f8fafc",
          borderTop: "1px solid #e2e8f0",
          padding: "16px 24px",
        }}
      >
        <Button
          onClick={() => setIsJsonModalOpen(false)}
          style={{
            marginRight: "12px",
            background: "#f1f5f9",
            color: "#64748b",
            border: "none",
            borderRadius: "6px",
            padding: "8px 16px",
          }}
        >
          Cancel
        </Button>
        <Button
          primary
          onClick={handleCommit}
          style={{
            background: "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            padding: "8px 16px",
          }}
        >
          Save
        </Button>
      </Modal.Actions>
    </Modal>
  );

  const renderPrimitiveEditor = () => {
    const { type } = schema;

    switch (type) {
      case "string":
        return (
          <Input fluid value={value} onChange={handleInputChange} autoFocus />
        );

      case "number":
        return (
          <Input
            fluid
            type="number"
            value={value}
            onChange={handleInputChange}
            autoFocus
          />
        );

      case "boolean":
        return (
          <Checkbox checked={value} onChange={handleCheckboxChange} autoFocus />
        );

      default:
        return (
          <Input
            fluid
            value={String(value)}
            onChange={handleInputChange}
            autoFocus
          />
        );
    }
  };

  if (schema.type === "object" || extractIsList) {
    return (
      <>
        <Button
          icon="code"
          content="Edit JSON"
          onClick={() => setIsJsonModalOpen(true)}
        />
        {isJsonModalOpen && renderJsonEditor()}
      </>
    );
  }

  return (
    <>
      {renderPrimitiveEditor()}
      <div style={{ marginTop: "1em", textAlign: "right" }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button primary onClick={handleCommit}>
          Save
        </Button>
      </div>
    </>
  );
};
