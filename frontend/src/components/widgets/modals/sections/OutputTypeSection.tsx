import React from "react";
import { Grid, Form } from "semantic-ui-react";
import { FormSection, SectionTitle, StyledFormField } from "../styled";
import { FieldType, ModelFieldBuilder } from "../../ModelFieldBuilder";

interface OutputTypeSectionProps {
  outputTypeOption: string;
  extractIsList: boolean;
  primitiveType: string;
  handleOutputTypeChange: (
    e: React.FormEvent<HTMLInputElement>,
    data: any
  ) => void;
  handleChange: (
    e: React.SyntheticEvent<HTMLElement>,
    data: any,
    fieldName: string
  ) => void;
  setFormData: (
    updater: (prev: Record<string, any>) => Record<string, any>
  ) => void;
  initialFields?: FieldType[];
}

/**
 * Generates the final output type string based on the selected options
 */
const generateOutputType = (
  outputTypeOption: string,
  primitiveType: string,
  fields: any[]
): string => {
  if (outputTypeOption === "primitive") {
    return primitiveType;
  }

  // Generate Pydantic model
  const fieldLines = fields
    .map((field) => `    ${field.fieldName}: ${field.fieldType}`)
    .join("\n");
  return `class CustomModel(BaseModel):\n${fieldLines}`;
};

export const OutputTypeSection: React.FC<OutputTypeSectionProps> = ({
  outputTypeOption,
  extractIsList,
  primitiveType,
  handleOutputTypeChange,
  handleChange,
  setFormData,
  initialFields = [],
}) => {
  const handleFieldsChange = (fields: any[]) => {
    setFormData((prev) => ({
      ...prev,
      fields,
      outputType: generateOutputType(outputTypeOption, primitiveType, fields),
    }));
  };

  // Update output type when primitive type changes
  React.useEffect(() => {
    if (outputTypeOption === "primitive") {
      setFormData((prev) => ({
        ...prev,
        outputType: generateOutputType(outputTypeOption, primitiveType, []),
      }));
    }
  }, [primitiveType, outputTypeOption]);

  return (
    <FormSection>
      <SectionTitle>Output Type Configuration</SectionTitle>
      <Grid>
        <Grid.Row>
          <Grid.Column width={16}>
            <Form.Group inline>
              <label>Select Type:</label>
              <Form.Radio
                label="Primitive Type"
                value="primitive"
                checked={outputTypeOption === "primitive"}
                onChange={handleOutputTypeChange}
              />
              <Form.Radio
                label="Custom Model"
                value="custom"
                checked={outputTypeOption === "custom"}
                onChange={handleOutputTypeChange}
              />
            </Form.Group>
          </Grid.Column>
        </Grid.Row>

        <Grid.Row>
          <Grid.Column width={16}>
            <Form.Checkbox
              label="List of Values"
              checked={extractIsList}
              onChange={(e, data) => handleChange(e, data, "extractIsList")}
            />
          </Grid.Column>
        </Grid.Row>

        {outputTypeOption === "primitive" && (
          <Grid.Row>
            <Grid.Column width={8}>
              <StyledFormField>
                <label>Primitive Type</label>
                <Form.Select
                  options={[
                    { key: "str", text: "String", value: "str" },
                    { key: "int", text: "Integer", value: "int" },
                    { key: "float", text: "Float", value: "float" },
                    { key: "bool", text: "Boolean", value: "bool" },
                  ]}
                  value={primitiveType}
                  onChange={(e, data) => handleChange(e, data, "primitiveType")}
                  placeholder="Select primitive type"
                />
              </StyledFormField>
            </Grid.Column>
          </Grid.Row>
        )}

        {outputTypeOption === "custom" && (
          <Grid.Row>
            <Grid.Column width={16}>
              <ModelFieldBuilder
                onFieldsChange={handleFieldsChange}
                initialFields={initialFields}
              />
            </Grid.Column>
          </Grid.Row>
        )}
      </Grid>
    </FormSection>
  );
};
