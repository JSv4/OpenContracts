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

interface JsonEdit {
  updated_src: any;
  // You can add other properties if needed
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
    <Modal open={isJsonModalOpen} onClose={() => setIsJsonModalOpen(false)}>
      <Modal.Header>Edit {column.name}</Modal.Header>
      <Modal.Content>
        <JsonView
          src={value}
          theme={darkTheme}
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
      <Modal.Actions>
        <Button onClick={() => setIsJsonModalOpen(false)}>Cancel</Button>
        <Button primary onClick={handleCommit}>
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
          <Input
            fluid
            value={value}
            onChange={handleInputChange}
            onBlur={handleCommit}
            autoFocus
          />
        );

      case "number":
        return (
          <Input
            fluid
            type="number"
            value={value}
            onChange={handleInputChange}
            onBlur={handleCommit}
            autoFocus
          />
        );

      case "boolean":
        return (
          <Checkbox
            checked={value}
            onChange={handleCheckboxChange}
            onBlur={handleCommit}
          />
        );

      default:
        return (
          <Input
            fluid
            value={String(value)}
            onChange={handleInputChange}
            onBlur={handleCommit}
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

  return renderPrimitiveEditor();
};
