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
} from "semantic-ui-react";
import { LanguageModelDropdown } from "../selectors/LanguageModelDropdown";
import { LooseObject } from "../../types";
import { fontWeight } from "../../../theme/fonts";
import { ColumnType } from "../../../graphql/types";

interface CreateColumnModalProps {
  open: boolean;
  existing_column?: ColumnType;
  onClose: () => void;
  onSubmit: (data: any) => void;
}

export const CreateColumnModal: React.FC<CreateColumnModalProps> = ({
  open,
  existing_column,
  onClose,
  onSubmit,
}) => {
  const [objData, setObjData] = useState<LooseObject>(
    existing_column ? existing_column : {}
  );

  useEffect(() => {
    if (existing_column) {
      setObjData(existing_column);
    } else {
      setObjData({});
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
    languageModelId,
    mustContainText,
  } = objData;

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    data: any,
    name: string
  ) => {
    setObjData({ ...objData, [name]: data.value });
  };

  const handleSubmit = () => {
    console.log("Submit data", objData);
    onSubmit(objData);
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
                  <label>Language Model</label>
                  <LanguageModelDropdown
                    onChange={(id: string) =>
                      setObjData({ ...objData, languageModelId: id })
                    }
                    languageModelId={languageModelId}
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
