import React, { useState, useEffect } from "react";
import {
  Modal,
  Form,
  Button,
  Icon,
  Message,
  Segment,
  Label,
  TextArea,
} from "semantic-ui-react";
import styled from "styled-components";
import {
  MetadataColumn,
  MetadataDataType,
  getDefaultValueForDataType,
} from "../../../types/metadata";

interface MetadataColumnModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (column: Partial<MetadataColumn>) => void;
  column?: MetadataColumn | null;
}

const dataTypeOptions = [
  { key: "STRING", value: "STRING", text: "Short Text", icon: "font" },
  { key: "TEXT", value: "TEXT", text: "Long Text", icon: "align left" },
  { key: "INTEGER", value: "INTEGER", text: "Whole Number", icon: "hashtag" },
  { key: "FLOAT", value: "FLOAT", text: "Decimal Number", icon: "calculator" },
  { key: "BOOLEAN", value: "BOOLEAN", text: "Yes/No", icon: "toggle on" },
  { key: "DATE", value: "DATE", text: "Date", icon: "calendar" },
  {
    key: "DATETIME",
    value: "DATETIME",
    text: "Date & Time",
    icon: "calendar times",
  },
  { key: "CHOICE", value: "CHOICE", text: "Single Choice", icon: "dot circle" },
  {
    key: "MULTI_CHOICE",
    value: "MULTI_CHOICE",
    text: "Multiple Choice",
    icon: "list ul",
  },
  { key: "URL", value: "URL", text: "Web Link", icon: "linkify" },
  { key: "EMAIL", value: "EMAIL", text: "Email Address", icon: "mail" },
  { key: "JSON", value: "JSON", text: "JSON Data", icon: "code" },
];

const ValidationSection = styled(Segment)`
  &.ui.segment {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
  }
`;

const ChoiceInput = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;

  input {
    flex: 1;
    margin-right: 0.5rem;
  }
`;

const ChoiceList = styled.div`
  margin-top: 1rem;
