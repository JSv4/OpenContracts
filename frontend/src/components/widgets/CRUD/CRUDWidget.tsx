import React, { useCallback, useMemo } from "react";
import { Header, Icon, Segment, Label } from "semantic-ui-react";
import Form from "@rjsf/semantic-ui";
import {
  HorizontallyCenteredDiv,
  VerticallyCenteredDiv,
} from "../../layout/Wrappers";
import { FilePreviewAndUpload } from "../file-controls/FilePreviewAndUpload";
import { CRUDProps, LooseObject } from "../../types";

interface CRUDWidgetProps extends CRUDProps {
  instance: Record<string, any>;
  showHeader: boolean;
  handleInstanceChange: (a: any) => void;
}

export const CRUDWidget: React.FC<CRUDWidgetProps> = ({
  mode,
  instance,
  modelName,
  hasFile,
  fileField,
  fileLabel,
  fileIsImage,
  acceptedFileTypes,
  uiSchema,
  dataSchema,
  showHeader,
  handleInstanceChange,
}) => {
  const canWrite = mode === "CREATE" || mode === "EDIT";

  const cleanFormData = useCallback(
    (instance: LooseObject, dataSchema: LooseObject) => {
      return Object.keys(dataSchema.properties).reduce((acc, key) => {
        if (key in instance) {
          acc[key] = instance[key];
        }
        return acc;
      }, {} as Record<string, any>);
    },
    []
  );

  const handleChange = useCallback(
    ({ formData }: Record<string, any>) => {
      handleInstanceChange(formData);
    },
    [handleInstanceChange]
  );

  const descriptiveName = useMemo(
    () => modelName.charAt(0).toUpperCase() + modelName.slice(1),
    [modelName]
  );

  const headerText = useMemo(() => {
    switch (mode) {
      case "EDIT":
        return `Edit ${descriptiveName}: ${instance.title}`;
      case "VIEW":
        return `View ${descriptiveName}`;
      default:
        return `Create ${descriptiveName}`;
    }
  }, [mode, descriptiveName, instance.title]);

  const formData = useMemo(
    () => cleanFormData(instance, dataSchema),
    [instance, dataSchema, cleanFormData]
  );

  return (
    <div style={{ marginBottom: "1rem" }}>
      {showHeader && (
        <HorizontallyCenteredDiv>
          <div style={{ marginTop: "1rem", textAlign: "left", width: "100%" }}>
            <Header as="h2">
              <Icon name="box" />
              <Header.Content>
                {headerText}
                <Header.Subheader>{`Values for: ${descriptiveName}`}</Header.Subheader>
              </Header.Content>
            </Header>
          </div>
        </HorizontallyCenteredDiv>
      )}
      <HorizontallyCenteredDiv>
        <VerticallyCenteredDiv>
          <Segment raised style={{ width: "100%" }}>
            {hasFile && (
              <div style={{ marginBottom: "1rem" }}>
                <Label>{fileLabel}</Label>
                <FilePreviewAndUpload
                  readOnly={!canWrite}
                  isImage={fileIsImage}
                  acceptedTypes={acceptedFileTypes}
                  disabled={!canWrite}
                  file={instance?.icon || null}
                  onChange={({ data, filename }) =>
                    handleInstanceChange({ [fileField]: data, filename })
                  }
                />
              </div>
            )}
            <Form
              schema={dataSchema}
              uiSchema={uiSchema}
              onChange={handleChange}
              formData={formData}
              noHtml5Validate
            >
              <></>
            </Form>
          </Segment>
        </VerticallyCenteredDiv>
      </HorizontallyCenteredDiv>
    </div>
  );
};
