import React, { useState } from "react";
import { Button, Form, Grid, DropdownProps } from "semantic-ui-react";

interface FieldType {
  fieldName: string;
  fieldType: string;
}

interface ModelFieldBuilderProps {
  onFieldsChange: (fields: FieldType[]) => void;
  initialFields?: FieldType[];
}

/**
 * Component for building custom model fields.
 *
 * @param onFieldsChange - Callback when fields are updated.
 * @param initialFields - Optional initial fields to populate.
 */
export const ModelFieldBuilder: React.FC<ModelFieldBuilderProps> = ({
  onFieldsChange,
  initialFields = [],
}) => {
  const [fields, setFields] = useState<FieldType[]>(initialFields);

  /**
   * Adds a new empty field to the fields array.
   */
  const addField = () => {
    setFields([...fields, { fieldName: "", fieldType: "str" }]);
  };

  /**
   * Removes a field from the fields array at the specified index.
   *
   * @param index - The index of the field to remove.
   */
  const removeField = (index: number) => {
    const newFields = [...fields];
    newFields.splice(index, 1);
    setFields(newFields);
    onFieldsChange(newFields);
  };

  /**
   * Updates a field's name or type.
   *
   * @param index - The index of the field to update.
   * @param key - The key to update ("fieldName" or "fieldType").
   * @param value - The new value.
   */
  const updateField = (
    index: number,
    key: "fieldName" | "fieldType",
    value: string
  ) => {
    const newFields = [...fields];
    newFields[index][key] = value;
    setFields(newFields);
    onFieldsChange(newFields);
  };

  return (
    <Form>
      <Grid>
        {fields.map((field, index) => (
          <Grid.Row key={index}>
            <Grid.Column width={6}>
              <Form.Input
                placeholder="Field Name"
                value={field.fieldName}
                onChange={(e, { value }) =>
                  updateField(index, "fieldName", value)
                }
                required
              />
            </Grid.Column>
            <Grid.Column width={6}>
              <Form.Select
                placeholder="Field Type"
                value={field.fieldType}
                options={[
                  { key: "int", text: "int", value: "int" },
                  { key: "float", text: "float", value: "float" },
                  { key: "str", text: "str", value: "str" },
                  { key: "bool", text: "bool", value: "bool" },
                ]}
                onChange={(
                  e: React.SyntheticEvent<HTMLElement>,
                  data: DropdownProps
                ) => updateField(index, "fieldType", data.value as string)}
                required
              />
            </Grid.Column>
            <Grid.Column width={4}>
              <Button
                icon="trash"
                color="red"
                onClick={() => removeField(index)}
              />
            </Grid.Column>
          </Grid.Row>
        ))}
        <Grid.Row>
          <Grid.Column>
            <Button
              type="button"
              onClick={addField}
              primary
              icon="add"
              content="Add Field"
            />
          </Grid.Column>
        </Grid.Row>
      </Grid>
    </Form>
  );
};
