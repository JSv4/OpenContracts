import React from "react";
import { Dropdown, DropdownProps } from "semantic-ui-react";
import styled from "styled-components";

interface PrimitiveTypeDropdownProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const StyledDropdown = styled(Dropdown)`
  &.ui.dropdown {
    width: 100%;
    margin-top: 1rem;

    .text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
`;

const PRIMITIVE_TYPES = [
  { key: "string", text: "String", value: "string" },
  { key: "number", text: "Number", value: "number" },
  { key: "boolean", text: "Boolean", value: "bool" },
  { key: "date", text: "Date", value: "date" },
];

export const PrimitiveTypeDropdown: React.FC<PrimitiveTypeDropdownProps> = ({
  value,
  onChange,
  disabled,
}) => {
  const handleChange = (
    event: React.SyntheticEvent<HTMLElement>,
    data: DropdownProps
  ) => {
    if (typeof data.value === "string") {
      onChange(data.value);
    }
  };

  return (
    <StyledDropdown
      selection
      fluid
      options={PRIMITIVE_TYPES}
      value={value}
      onChange={handleChange}
      disabled={disabled}
      placeholder="Select primitive type"
    />
  );
};
