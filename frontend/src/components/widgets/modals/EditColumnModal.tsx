import React, { useEffect, useState } from "react";
import {
  Modal,
  Form,
  FormInput,
  TextArea,
  FormGroup,
  FormField,
  TextAreaProps,
  InputOnChangeData,
  Checkbox,
  Grid,
  Button,
} from "semantic-ui-react";
import { ColumnType } from "../../../types/graphql-api";
import { ExtractTaskDropdown } from "../selectors/ExtractTaskDropdown";

interface EditColumnModalProps {
  existing_column: ColumnType;
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ColumnType) => void;
}

export const EditColumnModal: React.FC<EditColumnModalProps> = ({
  open,
  existing_column,
  onClose,
  onSubmit,
}) => {
  const [objData, setObjData] = useState<ColumnType>(existing_column);

  useEffect(() => {
    setObjData(existing_column);
  }, [existing_column]);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    data: TextAreaProps | InputOnChangeData,
    name: string
  ) => {
    setObjData((oldObj) => {
      return { ...oldObj, [name]: data.value };
    });
  };

  const handleSubmit = () => {
    console.log("Submit data", objData);
    onSubmit(objData);
  };

  return (
    <Modal open={open} onClose={onClose}>
      <Modal.Header>Edit Column</Modal.Header>
      <Modal.Content>
        <Grid centered divided>
          <Grid.Column>
            <Grid.Row>
              <Form>
                <FormGroup>
                  <FormInput
                    placeholder="Name"
                    name="name"
                    value={objData.name}
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
                    value={objData.outputType}
                    onChange={(
                      event: React.ChangeEvent<HTMLTextAreaElement>,
                      data: TextAreaProps
                    ) =>
                      setObjData({ ...objData, outputType: `${data.value}` })
                    }
                  />
                  <FormField>
                    <label>Language Model</label>
                    <ExtractTaskDropdown
                      onChange={(taskName: string | null) => {
                        if (taskName) {
                          setObjData((oldObj) => {
                            return { ...oldObj, taskName };
                          });
                        }
                      }}
                      taskName={objData.taskName}
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
                  value={objData.query ? objData.query : ""}
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
                  value={objData.matchText ? objData.matchText : ""}
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
                  value={objData.instructions ? objData.instructions : ""}
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
                      checked={
                        objData.agentic !== undefined ? objData.agentic : false
                      }
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
                      value={objData.limitToLabel ? objData.limitToLabel : ""}
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
