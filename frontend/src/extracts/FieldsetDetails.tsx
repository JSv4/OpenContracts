import React from "react";
import { Button, Form, Input } from "semantic-ui-react";
import { useMutation } from "@apollo/client";
import { toast } from "react-toastify";

import { ColumnDetails } from "./ColumnDetails";
import { REQUEST_UPDATE_FIELDSET } from "../graphql/mutations";
import { ColumnType, FieldsetType } from "../graphql/types";

interface FieldsetDetailsProps {
  fieldset: FieldsetType;
  onSave: () => void;
}

export const FieldsetDetails: React.FC<FieldsetDetailsProps> = ({
  fieldset,
  onSave,
}) => {
  const [updateFieldset] = useMutation(REQUEST_UPDATE_FIELDSET);

  const handleSave = async (name: string, description: string) => {
    try {
      await updateFieldset({
        variables: {
          id: fieldset.id,
          name,
          description,
        },
      });
      onSave();
      toast.success("Fieldset saved successfully");
    } catch (error) {
      toast.error("Error saving fieldset");
    }
  };

  return (
    <div>
      <Form>
        <Form.Field>
          <label>Name</label>
          <Input
            value={fieldset.name}
            onChange={(e) => handleSave(e.target.value, fieldset.description)}
          />
        </Form.Field>
        <Form.Field>
          <label>Description</label>
          <Input
            value={fieldset.description}
            onChange={(e) => handleSave(fieldset.name, e.target.value)}
          />
        </Form.Field>
      </Form>
      <h3>Columns</h3>
      {fieldset.columns.edges.map((columnEdge) => (
        <ColumnDetails
          key={columnEdge.node.id}
          column={columnEdge.node}
          fieldsetId={fieldset.id}
          onSave={onSave}
        />
      ))}
      <Button primary onClick={() => {}}>
        Add Column
      </Button>
    </div>
  );
};
