import React, { useState } from "react";
import {
  Modal,
  Form,
  FormInput,
  TextArea,
  FormGroup,
  FormButton,
  FormField,
  TextAreaProps,
  InputOnChangeData,
  Checkbox,
  Grid,
  Button,
} from "semantic-ui-react";
import { LanguageModelDropdown } from "../selectors/LanguageModelDropdown";
import { LooseObject } from "../../types";

interface CreateColumnModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
}

export const CreateColumnModal: React.FC<CreateColumnModalProps> = ({
  open,
  onClose,
  onSubmit,
}) => {
  const [objData, setObjData] = useState<LooseObject>({});

  const {
    name,
    query,
    matchText,
    outputType,
    limitToLabel,
    instructions,
    agentic,
    languageModelId,
  } = objData;

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    data: TextAreaProps | InputOnChangeData,
    name: string
  ) => {
    setObjData({ ...objData, [name]: data.value });
  };

  const handleSubmit = () => {
    console.log("Submit data", objData);
    onSubmit(objData);
  };

  return (
    <Modal open={open} onClose={onClose}>
      <Modal.Header>"Create a New Column"</Modal.Header>
      <Modal.Content>
        <Grid centered divided>
          <Grid.Column>
            <Grid.Row>
              <Form>
                <FormGroup>
                  <FormInput
                    placeholder="Name"
                    name="name"
                    value={name}
                    onChange={(e, { value }) =>
                      setObjData({ ...objData, name: value })
                    }
                    style={{ minWidth: "50vw important!" }}
                  />
                  <TextArea
                    rows={6}
                    name="outputType"
                    label="Output Type:"
                    placeholder="str"
                    value={outputType}
                    onChange={(
                      event: React.ChangeEvent<HTMLTextAreaElement>,
                      data: TextAreaProps
                    ) => setObjData({ ...objData, outputType: data.value })}
                  />
                  <FormField>
                    <label>Language Model</label>
                    <LanguageModelDropdown
                      onChange={(id: string) =>
                        setObjData({ ...objData, languageModelId: id })
                      }
                      languageModelId={languageModelId}
                    />
                  </FormField>
                </FormGroup>
              </Form>
            </Grid.Row>
            <Grid.Row>
              <Form>
                <TextArea
                  rows={3}
                  name="query"
                  label="Query:"
                  placeholder="What is the title of the document?"
                  value={query}
                  onChange={(
                    event: React.ChangeEvent<HTMLTextAreaElement>,
                    data: TextAreaProps
                  ) => handleChange(event, data, "query")}
                />
              </Form>
              <Form>
                <TextArea
                  rows={3}
                  name="matchText"
                  placeh
                  label="Representative Example:"
                  placeholder="Place example of text containing relevant data here."
                  value={matchText}
                  onChange={(
                    event: React.ChangeEvent<HTMLTextAreaElement>,
                    data: TextAreaProps
                  ) => handleChange(event, data, "matchText")}
                />
              </Form>
              <Form>
                <TextArea
                  rows={3}
                  name="instructions"
                  placeh
                  label="Parser Instructions:"
                  placeholder="Provide detailed instructions for extracting object properties here..."
                  value={instructions}
                  onChange={(
                    event: React.ChangeEvent<HTMLTextAreaElement>,
                    data: TextAreaProps
                  ) => handleChange(event, data, "matchText")}
                />
              </Form>
            </Grid.Row>
            <Grid.Row>
              <Grid columns={2}>
                <Grid.Column>
                  <Grid.Row>
                    <Checkbox
                      label="Agentic"
                      checked={agentic}
                      onChange={(_, data) =>
                        setObjData({
                          ...objData,
                          agentic: data.checked || false,
                        })
                      }
                    />
                  </Grid.Row>
                </Grid.Column>
                <Grid.Column>
                  <Grid.Row>
                    <FormInput
                      placeholder="Label Name To Limit Search To"
                      name="limitToLabel"
                      value={limitToLabel}
                      onChange={(e, { value }) =>
                        setObjData({ ...objData, limitToLabel: value })
                      }
                      style={{ minWidth: "50vw important!" }}
                    />
                  </Grid.Row>
                </Grid.Column>
              </Grid>
            </Grid.Row>
          </Grid.Column>
        </Grid>
        <Button
          content="Submit"
          style={{ marginTop: "1vh" }}
          onClick={handleSubmit}
        />
      </Modal.Content>
    </Modal>
  );
};
