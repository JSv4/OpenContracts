import React, { useState } from "react";
import { Button, Form, Input, Select } from "semantic-ui-react";
import { useMutation, useQuery } from "@apollo/client";
import { toast } from "react-toastify";
import { ColumnType, LanguageModelType } from "../graphql/types";
import { GET_LANGUAGEMODELS } from "../graphql/queries";
import {
  REQUEST_CREATE_COLUMN,
  REQUEST_UPDATE_COLUMN,
} from "../graphql/mutations";

interface ColumnDetailsProps {
  column?: ColumnType;
  fieldsetId: string;
  onSave: () => void;
}

export const ColumnDetails: React.FC<ColumnDetailsProps> = ({
  column,
  fieldsetId,
  onSave,
}) => {
  const [query, setQuery] = useState(column?.query || "");
  const [matchText, setMatchText] = useState(column?.matchText || "");
  const [outputType, setOutputType] = useState(column?.outputType || "");
  const [limitToLabel, setLimitToLabel] = useState(column?.limitToLabel || "");
  const [instructions, setInstructions] = useState(column?.instructions || "");
  const [languageModelId, setLanguageModelId] = useState(
    column?.languageModel.id || ""
  );
  const [agentic, setAgentic] = useState(column?.agentic || false);

  const { data: languageModelsData } = useQuery<{
    languageModels: LanguageModelType[];
  }>(GET_LANGUAGEMODELS);

  const [createColumn] = useMutation(REQUEST_CREATE_COLUMN);
  const [updateColumn] = useMutation(REQUEST_UPDATE_COLUMN);

  const handleSave = async () => {
    try {
      if (column) {
        await updateColumn({
          variables: {
            id: column.id,
            query,
            matchText,
            outputType,
            limitToLabel,
            instructions,
            languageModelId,
            agentic,
          },
        });
      } else {
        await createColumn({
          variables: {
            fieldsetId,
            query,
            matchText,
            outputType,
            limitToLabel,
            instructions,
            languageModelId,
            agentic,
          },
        });
      }
      onSave();
      toast.success("Column saved successfully");
    } catch (error) {
      toast.error("Error saving column");
    }
  };

  return (
    <Form>
      <Form.Field>
        <label>Query</label>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} />
      </Form.Field>
      <Form.Field>
        <label>Match Text</label>
        <Input
          value={matchText}
          onChange={(e) => setMatchText(e.target.value)}
        />
      </Form.Field>
      <Form.Field>
        <label>Output Type</label>
        <Input
          value={outputType}
          onChange={(e) => setOutputType(e.target.value)}
        />
      </Form.Field>
      <Form.Field>
        <label>Limit to Label</label>
        <Input
          value={limitToLabel}
          onChange={(e) => setLimitToLabel(e.target.value)}
        />
      </Form.Field>
      <Form.Field>
        <label>Instructions</label>
        <Input
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </Form.Field>
      <Form.Field>
        <label>Language Model</label>
        <Select
          value={languageModelId}
          options={
            languageModelsData?.languageModels
              ? languageModelsData.languageModels.map((model) => ({
                  value: model.id,
                  text: model.model,
                }))
              : []
          }
          onChange={(_, { value }) => setLanguageModelId(value as string)}
        />
      </Form.Field>
      <Form.Field>
        <label>Agentic</label>
        <input
          type="checkbox"
          checked={agentic}
          onChange={(e) => setAgentic(e.target.checked)}
        />
      </Form.Field>
      <Button primary onClick={handleSave}>
        Save
      </Button>
    </Form>
  );
};
