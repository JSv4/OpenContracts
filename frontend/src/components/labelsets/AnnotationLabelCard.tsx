import { useState } from "react";
import {
  Button,
  Header,
  Grid,
  Icon,
  Card,
  Form,
  TextArea,
  Popup,
  Segment,
  Label,
  CardProps,
  TextAreaProps,
  InputOnChangeData,
} from "semantic-ui-react";
import _ from "lodash";

import { IconDropdown } from "../widgets/icon-picker/index";
import { VerticallyCenteredDiv } from "../common";
import { ColorPickerSegment } from "../widgets/color-picker/ColorPickerSegment";
import { AnnotationLabelType } from "../../types/graphql-api";
import { UpdateAnnotationLabelInputs } from "../../graphql/mutations";
import { getPermissions } from "../../utils/transform";
import { PermissionTypes } from "../types";

interface AnnotationLabelCardProps {
  label: AnnotationLabelType;
  selected: boolean;
  onSelect: (args: any) => any | void;
  onDelete: (args: any) => any | void;
  onSave: (revised_obj: UpdateAnnotationLabelInputs) => void | any;
}

export function AnnotationLabelCard({
  label,
  selected,
  onSelect,
  onDelete,
  onSave: onLabelUpdate,
}: AnnotationLabelCardProps) {
  const [edit_mode, setEditMode] = useState<boolean>(false);
  const [revised_obj, setRevisedObj] = useState<Record<string, any>>(label);

  const my_permissions = getPermissions(
    label?.myPermissions ? label.myPermissions : []
  );
  const can_edit = my_permissions.includes(PermissionTypes.CAN_UPDATE);
  const can_delete = my_permissions.includes(PermissionTypes.CAN_REMOVE);

  const cardClickHandler = (
    event: React.MouseEvent<HTMLAnchorElement, MouseEvent>,
    value: CardProps
  ) => {
    event.stopPropagation();
    if (event.shiftKey) {
      if (onSelect && _.isFunction(onSelect)) {
        onSelect(label.id);
      }
    }
  };

  const updateLocalObj = (updates: Record<string, any>) => {
    setRevisedObj((revised_obj) => ({ ...revised_obj, ...updates }));
  };

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    data: TextAreaProps | InputOnChangeData,
    name: string
  ) => {
    updateLocalObj({ [name]: data.value });
  };

  const handleSave = () => {
    // console.log("Revised_obj", revised_obj);
    onLabelUpdate(revised_obj as UpdateAnnotationLabelInputs);
    setEditMode(false);
  };

  return (
    <Card fluid key={label.id} onClick={cardClickHandler}>
      <div
        style={{
          position: "absolute",
          right: "1rem",
          top: "1rem",
          zIndex: 1000,
        }}
      >
        {can_edit ? (
          <Button icon="edit" circular onClick={() => setEditMode(true)} />
        ) : (
          <></>
        )}
        {can_edit && edit_mode ? (
          <Button
            icon="save"
            color="green"
            circular
            onClick={() => handleSave()}
          />
        ) : (
          <></>
        )}
        {can_delete ? (
          <Button
            icon="trash"
            color="red"
            circular
            onClick={() => onDelete([label.id])}
          />
        ) : (
          <></>
        )}
      </div>
      <Card.Content>
        {selected ? (
          <Label icon="check circle" corner="right" color="green" />
        ) : (
          <></>
        )}
        <Card.Description>
          {edit_mode && can_edit ? (
            <Grid centered divided>
              <Grid.Column textAlign="center" width={4}>
                <Popup
                  trigger={
                    <VerticallyCenteredDiv>
                      <div
                        style={{
                          width: "100%",
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Icon
                          size="massive"
                          name={revised_obj?.icon}
                          style={{ color: revised_obj?.color }}
                        />
                      </div>
                      <div
                        style={{
                          width: "100%",
                          display: "flex",
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          marginTop: "1rem",
                        }}
                      >
                        <Label
                          style={{
                            backgroundColor: revised_obj?.color,
                            color: "white",
                          }}
                        >
                          Highlight Color
                        </Label>
                      </div>
                    </VerticallyCenteredDiv>
                  }
                  flowing
                  hoverable
                  style={{ width: "20vw" }}
                >
                  <Segment>
                    <div>
                      <strong>Highlight Color:</strong>
                      <ColorPickerSegment
                        color={revised_obj?.color}
                        setColor={(color) =>
                          updateLocalObj({ color: color.hex })
                        }
                      />
                    </div>
                    <div style={{ marginTop: "1rem" }}>
                      <strong>Icon:</strong>
                      <IconDropdown
                        value={revised_obj?.icon}
                        onChange={(icon) => updateLocalObj({ icon })}
                        style={{ width: "20vw" }}
                      />
                    </div>
                  </Segment>
                </Popup>
              </Grid.Column>
              <Grid.Column textAlign="left" width={12}>
                <Grid>
                  <Grid.Row>
                    <Grid.Column textAlign="left">
                      <Form>
                        <Header as="h3">Title:</Header>
                        <Form.Group>
                          <Form.Input
                            placeholder="Title"
                            name="text"
                            value={revised_obj?.text}
                            onChange={(
                              event: React.ChangeEvent<HTMLInputElement>,
                              data: InputOnChangeData
                            ) => handleChange(event, data, "text")}
                          />
                        </Form.Group>
                      </Form>
                    </Grid.Column>
                  </Grid.Row>
                  <Grid.Row>
                    <Grid.Column textAlign="left">
                      <Form>
                        <Header as="h3">Description:</Header>
                        <TextArea
                          rows={2}
                          label="Description:"
                          name="description"
                          placeholder="Describe what this label does"
                          value={revised_obj?.description}
                          onChange={(
                            event: React.ChangeEvent<HTMLTextAreaElement>,
                            data: TextAreaProps
                          ) => handleChange(event, data, "description")}
                        />
                      </Form>
                    </Grid.Column>
                  </Grid.Row>
                </Grid>
              </Grid.Column>
            </Grid>
          ) : (
            <Grid centered divided>
              <Grid.Column textAlign="center" width={4}>
                <VerticallyCenteredDiv>
                  <div
                    style={{
                      width: "100%",
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon
                      size="massive"
                      name={label?.icon}
                      style={{ color: revised_obj?.color }}
                    />
                  </div>
                  <div
                    style={{
                      width: "100%",
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: "1rem",
                    }}
                  >
                    <Label
                      style={{
                        backgroundColor: revised_obj?.color,
                        color: "white",
                      }}
                    >
                      Highlight Color
                    </Label>
                  </div>
                </VerticallyCenteredDiv>
              </Grid.Column>
              <Grid.Column textAlign="left" width={12}>
                <Grid>
                  <Grid.Row>
                    <Grid.Column textAlign="left">
                      <Header as="h3">Title: </Header>
                      {label?.text}
                    </Grid.Column>
                  </Grid.Row>
                  <Grid.Row>
                    <Grid.Column textAlign="left">
                      <Header as="h3">Description: </Header>
                      <p>{label?.description}</p>
                    </Grid.Column>
                  </Grid.Row>
                </Grid>
              </Grid.Column>
            </Grid>
          )}
        </Card.Description>
      </Card.Content>
    </Card>
  );
}
