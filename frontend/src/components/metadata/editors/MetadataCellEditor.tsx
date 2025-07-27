import React, { useRef, useEffect } from "react";
import { Input, Checkbox, Dropdown, TextArea, Label } from "semantic-ui-react";
import styled from "styled-components";
import { MetadataColumn, MetadataDataType } from "../../../types/metadata";

interface MetadataCellEditorProps {
  column: MetadataColumn;
  value: any;
  onChange: (value: any) => void;
  onBlur?: () => void;
  error?: string;
  autoFocus?: boolean;
}

const EditorContainer = styled.div`
  width: 100%;
  position: relative;

  .ui.input,
  .ui.dropdown,
  .ui.checkbox {
    width: 100%;
  }

  .ui.input input,
  .ui.dropdown,
  textarea {
    padding: 0.5rem;
    font-size: 0.875rem;
  }
`;

const ErrorLabel = styled(Label)`
  &.ui.label {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 0.25rem;
    font-size: 0.75rem;
    z-index: 1000;
  }
`;

export const MetadataCellEditor: React.FC<MetadataCellEditorProps> = ({
  column,
  value,
  onChange,
  onBlur,
  error,
  autoFocus,
}) => {
  const inputRef = useRef<any>(null);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current.select) {
        inputRef.current.select();
      }
    }
  }, [autoFocus]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" || e.key === "Enter") {
      // Let parent handle navigation
      return;
    }
    e.stopPropagation();
  };

  const renderEditor = () => {
    switch (column.dataType) {
      case MetadataDataType.STRING:
      case MetadataDataType.URL:
      case MetadataDataType.EMAIL:
        return (
          <Input
            ref={inputRef}
            type={column.dataType === MetadataDataType.EMAIL ? "email" : "text"}
            value={value || ""}
            onChange={(e, { value }) => onChange(value)}
            onBlur={onBlur}
            onKeyDown={handleKeyDown}
            error={!!error}
            placeholder={
              column.helpText || `Enter ${column.name.toLowerCase()}`
            }
            fluid
          />
        );

      case MetadataDataType.TEXT:
        return (
          <TextArea
            ref={inputRef}
            value={value || ""}
            onChange={(e, { value }) => onChange(value)}
            onBlur={onBlur}
            onKeyDown={handleKeyDown}
            placeholder={
              column.helpText || `Enter ${column.name.toLowerCase()}`
            }
            rows={2}
            style={{ width: "100%", resize: "vertical" }}
          />
        );

      case MetadataDataType.INTEGER:
        return (
          <Input
            ref={inputRef}
            type="number"
            value={value ?? ""}
            onChange={(e, { value }) =>
              onChange(value ? parseInt(value) : null)
            }
            onBlur={onBlur}
            onKeyDown={handleKeyDown}
            error={!!error}
            placeholder="0"
            fluid
            step="1"
          />
        );

      case MetadataDataType.FLOAT:
        return (
          <Input
            ref={inputRef}
            type="number"
            value={value ?? ""}
            onChange={(e, { value }) =>
              onChange(value ? parseFloat(value) : null)
            }
            onBlur={onBlur}
            onKeyDown={handleKeyDown}
            error={!!error}
            placeholder="0.00"
            fluid
            step="0.01"
          />
        );

      case MetadataDataType.BOOLEAN:
        return (
          <Checkbox
            ref={inputRef}
            checked={value || false}
            onChange={(e, { checked }) => {
              onChange(checked);
              setTimeout(onBlur, 100); // Allow state to update before blur
            }}
            onKeyDown={handleKeyDown}
          />
        );

      case MetadataDataType.DATE:
        return (
          <Input
            ref={inputRef}
            type="date"
            value={value || ""}
            onChange={(e, { value }) => onChange(value)}
            onBlur={onBlur}
            onKeyDown={handleKeyDown}
            error={!!error}
            fluid
          />
        );

      case MetadataDataType.DATETIME:
        return (
          <Input
            ref={inputRef}
            type="datetime-local"
            value={value ? value.slice(0, 16) : ""}
            onChange={(e, { value }) => onChange(value ? `${value}:00Z` : null)}
            onBlur={onBlur}
            onKeyDown={handleKeyDown}
            error={!!error}
            fluid
          />
        );

      case MetadataDataType.CHOICE:
        return (
          <Dropdown
            ref={inputRef}
            selection
            value={value || ""}
            options={
              column.validationConfig?.choices?.map((choice) => ({
                key: choice,
                value: choice,
                text: choice,
              })) || []
            }
            onChange={(e, { value }) => {
              onChange(value);
              setTimeout(onBlur, 100);
            }}
            onBlur={onBlur}
            placeholder={`Select ${column.name.toLowerCase()}`}
            fluid
            clearable
            search
          />
        );

      case MetadataDataType.MULTI_CHOICE:
        return (
          <Dropdown
            ref={inputRef}
            selection
            multiple
            value={value || []}
            options={
              column.validationConfig?.choices?.map((choice) => ({
                key: choice,
                value: choice,
                text: choice,
              })) || []
            }
            onChange={(e, { value }) => onChange(value)}
            onBlur={onBlur}
            placeholder={`Select ${column.name.toLowerCase()}`}
            fluid
            search
          />
        );

      case MetadataDataType.JSON:
        return (
          <TextArea
            ref={inputRef}
            value={
              typeof value === "string" ? value : JSON.stringify(value, null, 2)
            }
            onChange={(e, { value }) => {
              try {
                onChange(JSON.parse(value as string));
              } catch {
                onChange(value); // Keep as string if invalid JSON
              }
            }}
            onBlur={onBlur}
            onKeyDown={handleKeyDown}
            placeholder='{"key": "value"}'
            rows={3}
            style={{
              width: "100%",
              fontFamily: "monospace",
              fontSize: "0.875rem",
            }}
          />
        );

      default:
        return null;
    }
  };

  return (
    <EditorContainer onClick={(e) => e.stopPropagation()}>
      {renderEditor()}
      {error && (
        <ErrorLabel basic color="red" pointing>
          {error}
        </ErrorLabel>
      )}
    </EditorContainer>
  );
};
