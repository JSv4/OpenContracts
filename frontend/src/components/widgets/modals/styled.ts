import styled from "styled-components";
import { Form, Input, Checkbox, TextArea } from "semantic-ui-react";

export const FormSection = styled.div`
  margin-bottom: 2rem;
  width: 100%;

  &:last-child {
    margin-bottom: 0;
  }
`;

export const SectionTitle = styled.h3`
  font-size: 1.1rem;
  margin-bottom: 1rem;
  color: #2c3e50;
  border-bottom: 1px solid #eee;
  padding-bottom: 0.5rem;
`;

export const StyledFormField = styled(Form.Field)`
  margin-bottom: 1rem !important;

  label {
    margin-bottom: 0.5rem !important;
    font-weight: 500 !important;
    color: #34495e !important;
  }
`;

export const StyledInput = styled(Input)`
  &.ui.input > input {
    border-color: #e2e8f0;
    border-radius: 6px;

    &:focus {
      border-color: #2185d0;
      box-shadow: 0 0 0 1px #2185d0;
    }
  }
`;

export const TaskSelectorWrapper = styled.div`
  .ui.dropdown {
    max-width: 100%;
    word-wrap: break-word;
    white-space: normal;

    .text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    .menu > .item {
      word-wrap: break-word;
      white-space: normal;
      padding: 0.5rem 1rem !important;
    }
  }
`;

export const StyledCheckbox = styled(Checkbox)`
  margin-bottom: 1rem !important;

  label {
    font-weight: normal !important;
  }
`;

export const StyledTextArea = styled(TextArea)`
  min-height: 100px !important;
`;
