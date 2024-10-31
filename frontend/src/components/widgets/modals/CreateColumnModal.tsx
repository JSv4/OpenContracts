import React, { useEffect, useState } from "react";
import {
  Modal,
  Form,
  Input,
  TextArea,
  Grid,
  Button,
  Header,
  Checkbox,
  Popup,
  Icon,
  CheckboxProps,
} from "semantic-ui-react";
import { ExtractTaskDropdown } from "../selectors/ExtractTaskDropdown";
import { ModelFieldBuilder } from "../ModelFieldBuilder";
import { LooseObject } from "../../types";

interface CreateColumnModalProps {
  open: boolean;
  existing_column?: ColumnType;
  onClose: () => void;
  onSubmit: (data: any) => void;
}

interface ColumnType extends LooseObject {
  isCustomModel?: boolean;
  fields?: FieldType[];
}

interface FieldType {
  fieldName: string;
  fieldType: string;
}

/**
 * Modal component for creating a new data extract column.
 *
 * @param open - Whether the modal is open.
 * @param existing_column - An existing column to edit.
 * @param onClose - Function to call when closing the modal.
 * @param onSubmit - Function to call with the data upon form submission.
 */
export const CreateColumnModal: React.FC<CreateColumnModalProps> = ({
  open,
  existing_column,
  onClose,
  onSubmit,
}) => {
  const [objData, setObjData] = useState<LooseObject>(
    existing_column ? existing_column : {}
  );
  const [outputTypeOption, setOutputTypeOption] = useState<string>(
    existing_column && existing_column.isCustomModel ? "custom" : "primitive"
  );

  useEffect(() => {
    if (existing_column) {
      setObjData(existing_column);
      setOutputTypeOption(
        existing_column.isCustomModel ? "custom" : "primitive"
      );
    } else {
      setObjData({});
      setOutputTypeOption("primitive");
    }
  }, [existing_column]);

  const {
    name,
    query,
    matchText,
    outputType,
    limitToLabel,
    instructions,
    agentic,
    extractIsList,
    mustContainText,
    taskName,
    fields,
  } = objData;

  /**
   * Handles input changes for text, textarea, and select fields.
   *
   * @param event - The event object.
   * @param data - The data from the input.
   * @param name - The name of the field.
   */
  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    data: any,
    name: string
  ) => {
    setObjData({ ...objData, [name]: data.value });
  };

  /**
   * Handles changes to the output type selection (primitive or custom model).
   *
   * @param e - The event object.
   * @param data - The data from the input, containing value and other properties.
   */
  const handleOutputTypeChange = (
    e: React.FormEvent<HTMLInputElement>,
    data: CheckboxProps
  ) => {
    const { value } = data;

    if (typeof value === "string") {
      setOutputTypeOption(value);
      // Reset outputType and fields when switching options
      setObjData({ ...objData, outputType: "", fields: [] });
    } else {
      console.error("Unexpected value in handleOutputTypeChange:", value);
    }
  };

  /**
   * Handles changes to the custom model fields.
   *
   * @param updatedFields - The updated array of fields.
   */
  const handleFieldsChange = (updatedFields: FieldType[]) => {
    setObjData({ ...objData, fields: updatedFields });
  };

  /**
   * Validates the custom model fields.
   *
   * @returns A boolean indicating if the fields are valid.
   */
  const validateFields = (): boolean => {
    if (outputTypeOption === "custom" && (!fields || fields.length === 0)) {
      return false;
    }
    return true;
  };

  /**
   * Handles form submission, preparing the data to be sent.
   */
  const handleSubmit = () => {
    if (!validateFields()) {
      alert("Please add at least one field to your custom model.");
      return;
    }

    let finalOutputType = outputType;
    if (outputTypeOption === "custom" && fields) {
      const modelDefinition = fields
        .map((field: FieldType) => `${field.fieldName}: ${field.fieldType}`)
        .join("\n");
      finalOutputType = modelDefinition;
    }

    const submitData = {
      ...objData,
      outputType: finalOutputType,
      isCustomModel: outputTypeOption === "custom",
    };
    console.log("Submit data", submitData);
    onSubmit(submitData);
  };

  return (
    <Modal style={{ height: "70vh" }} open={open} closeIcon onClose={onClose}>
      <Modal.Header>Create a New Data Extract Column</Modal.Header>
      <Modal.Content style={{ overflowY: "scroll" }}>
        <Form>
          <Grid stackable>
            <Grid.Row>
              <Grid.Column width={8}>
                <Form.Field>
                  <label>Name</label>
                  <Input
                    placeholder="Enter column name"
                    name="name"
                    value={name}
                    onChange={(e, { value }) =>
                      setObjData({ ...objData, name: value })
                    }
                    fluid
                  />
                </Form.Field>
              </Grid.Column>
              <Grid.Column width={8}>
                <Form.Field>
                  <label>
                    Output Type
                    <Popup
                      trigger={<Icon name="question circle outline" />}
                      content="Specify the output type for the column. Currently we support Python primitives (e.g. int, str, boolean, float) or simple (non-nested) Pydantic models. Parser is still a WIP, so please keep it simple."
                    />
                  </label>
                  <Input
                    placeholder="e.g., str"
                    name="outputType"
                    value={outputType}
                    onChange={(e, { value }) =>
                      setObjData({ ...objData, outputType: value })
                    }
                    fluid
                  />
                </Form.Field>
              </Grid.Column>
            </Grid.Row>
            <Grid.Row>
              <Grid.Column width={16}>
                <Form.Field>
                  <label>Extract Task</label>
                  <ExtractTaskDropdown
                    onChange={(taskName: string | null) => {
                      if (taskName) {
                        setObjData({ ...objData, taskName });
                      }
                    }}
                    taskName={taskName}
                  />
                </Form.Field>
              </Grid.Column>
            </Grid.Row>
            <Grid.Row>
              <Grid.Column width={16}>
                <Header as="h4">Query</Header>
                <Form.Field>
                  <TextArea
                    rows={3}
                    name="query"
                    placeholder="What query shall we use to guide the LLM extraction?"
                    value={query}
                    onChange={(e, data) => handleChange(e, data, "query")}
                  />
                </Form.Field>
              </Grid.Column>
            </Grid.Row>
            <Grid.Row>
              <Grid.Column width={16}>
                <Header as="h4">Must Contain Text</Header>
                <Form.Field>
                  <TextArea
                    rows={3}
                    name="mustContainText"
                    placeholder="Only look in annotations that contain this string (case insensitive)?"
                    value={mustContainText}
                    onChange={(e, data) =>
                      handleChange(e, data, "mustContainText")
                    }
                  />
                </Form.Field>
              </Grid.Column>
            </Grid.Row>
            <Grid.Row>
              <Grid.Column width={16}>
                <Header as="h4">
                  Representative Example
                  <Popup
                    trigger={
                      <Icon
                        name="question circle outline"
                        size="tiny"
                        style={{ fontSize: "1rem" }}
                      />
                    }
                    content="Find text that is semantically similar to this example FIRST if provided. If not provided, query is used for RAG retrieval ('naive RAG' - not recommended)."
                  />
                </Header>
                <Form.Field>
                  <TextArea
                    rows={3}
                    name="matchText"
                    placeholder="Place example of text containing relevant data here."
                    value={matchText}
                    onChange={(e, data) => handleChange(e, data, "matchText")}
                  />
                </Form.Field>
              </Grid.Column>
            </Grid.Row>
            <Grid.Row>
              <Grid.Column width={16}>
                <Header as="h4">Parser Instructions</Header>
                <Form.Field>
                  <TextArea
                    rows={3}
                    name="instructions"
                    placeholder="Provide detailed instructions for extracting object properties here..."
                    value={instructions}
                    onChange={(e, data) =>
                      handleChange(e, data, "instructions")
                    }
                  />
                </Form.Field>
              </Grid.Column>
            </Grid.Row>
            <Grid.Row>
              <Grid.Column width={8}>
                <Form.Field>
                  <Checkbox
                    label={
                      <label>
                        Agentic (Extra API Calls)
                        <Popup
                          trigger={<Icon name="question circle outline" />}
                          content="Uses a LlamaIndex agent to attempt to find additional, referenced context from the retrieved text."
                        />
                      </label>
                    }
                    checked={agentic}
                    onChange={(_, data) =>
                      setObjData({
                        ...objData,
                        agentic: data.checked || false,
                      })
                    }
                  />
                </Form.Field>
              </Grid.Column>
              <Grid.Column width={8}>
                <Form.Field>
                  <Checkbox
                    label={
                      <label>
                        List of Values
                        <Popup
                          trigger={<Icon name="question circle outline" />}
                          content="Check if the column should extract a list of values of type output type"
                        />
                      </label>
                    }
                    checked={extractIsList}
                    onChange={(_, data) =>
                      setObjData({
                        ...objData,
                        extractIsList: data.checked || false,
                      })
                    }
                  />
                </Form.Field>
              </Grid.Column>
            </Grid.Row>
            <Grid.Row>
              <Grid.Column width={16}>
                <Form.Field>
                  <label>
                    Limit Search to Label
                    <Popup
                      trigger={<Icon name="question circle outline" />}
                      content="Specify a label name to limit the search scope"
                    />
                  </label>
                  <Input
                    placeholder="Enter label name"
                    name="limitToLabel"
                    value={limitToLabel}
                    onChange={(e, { value }) =>
                      setObjData({ ...objData, limitToLabel: value })
                    }
                    fluid
                  />
                </Form.Field>
              </Grid.Column>
            </Grid.Row>
            <Grid.Row>
              <Grid.Column width={16}>
                <Form.Field>
                  <label>Output Type</label>
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
                </Form.Field>
              </Grid.Column>
            </Grid.Row>
            {outputTypeOption === "primitive" && (
              <Grid.Row>
                <Grid.Column width={16}>
                  <Form.Field>
                    <label>
                      Primitive Type
                      <Popup
                        trigger={<Icon name="question circle outline" />}
                        content="Select one of the supported Python primitive types."
                      />
                    </label>
                    <Form.Select
                      placeholder="Select primitive type"
                      name="outputType"
                      value={outputType}
                      options={[
                        { key: "int", text: "int", value: "int" },
                        { key: "float", text: "float", value: "float" },
                        { key: "str", text: "str", value: "str" },
                        { key: "bool", text: "bool", value: "bool" },
                      ]}
                      onChange={(e, data) =>
                        setObjData({ ...objData, outputType: data.value })
                      }
                      fluid
                    />
                  </Form.Field>
                </Grid.Column>
              </Grid.Row>
            )}
            {outputTypeOption === "custom" && (
              <Grid.Row>
                <Grid.Column width={16}>
                  <Header as="h4">Define Custom Model Fields</Header>
                  <ModelFieldBuilder
                    onFieldsChange={handleFieldsChange}
                    initialFields={fields}
                  />
                </Grid.Column>
              </Grid.Row>
            )}
          </Grid>
        </Form>
      </Modal.Content>
      <Modal.Actions>
        <Button color="black" onClick={() => onClose()}>
          Cancel
        </Button>
        <Button
          content="Submit"
          labelPosition="right"
          icon="checkmark"
          onClick={handleSubmit}
          positive
        />
      </Modal.Actions>
    </Modal>
  );
};
