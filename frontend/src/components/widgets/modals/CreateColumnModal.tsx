import React, { useState, useCallback } from "react";
import { Modal, Form, Grid, Button } from "semantic-ui-react";
import { BasicConfigSection } from "./sections/BasicConfigSection";
import { OutputTypeSection } from "./sections/OutputTypeSection";
import { ExtractionConfigSection } from "./sections/ExtractionConfigSection";
import { AdvancedOptionsSection } from "./sections/AdvancedOptionsSection";
import { LooseObject } from "../../types";
import styled from "styled-components";

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

interface RequiredFields {
  query: string;
  primitiveType?: string;
  taskName: string;
  name: string;
  agentic: boolean;
}

const ModalContent = styled(Modal.Content)`
  padding: 2rem !important;
`;

const StyledGrid = styled(Grid)`
  margin: 0 !important;
`;

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
  const [formData, setFormData] = useState<LooseObject>(
    existing_column ? existing_column : {}
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [outputTypeOption, setOutputTypeOption] = useState<string>(
    existing_column?.isCustomModel ? "custom" : "primitive"
  );

  const handleChange = useCallback(
    (
      event: React.SyntheticEvent<HTMLElement>,
      data: any,
      fieldName: string
    ) => {
      const value = data.type === "checkbox" ? data.checked : data.value;
      setFormData((prev) => ({ ...prev, [fieldName]: value }));
    },
    []
  );

  const handleOutputTypeChange = (
    e: React.FormEvent<HTMLInputElement>,
    data: any
  ) => {
    setOutputTypeOption(data.value);
  };

  const isFormValid = useCallback((): boolean => {
    if (!existing_column) {
      const requiredFields: RequiredFields = {
        query: formData.query || "",
        taskName: formData.taskName || "",
        name: formData.name || "",
        agentic: formData.agentic ?? false,
        ...(outputTypeOption === "primitive"
          ? { primitiveType: formData.primitiveType }
          : {}),
      };

      return Object.entries(requiredFields).every(([key, value]) => {
        if (key === "agentic") return typeof value === "boolean";
        return Boolean(value);
      });
    }
    return true;
  }, [formData, outputTypeOption, existing_column]);

  const handleSubmit = async () => {
    console.log("Submitting form data:", formData);

    const submitData = {
      ...formData,
      agentic: Boolean(formData.agentic),
      outputType: formData.outputType,
    };

    setIsSubmitting(true);
    try {
      await onSubmit(submitData);
      onClose();
    } catch (error) {
      console.error("Error submitting form:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} closeIcon onClose={onClose} size="large">
      <Modal.Header>Create a New Data Extract Column</Modal.Header>
      <ModalContent>
        <Form>
          <StyledGrid>
            <BasicConfigSection
              name={formData.name || ""}
              taskName={formData.taskName || ""}
              handleChange={handleChange}
              setFormData={setFormData}
            />
            <OutputTypeSection
              outputTypeOption={outputTypeOption}
              extractIsList={formData.extractIsList || false}
              primitiveType={formData.primitiveType || ""}
              handleOutputTypeChange={handleOutputTypeChange}
              handleChange={handleChange}
              setFormData={setFormData}
            />
            <ExtractionConfigSection
              query={formData.query || ""}
              mustContainText={formData.mustContainText || ""}
              matchText={formData.matchText || ""}
              handleChange={handleChange}
            />
            <AdvancedOptionsSection
              instructions={formData.instructions || ""}
              agentic={formData.agentic || false}
              limitToLabel={formData.limitToLabel || ""}
              handleChange={handleChange}
            />
          </StyledGrid>
        </Form>
      </ModalContent>
      <Modal.Actions>
        <Button color="black" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          content="Submit"
          labelPosition="right"
          icon="checkmark"
          onClick={handleSubmit}
          positive
          loading={isSubmitting}
          disabled={isSubmitting || (!existing_column && !isFormValid())}
        />
      </Modal.Actions>
    </Modal>
  );
};