`;

export const MetadataColumnModal: React.FC<MetadataColumnModalProps> = ({
  open,
  onClose,
  onSave,
  column,
}) => {
  const [name, setName] = useState("");
  const [dataType, setDataType] = useState<MetadataDataType>(
    MetadataDataType.STRING
  );
  const [helpText, setHelpText] = useState("");
  const [required, setRequired] = useState(false);
  const [minLength, setMinLength] = useState<number | undefined>();
  const [maxLength, setMaxLength] = useState<number | undefined>();
  const [minValue, setMinValue] = useState<number | undefined>();
  const [maxValue, setMaxValue] = useState<number | undefined>();
  const [regexPattern, setRegexPattern] = useState("");
  const [choices, setChoices] = useState<string[]>([""]);
  const [defaultValue, setDefaultValue] = useState<any>();
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when modal opens/closes or column changes
  useEffect(() => {
    if (column) {
      setName(column.name);
      setDataType(column.dataType);
      setHelpText(column.helpText || "");
      setRequired(column.validationConfig?.required || false);
      setMinLength(column.validationConfig?.min_length);
      setMaxLength(column.validationConfig?.max_length);
      setMinValue(column.validationConfig?.min_value);
      setMaxValue(column.validationConfig?.max_value);
      setRegexPattern(column.validationConfig?.regex_pattern || "");
      setChoices(column.validationConfig?.choices || [""]);
      setDefaultValue(column.defaultValue);
    } else {
      // Reset to defaults for new column
      setName("");
      setDataType(MetadataDataType.STRING);
      setHelpText("");
      setRequired(false);
      setMinLength(undefined);
      setMaxLength(undefined);
      setMinValue(undefined);
      setMaxValue(undefined);
      setRegexPattern("");
      setChoices([""]);
      setDefaultValue(undefined);
    }
    setErrors({});
  }, [open, column]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Field name is required";
    }

    if (
      dataType === MetadataDataType.CHOICE ||
      dataType === MetadataDataType.MULTI_CHOICE
    ) {
      const validChoices = choices.filter((c) => c.trim());
      if (validChoices.length < 2) {
        newErrors.choices = "At least 2 choices are required";
      }
    }

    if (regexPattern) {
      try {
        new RegExp(regexPattern);
      } catch {
        newErrors.regex = "Invalid regular expression pattern";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;

    const validationConfig: any = { required };

    // Add type-specific validation
    switch (dataType) {
      case MetadataDataType.STRING:
      case MetadataDataType.TEXT:
        if (minLength !== undefined) validationConfig.min_length = minLength;
        if (maxLength !== undefined) validationConfig.max_length = maxLength;
        if (regexPattern) validationConfig.regex_pattern = regexPattern;
        break;
      case MetadataDataType.INTEGER:
      case MetadataDataType.FLOAT:
        if (minValue !== undefined) validationConfig.min_value = minValue;
        if (maxValue !== undefined) validationConfig.max_value = maxValue;
        break;
      case MetadataDataType.CHOICE:
      case MetadataDataType.MULTI_CHOICE:
        validationConfig.choices = choices.filter((c) => c.trim());
        break;
    }

    onSave({
      name,
      dataType,
      helpText: helpText || undefined,
      validationConfig,
      defaultValue:
        defaultValue !== undefined
          ? defaultValue
          : getDefaultValueForDataType(dataType),
    });
  };

  const addChoice = () => {
    setChoices([...choices, ""]);
  };

  const updateChoice = (index: number, value: string) => {
    const newChoices = [...choices];
    newChoices[index] = value;
    setChoices(newChoices);
  };

  const removeChoice = (index: number) => {
    if (choices.length > 1) {
      setChoices(choices.filter((_, i) => i !== index));
    }
  };

  const renderValidationFields = () => {
    switch (dataType) {
      case MetadataDataType.STRING:
      case MetadataDataType.TEXT:
        return (
          <>
            <Form.Group widths="equal">
              <Form.Input
                label="Minimum Length"
                type="number"
                min="0"
                value={minLength || ""}
                onChange={(e, { value }) =>
                  setMinLength(value ? parseInt(value) : undefined)
                }
                placeholder="No minimum"
              />
              <Form.Input
                label="Maximum Length"
                type="number"
                min="0"
                value={maxLength || ""}
                onChange={(e, { value }) =>
                  setMaxLength(value ? parseInt(value) : undefined)
                }
                placeholder="No maximum"
              />
            </Form.Group>
            {dataType === MetadataDataType.STRING && (
              <Form.Input
                label="Pattern (Regular Expression)"
                value={regexPattern}
                onChange={(e, { value }) => setRegexPattern(value)}
                placeholder="e.g., ^[A-Z]{2}-\d{4}$"
                error={errors.regex}
              />
            )}
          </>
        );

      case MetadataDataType.INTEGER:
      case MetadataDataType.FLOAT:
        return (
          <Form.Group widths="equal">
            <Form.Input
              label="Minimum Value"
              type="number"
              step={dataType === MetadataDataType.FLOAT ? "0.01" : "1"}
              value={minValue ?? ""}
              onChange={(e, { value }) =>
                setMinValue(value ? parseFloat(value) : undefined)
              }
              placeholder="No minimum"
            />
            <Form.Input
              label="Maximum Value"
              type="number"
              step={dataType === MetadataDataType.FLOAT ? "0.01" : "1"}
              value={maxValue ?? ""}
              onChange={(e, { value }) =>
                setMaxValue(value ? parseFloat(value) : undefined)
              }
              placeholder="No maximum"
            />
          </Form.Group>
        );

      case MetadataDataType.CHOICE:
      case MetadataDataType.MULTI_CHOICE:
        return (
          <div>
            <label>
              <strong>Choices</strong>
              {errors.choices && (
                <Label pointing basic color="red" size="tiny">
                  {errors.choices}
                </Label>
              )}
            </label>
            <ChoiceList>
              {choices.map((choice, index) => (
                <ChoiceInput key={index}>
                  <Form.Input
                    value={choice}
                    onChange={(e, { value }) => updateChoice(index, value)}
                    placeholder={`Choice ${index + 1}`}
                  />
                  <Button
                    icon="trash"
                    size="tiny"
                    negative
                    disabled={choices.length === 1}
                    onClick={() => removeChoice(index)}
                  />
                </ChoiceInput>
              ))}
              <Button size="small" onClick={addChoice}>
                <Icon name="plus" />
                Add Choice
              </Button>
            </ChoiceList>
          </div>
        );

      case MetadataDataType.BOOLEAN:
        return (
          <Form.Checkbox
            label="Default Value"
            checked={defaultValue || false}
            onChange={(e, { checked }) => setDefaultValue(checked)}
          />
        );

      default:
        return null;
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="small">
      <Modal.Header>
        <Icon name="database" />
        {column ? "Edit Metadata Field" : "Create Metadata Field"}
      </Modal.Header>
      <Modal.Content>
        <Form>
          <Form.Input
            label="Field Name"
            value={name}
            onChange={(e, { value }) => setName(value)}
            placeholder="e.g., Contract Status, Due Date, Priority"
            required
            error={errors.name}
          />

          <Form.Dropdown
            label="Data Type"
            selection
            options={dataTypeOptions}
            value={dataType}
            onChange={(e, { value }) => setDataType(value as MetadataDataType)}
            disabled={!!column} // Can't change type after creation
          />

          <Form.Field>
            <label>Help Text</label>
            <TextArea
              value={helpText}
              onChange={(e, { value }) => setHelpText(value as string)}
              placeholder="Provide guidance for users filling out this field..."
              rows={2}
            />
          </Form.Field>

          <ValidationSection>
            <h4>Validation Rules</h4>
            <Form.Checkbox
              label="Required Field"
              checked={required}
              onChange={(e, { checked }) => setRequired(checked || false)}
            />

            {renderValidationFields()}
          </ValidationSection>

          {dataType !== MetadataDataType.BOOLEAN &&
            !["CHOICE", "MULTI_CHOICE"].includes(dataType) && (
              <Message info>
                <Message.Header>Default Value</Message.Header>
                <p>
                  You can set default values for individual documents when
                  editing metadata.
                </p>
              </Message>
            )}
        </Form>
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={onClose}>Cancel</Button>
        <Button primary onClick={handleSave}>
          <Icon name="save" />
          {column ? "Update Field" : "Create Field"}
        </Button>
      </Modal.Actions>
    </Modal>
  );
};
