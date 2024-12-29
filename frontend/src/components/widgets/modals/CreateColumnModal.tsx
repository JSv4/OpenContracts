import React, { useState, useCallback, useEffect } from "react";
import { Modal, Form, Grid, Button } from "semantic-ui-react";
import { BasicConfigSection } from "./sections/BasicConfigSection";
import { OutputTypeSection } from "./sections/OutputTypeSection";
import { ExtractionConfigSection } from "./sections/ExtractionConfigSection";
import { AdvancedOptionsSection } from "./sections/AdvancedOptionsSection";
import { LooseObject } from "../../types";
import styled from "styled-components";
import { ColumnType } from "../../../types/graphql-api";
import { parsePydanticModel } from "../../../utils/parseOutputType";
import { FieldType } from "../ModelFieldBuilder";

interface CreateColumnModalProps {
  open: boolean;
  existing_column?: ColumnType | null;
  onClose: () => void;
  onSubmit: (data: any) => void;
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
 * Modal component for creating or editing a data extract column.
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
    existing_column ? { ...existing_column } : {}
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [outputTypeOption, setOutputTypeOption] = useState<string>("primitive");
  const [primitiveType, setPrimitiveType] = useState<string>("str");
  const [extractIsList, setExtractIsList] = useState<boolean>(false);
  const [initialFields, setInitialFields] = useState<FieldType[]>([]);

  useEffect(() => {
    if (existing_column) {
      setFormData({ ...existing_column });
      const isPrimitiveType = ["str", "int", "float", "bool"].includes(
        existing_column.outputType || ""
      );
      setOutputTypeOption(isPrimitiveType ? "primitive" : "custom");
      setPrimitiveType(existing_column.outputType);
      setExtractIsList(Boolean(existing_column.extractIsList));
      setInitialFields(parsePydanticModel(existing_column.outputType));
    } else {
      setFormData({});
      setOutputTypeOption("primitive");
      setPrimitiveType("str");
      setExtractIsList(false);
      setInitialFields([]);
    }
  }, [existing_column]);

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
    setFormData((prev) => ({
      ...prev,
      outputType: data.value === "primitive" ? primitiveType : "",
    }));
  };

  const handlePrimitiveTypeChange = (value: string) => {
    setPrimitiveType(value);
    setFormData((prev) => ({
      ...prev,
      outputType: value,
    }));
  };

  const isFormValid = useCallback((): boolean => {
    const requiredFields: RequiredFields = {
      query: formData.query || "",
      taskName: formData.taskName || "",
      name: formData.name || "",
      agentic: formData.agentic ?? false,
    };

    return Object.entries(requiredFields).every(([key, value]) => {
      if (key === "agentic") return typeof value === "boolean";
      return Boolean(value);
    });
  }, [formData]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onClose();
    } catch (error) {
      console.error("Error submitting form:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} closeIcon onClose={onClose} size="large">
      <Modal.Header>
        {existing_column ? "Edit Column" : "Create a New Data Extract Column"}
      </Modal.Header>
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
              extractIsList={extractIsList}
              primitiveType={primitiveType}
              handleOutputTypeChange={handleOutputTypeChange}
              handlePrimitiveTypeChange={handlePrimitiveTypeChange}
              handleChange={handleChange}
              setFormData={setFormData}
              initialFields={initialFields}
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
          disabled={isSubmitting || !isFormValid()}
        />
      </Modal.Actions>
    </Modal>
  );
};
