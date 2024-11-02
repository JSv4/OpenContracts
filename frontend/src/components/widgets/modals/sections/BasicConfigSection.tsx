import React from "react";
import { Grid } from "semantic-ui-react";
import { ExtractTaskDropdown } from "../../selectors/ExtractTaskDropdown";
import {
  FormSection,
  SectionTitle,
  StyledFormField,
  StyledInput,
  TaskSelectorWrapper,
} from "../styled";

interface BasicConfigSectionProps {
  name: string;
  taskName: string;
  handleChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    data: any,
    fieldName: string
  ) => void;
  setFormData: (
    updater: (prev: Record<string, any>) => Record<string, any>
  ) => void;
}

export const BasicConfigSection: React.FC<BasicConfigSectionProps> = ({
  name,
  taskName,
  handleChange,
  setFormData,
}) => {
  return (
    <FormSection>
      <SectionTitle>Basic Configuration</SectionTitle>
      <Grid>
        <Grid.Row>
          <Grid.Column width={8}>
            <StyledFormField>
              <label>Name</label>
              <StyledInput
                placeholder="Enter column name"
                name="name"
                value={name}
                onChange={(
                  e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
                  data: any
                ) => handleChange(e, data, "name")}
                fluid
              />
            </StyledFormField>
          </Grid.Column>
          <Grid.Column width={8}>
            <StyledFormField>
              <label>Extract Task</label>
              <TaskSelectorWrapper>
                <ExtractTaskDropdown
                  onChange={(taskName: string | null) => {
                    if (taskName) {
                      setFormData((prev) => ({ ...prev, taskName }));
                    }
                  }}
                  taskName={taskName}
                />
              </TaskSelectorWrapper>
            </StyledFormField>
          </Grid.Column>
        </Grid.Row>
      </Grid>
    </FormSection>
  );
};
