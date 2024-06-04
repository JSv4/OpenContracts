import React, { ReactNode, useEffect, useState } from "react";
import { Button, Modal, Icon } from "semantic-ui-react";
import _, { update } from "lodash";
import { CRUDWidget } from "./CRUDWidget";
import { CRUDProps, LooseObject } from "../../types";

export interface ObjectCRUDModalProps extends CRUDProps {
  open: boolean;
  mode: "EDIT" | "VIEW" | "CREATE";
  has_file: boolean;
  file_field: string;
  file_is_image: boolean;
  accepted_file_types: string;
  old_instance: Record<string, any>;
  model_name: string;
  ui_schema: Record<string, any>;
  data_schema: Record<string, any>;
  property_widgets?: any; // TODO - figure out workable type for this.
  onSubmit?: (instance_data: LooseObject) => void;
  onClose: () => void;
  children?: React.ReactChild | React.ReactChild[];
}

export function CRUDModal({
  open,
  mode,
  has_file,
  file_field,
  file_label,
  file_is_image,
  accepted_file_types,
  old_instance,
  model_name,
  ui_schema,
  data_schema,
  property_widgets,
  onSubmit,
  onClose,
  children,
}: ObjectCRUDModalProps) {
  const [instance_obj, setInstanceObj] = useState(
    old_instance ? old_instance : {}
  );
  const [updated_fields_obj, setUpdatedFields] = useState({
    id: old_instance?.id ? old_instance.id : -1,
  });

  const can_write = mode !== "VIEW" && (mode === "CREATE" || mode === "EDIT");

  console.log("---- CRUD MODAL ----");
  console.log("old_instance", old_instance);
  console.log("instance_obj", instance_obj);

  useEffect(() => {
    console.log("CRUD updated fields obj", updated_fields_obj);
  }, [updated_fields_obj]);

  useEffect(() => {
    setInstanceObj(old_instance ? old_instance : {});
    if (old_instance.length >= 0 && old_instance.hasOwnProperty("id")) {
      setUpdatedFields({ id: old_instance.id });
    }
  }, [old_instance]);

  const handleModelChange = (updated_fields: LooseObject) => {
    console.log("HandleModelChange: ", updated_fields);
    setInstanceObj((instance_obj) => ({ ...instance_obj, ...updated_fields }));
    setUpdatedFields((updated_fields_obj) => ({
      ...updated_fields_obj,
      ...updated_fields,
    }));
  };

  let ui_schema_as_applied = { ...ui_schema };
  if (!can_write) {
    ui_schema_as_applied["ui:readonly"] = true;
  }

  let listening_children: JSX.Element[] = [];

  // If we need specific widgets to render and interact with certain fields, loop over the dict between field names and widgets
  // and inject listeners and obj values
  if (property_widgets) {
    const keys = Object.keys(property_widgets);

    // iterate over object
    keys.forEach((key, index) => {
      if (React.isValidElement(property_widgets[key])) {
        listening_children?.push(
          React.cloneElement(property_widgets[key], {
            [key]: instance_obj ? instance_obj[key] : "",
            onChange: handleModelChange,
            key: index,
          })
        );
      }
    });
  }

  return (
    <Modal
      centered
      size="large"
      closeIcon
      open={open}
      onClose={() => onClose()}
    >
      <Modal.Content scrolling>
        <CRUDWidget
          mode={mode}
          instance={instance_obj}
          model_name={model_name}
          ui_schema={ui_schema}
          data_schema={data_schema}
          show_header={true}
          handleInstanceChange={handleModelChange}
          has_file={has_file}
          file_field={file_field}
          file_label={file_label}
          file_is_image={file_is_image}
          accepted_file_types={accepted_file_types}
        />
        {listening_children}
      </Modal.Content>
      <Modal.Actions>
        <Button basic color="grey" onClick={() => onClose()}>
          <Icon name="remove" /> Close
        </Button>
        {can_write && onSubmit && !_.isEqual(old_instance, instance_obj) ? (
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
