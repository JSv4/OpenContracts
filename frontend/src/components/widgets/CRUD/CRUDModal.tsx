import React, { useEffect, useMemo, useState } from "react";
import { Button, Modal, Icon, Header } from "semantic-ui-react";
import _ from "lodash";
import { CRUDWidget } from "./CRUDWidget";
import { CRUDProps, LooseObject, PropertyWidgets } from "../../types";
import { HorizontallyCenteredDiv } from "../../layout/Wrappers";

export interface ObjectCRUDModalProps extends CRUDProps {
  open: boolean;
  oldInstance: Record<string, any>;
  propertyWidgets?: PropertyWidgets;
  onSubmit?: (instanceData: LooseObject) => void;
  onClose: () => void;
  children?: React.ReactNode;
}

export function CRUDModal({
  open,
  mode,
  hasFile,
  fileField,
  fileLabel,
  fileIsImage,
  acceptedFileTypes,
  oldInstance,
  modelName,
  uiSchema,
  dataSchema,
  propertyWidgets,
  onSubmit,
  onClose,
  children,
}: ObjectCRUDModalProps) {
  const [instance_obj, setInstanceObj] = useState(
    oldInstance ? oldInstance : {}
  );
  const [updated_fields_obj, setUpdatedFields] = useState({
    id: oldInstance?.id ? oldInstance.id : -1,
  });

  const can_write = mode !== "VIEW" && (mode === "CREATE" || mode === "EDIT");

  // console.log("---- CRUD MODAL ----");
  // console.log("oldInstance", oldInstance);
  // console.log("instance_obj", instance_obj);

  useEffect(() => {
    console.log("CRUD updated fields obj", updated_fields_obj);
  }, [updated_fields_obj]);

  useEffect(() => {
    console.log("oldInstance changed", oldInstance);
    setInstanceObj(oldInstance ? oldInstance : {});
    if (oldInstance.length >= 0 && oldInstance.hasOwnProperty("id")) {
      setUpdatedFields({ id: oldInstance.id });
    }
  }, [oldInstance]);

  const handleModelChange = (updated_fields: LooseObject) => {
    console.log("HandleModelChange: ", updated_fields);
    setInstanceObj((instance_obj) => ({ ...instance_obj, ...updated_fields }));
    setUpdatedFields((updated_fields_obj) => ({
      ...updated_fields_obj,
      ...updated_fields,
    }));
  };

  let ui_schema_as_applied = { ...uiSchema };
  if (!can_write) {
    ui_schema_as_applied["ui:readonly"] = true;
  }

  let listening_children: JSX.Element[] = [];

  // If we need specific widgets to render and interact with certain fields, loop over the dict between field names and widgets
  // and inject listeners and obj values
  if (propertyWidgets) {
    const keys = Object.keys(propertyWidgets);

    // iterate over object
    keys.forEach((key, index) => {
      if (React.isValidElement(propertyWidgets[key])) {
        listening_children?.push(
          React.cloneElement(propertyWidgets[key], {
            [key]: instance_obj ? instance_obj[key] : "",
            onChange: handleModelChange,
            key: index,
          })
        );
      }
    });
  }

  const descriptiveName = useMemo(
    () => modelName.charAt(0).toUpperCase() + modelName.slice(1),
    [modelName]
  );

  const headerText = useMemo(() => {
    switch (mode) {
      case "EDIT":
        return `Edit ${descriptiveName}: ${instance_obj.title}`;
      case "VIEW":
        return `View ${descriptiveName}`;
      default:
        return `Create ${descriptiveName}`;
    }
  }, [mode, descriptiveName, instance_obj.title]);

  return (
    <Modal
      centered
      size="large"
      closeIcon
      open={open}
      onClose={() => onClose()}
    >
      <Modal.Header>
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
      </Modal.Header>
      <Modal.Content scrolling>
        <CRUDWidget
          mode={mode}
          instance={instance_obj}
          modelName={modelName}
          uiSchema={uiSchema}
          dataSchema={dataSchema}
          showHeader={false}
          handleInstanceChange={handleModelChange}
          hasFile={hasFile}
          fileField={fileField}
          fileLabel={fileLabel}
          fileIsImage={fileIsImage}
          acceptedFileTypes={acceptedFileTypes}
        />
        {listening_children}
      </Modal.Content>
      <Modal.Actions>
        <Button basic color="grey" onClick={() => onClose()}>
          <Icon name="remove" /> Close
        </Button>
        {can_write && onSubmit && !_.isEqual(oldInstance, instance_obj) ? (
          <Button
            color="green"
            inverted
            onClick={() => {
              console.log(
                "Submitting",
                mode === "EDIT" ? updated_fields_obj : instance_obj
              );
              onSubmit(mode === "EDIT" ? updated_fields_obj : instance_obj);
            }}
          >
            <Icon name="checkmark" /> {mode === "EDIT" ? "Update" : "Create"}
          </Button>
        ) : (
          <></>
        )}
      </Modal.Actions>
    </Modal>
  );
}
