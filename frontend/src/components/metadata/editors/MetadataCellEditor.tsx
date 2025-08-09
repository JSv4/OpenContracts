import React, { useRef, useEffect, useState } from "react";
import {
  Input,
  Checkbox,
  Dropdown,
  TextArea,
  Label,
  Icon,
} from "semantic-ui-react";
import styled from "styled-components";
import { MetadataColumn, MetadataDataType } from "../../../types/metadata";
import { validateMetadataValue } from "../../../types/metadata";

interface MetadataCellEditorProps {
  column: MetadataColumn;
  value: any;
  onChange: (value: any) => void;
  onValidationChange?: (isValid: boolean) => void;
  onBlur?: () => void;
  onNavigate?: (direction: "next" | "previous" | "down" | "up") => void;
  error?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
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

  /* Direct child validation icon positioning */
  > .validation-icon {
    position: absolute;
    right: 0.5em;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10;
    pointer-events: none;
    /* Ensure visibility for Playwright */
    visibility: visible !important;
    display: inline-block !important;
    opacity: 1 !important;
  }

  /* When we have an input with validation */
  .with-validation input {
    padding-right: 2.5em !important;
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
  onNavigate,
  error,
  autoFocus,
  readOnly,
  onValidationChange,
}) => {
  const inputRef = useRef<any>(null);
  const [isValid, setIsValid] = useState(true);
  const [validationMessage, setValidationMessage] = useState("");

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      // Handle Semantic UI components that might wrap the actual input
      const element = inputRef.current;

      // Try to find the actual input element
      let inputElement = element;
      if (element.querySelector) {
        // For Semantic UI components, find the actual input inside
        const actualInput = element.querySelector("input, textarea, select");
        if (actualInput) {
          inputElement = actualInput;
        }
      }

      // Safely call focus if it exists
      if (inputElement && typeof inputElement.focus === "function") {
        inputElement.focus();
        if (typeof inputElement.select === "function") {
          inputElement.select();
        }
      }
    }
  }, [autoFocus]);

  useEffect(() => {
    const { valid, message } = validateMetadataValue(value, column);
    setIsValid(valid);
    setValidationMessage(message);
    if (onValidationChange) {
      onValidationChange(valid);
    }
  }, [value, column, onValidationChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      if (onNavigate) {
        onNavigate(e.shiftKey ? "previous" : "next");
      }
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      if (onNavigate) {
        onNavigate("down");
      }
      return;
    }
    e.stopPropagation();
  };

  const renderValidationIcon = () => {
    if (!onValidationChange) return null; // Only show icons if validation is being tracked
    if (isValid) {
      return (
        <Icon
          name="check circle"
          color="green"
          data-testid="validation-icon-success"
          className="validation-icon"
          style={{ visibility: "visible", opacity: 1 }}
        />
      );
    }
    return (
      <Icon
        name="warning circle"
        color="red"
        data-testid="validation-icon-error"
        className="validation-icon"
        style={{ visibility: "visible", opacity: 1 }}
      />
    );
  };

  const renderEditor = () => {
    const config = column.validationConfig || column.validationRules;

    switch (column.dataType) {
      case MetadataDataType.STRING:
      case MetadataDataType.URL:
      case MetadataDataType.EMAIL:
        if (config?.choices && config.choices.length > 0) {
          if (column.extractIsList) {
            // Multi-select for list fields
            return (
              <Dropdown
                ref={inputRef}
                selection
                multiple
                value={value || []}
                options={config.choices.map((choice: string) => ({
                  key: choice,
                  value: choice,
                  text: choice,
                }))}
                onChange={(e, { value }) => onChange(value)}
                onBlur={onBlur}
                placeholder={`Select ${column.name.toLowerCase()}`}
                fluid
                search
                disabled={readOnly}
              />
            );
          } else {
            // Single select for non-list fields
            return (
              <Dropdown
                ref={inputRef}
                selection
                value={value || ""}
                options={config.choices.map((choice: string) => ({
                  key: choice,
                  value: choice,
                  text: choice,
                }))}
                onChange={(e, { value }) => onChange(value)}
                onBlur={onBlur}
                placeholder={`Select ${column.name.toLowerCase()}`}
                fluid
                clearable
                search
                disabled={readOnly}
              />
            );
          }
        }
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
            readOnly={readOnly}
            // Remove Semantic icon injection; we'll render our own icon overlay
            className={onValidationChange ? "with-validation" : ""}
            input={{
              maxLength: config?.max_length,
            }}
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
            readOnly={readOnly}
          />
        );

      case MetadataDataType.NUMBER:
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
            readOnly={readOnly}
            className={onValidationChange ? "with-validation" : ""}
            input={{
              step: "1",
              min: config?.min_value,
              max: config?.max_value,
            }}
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
            readOnly={readOnly}
            className={onValidationChange ? "with-validation" : ""}
            input={{
              step: "0.01",
              min: config?.min_value,
              max: config?.max_value,
            }}
          />
        );

      case MetadataDataType.BOOLEAN:
        return (
          <Checkbox
            ref={inputRef}
            checked={value || false}
            onChange={(e, { checked }) => {
              onChange(checked);
              if (onBlur) setTimeout(onBlur, 100);
            }}
            onKeyDown={handleKeyDown}
            disabled={readOnly}
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
            readOnly={readOnly}
            className={onValidationChange ? "with-validation" : ""}
            input={{
              min: config?.min_date,
              max: config?.max_date,
            }}
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
            readOnly={readOnly}
            className={onValidationChange ? "with-validation" : ""}
            input={{
              min: config?.min_date,
              max: config?.max_date,
            }}
          />
        );

      case MetadataDataType.CHOICE:
        return (
          <Dropdown
            ref={inputRef}
            selection
            value={value || ""}
            options={
              config?.choices?.map((choice: string) => ({
                key: choice,
                value: choice,
                text: choice,
              })) || []
            }
            onChange={(e, { value }) => {
              onChange(value);
              if (onBlur) setTimeout(onBlur, 100);
            }}
            onBlur={onBlur}
            placeholder={`Select ${column.name.toLowerCase()}`}
            fluid
            clearable
            search
            disabled={readOnly}
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
              config?.choices?.map((choice: string) => ({
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
            disabled={readOnly}
          />
        );

      case MetadataDataType.JSON:
        return (
          <div style={{ position: "relative", width: "100%" }}>
            <TextArea
              ref={inputRef}
              value={
                typeof value === "string"
                  ? value
                  : JSON.stringify(value, null, 2)
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
                paddingRight: "2.5em",
              }}
              readOnly={readOnly}
              aria-label="JSON editor"
            />
            <div style={{ position: "absolute", top: "0.5em", right: "0.5em" }}>
              {renderValidationIcon()}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const editor = renderEditor();

  // Determine if icon is already rendered within editor (JSON textarea case)
  const iconAlreadyInside = column.dataType === MetadataDataType.JSON;

  return (
    <EditorContainer onClick={(e) => e.stopPropagation()}>
      {editor}
      {!iconAlreadyInside && renderValidationIcon()}
      {!isValid && validationMessage && (
        <ErrorLabel
          data-testid="validation-error-message"
          basic
          color="red"
          pointing
        >
          {validationMessage}
        </ErrorLabel>
      )}
    </EditorContainer>
  );
};
