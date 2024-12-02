import React, { useEffect, useMemo, useState } from "react";
import { Button, Modal, Icon, Header } from "semantic-ui-react";
import _ from "lodash";
import { CRUDWidget } from "./CRUDWidget";
import { CRUDProps, LooseObject, PropertyWidgets } from "../../types";
import {
  HorizontallyCenteredDiv,
  VerticallyCenteredDiv,
} from "../../layout/Wrappers";

/**
 * Props for the ObjectCRUDModal component.
 */
export interface ObjectCRUDModalProps extends CRUDProps {
  open: boolean;
  oldInstance: Record<string, any>;
  propertyWidgets?: PropertyWidgets;
  onSubmit?: (instanceData: LooseObject) => void;
  onClose: () => void;
  children?: React.ReactNode;
}

/**
 * CRUDModal component provides a modal interface for creating, viewing, and editing instances.
 * It integrates the CRUDWidget for form handling and supports custom property widgets.
 *
 * @param {ObjectCRUDModalProps} props - The properties passed to the component.
 * @returns {JSX.Element} The rendered CRUD modal component.
 */
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
}: ObjectCRUDModalProps): JSX.Element {
  const [instanceObj, setInstanceObj] = useState<Record<string, any>>(
    oldInstance || {}
  );
  const [updatedFieldsObj, setUpdatedFields] = useState<Record<string, any>>({
    id: oldInstance?.id ?? -1,
  });

  const canWrite = mode !== "VIEW" && (mode === "CREATE" || mode === "EDIT");

  useEffect(() => {
    setInstanceObj(oldInstance || {});
    if (
      Array.isArray(oldInstance) &&
      oldInstance.length > 0 &&
      typeof oldInstance[0] === "object" &&
      "id" in oldInstance[0]
    ) {
      setUpdatedFields({ id: oldInstance[0].id });
    } else if (
      typeof oldInstance === "object" &&
      oldInstance !== null &&
      "id" in oldInstance
    ) {
      setUpdatedFields({ id: oldInstance.id });
    }
  }, [oldInstance]);

  /**
   * Handles changes in the model and updates the state accordingly.
   *
   * @param {LooseObject} updatedFields - The updated fields from the form.
   */
  const handleModelChange = (updatedFields: LooseObject): void => {
    console.log("HandleModelChange: ", updatedFields);
    setInstanceObj((prevObj) => ({ ...prevObj, ...updatedFields }));
    setUpdatedFields((prevFields) => ({
      ...prevFields,
      ...updatedFields,
    }));
  };

  const appliedUISchema = useMemo(() => {
    return canWrite ? { ...uiSchema } : { ...uiSchema, "ui:readonly": true };
  }, [uiSchema, canWrite]);

  const listeningChildren: JSX.Element[] = useMemo(() => {
    if (!propertyWidgets) return [];
    return Object.keys(propertyWidgets)
      .map((key, index) => {
        const widget = propertyWidgets[key];
        if (React.isValidElement(widget)) {
          return React.cloneElement(widget, {
            [key]: instanceObj[key] || "",
            onChange: handleModelChange,
            key: index,
          });
        }
        return null;
      })
      .filter(Boolean) as JSX.Element[];
  }, [propertyWidgets, instanceObj, handleModelChange]);

  const descriptiveName = useMemo(
    () => modelName.charAt(0).toUpperCase() + modelName.slice(1),
    [modelName]
  );

  const headerText = useMemo(() => {
    switch (mode) {
      case "EDIT":
        return `Edit ${descriptiveName}: ${instanceObj.title}`;
      case "VIEW":
        return `View ${descriptiveName}`;
      default:
        return `Create ${descriptiveName}`;
    }
  }, [mode, descriptiveName, instanceObj.title]);

  return (
    <Modal centered size="large" closeIcon open={open} onClose={onClose}>
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
          instance={instanceObj}
          modelName={modelName}
          uiSchema={appliedUISchema}
          dataSchema={dataSchema}
          showHeader={false}
          handleInstanceChange={handleModelChange}
          hasFile={hasFile}
          fileField={fileField}
          fileLabel={fileLabel}
          fileIsImage={fileIsImage}
          acceptedFileTypes={acceptedFileTypes}
        />
        <VerticallyCenteredDiv>{listeningChildren}</VerticallyCenteredDiv>
        {children}
      </Modal.Content>
      <Modal.Actions>
        <HorizontallyCenteredDiv>
          <Button basic color="grey" onClick={onClose}>
            <Icon name="remove" /> Close
          </Button>
          {canWrite && onSubmit && !_.isEqual(oldInstance, instanceObj) && (
            <Button
              color="green"
              inverted
              onClick={() => {
                console.log(
                  "Submitting",
                  mode === "EDIT" ? updatedFieldsObj : instanceObj
                );
                onSubmit(mode === "EDIT" ? updatedFieldsObj : instanceObj);
              }}
            >
              <Icon name="checkmark" /> {mode === "EDIT" ? "Update" : "Create"}
            </Button>
          )}
        </HorizontallyCenteredDiv>
      </Modal.Actions>
    </Modal>
  );
}
