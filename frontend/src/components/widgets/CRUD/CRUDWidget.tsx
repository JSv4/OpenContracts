import { Header, Icon, Grid, Segment, Label } from "semantic-ui-react";
import Form from "@rjsf/semantic-ui";
import _ from "lodash";

import {
  HorizontallyCenteredDiv,
  VerticallyCenteredDiv,
} from "../../layout/Wrappers";
import { FilePreviewAndUpload } from "../file-controls/FilePreviewAndUpload";
import { CRUDProps, LooseObject } from "../../types";

export interface CRUDWidgetProps extends CRUDProps {
  instance: Record<string, any>;
  show_header: boolean;
  handleInstanceChange: (a: any) => void;
}

export function CRUDWidget({
  mode,
  instance,
  model_name,
  has_file,
  file_field,
  file_label,
  file_is_image,
  accepted_file_types,
  ui_schema,
  data_schema,
  show_header,
  handleInstanceChange,
}: CRUDWidgetProps) {
  let can_write = mode === "CREATE" || mode == "EDIT";

  const cleanFormData = (instance: LooseObject, data_schema: LooseObject) => {
    let cleaned_instance: Record<string, any> = {};
    let form_fields = Object.getOwnPropertyNames(data_schema.properties);
    for (var i = 0; i < form_fields.length; i++) {
      try {
        cleaned_instance[form_fields[i]] = instance[form_fields[i]];
      } catch {}
    }
    return cleaned_instance;
  };

  const handleModelChange = (updated_fields: Record<string, any>) => {
    handleInstanceChange(updated_fields);
  };

  const handleChange = ({ formData }: Record<string, any>) => {
    handleInstanceChange(formData);
  };

  let ui_schema_as_applied = { ...ui_schema };
  if (!can_write) {
    ui_schema_as_applied["ui:readonly"] = true;
  }

  let descriptive_name =
    model_name.charAt(0).toUpperCase() + model_name.slice(1);

  return (
    <div style={{ marginBottom: "1rem" }}>
      {show_header ? (
        <HorizontallyCenteredDiv>
          <div style={{ marginTop: "1rem", textAlign: "left" }}>
            <Header as="h2">
              <Icon name="box" />
              <Header.Content>
                {mode === "EDIT"
                  ? `Edit ${descriptive_name}: ${instance.title}`
                  : mode === "VIEW"
                  ? `View ${descriptive_name}`
                  : `Create ${descriptive_name}`}
                <Header.Subheader>{`Values for: ${descriptive_name}`}</Header.Subheader>
              </Header.Content>
            </Header>
          </div>
        </HorizontallyCenteredDiv>
      ) : (
        <></>
      )}
      <HorizontallyCenteredDiv>
        <VerticallyCenteredDiv>
          <Segment raised style={{ width: "100%" }}>
            <Grid celled divided="vertically" style={{ width: "100%" }}>
              <Grid.Row>
                <Grid.Column width={has_file ? 12 : 16}>
                  <Form
                    schema={data_schema}
                    uiSchema={ui_schema_as_applied}
                    onChange={handleChange}
                    formData={cleanFormData(instance, data_schema)}
                  >
                    <></>
                  </Form>
                </Grid.Column>
                {has_file ? (
                  <Grid.Column width={4}>
                    <Label attached="top right">{file_label}</Label>
                    <FilePreviewAndUpload
                      read_only={false}
                      is_image={file_is_image}
                      accepted_types={accepted_file_types}
                      disabled={!can_write}
                      file={instance?.icon ? instance.icon : null}
                      onChange={({ data, filename }) =>
                        handleModelChange({ [file_field]: data, filename })
                      }
                    />
                  </Grid.Column>
                ) : (
                  <></>
                )}
              </Grid.Row>
            </Grid>
          </Segment>
        </VerticallyCenteredDiv>
      </HorizontallyCenteredDiv>
    </div>
  );
}
