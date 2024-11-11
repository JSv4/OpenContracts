// Start of Selection
import React, { useState } from "react";
import {
  Button,
  Form,
  Dropdown,
  Popup,
  InputOnChangeData,
} from "semantic-ui-react";
import styled from "styled-components";

/**
 * Props for each dropdown action item.
 */
export interface DropdownActionProps {
  icon: string;
  title: string;
  key: string;
  color: string;
  action_function: (args?: any) => any | void;
}

/**
 * Props for the CreateAndSearchBar component.
 */
interface CreateAndSearchBarProps {
  actions: DropdownActionProps[];
  filters?: JSX.Element | JSX.Element[];
  placeholder?: string;
  value?: string;
  onChange?: (search_string: string) => any | void;
}

/**
 * CreateAndSearchBar component provides a search input with optional filter and action dropdowns.
 *
 * @param {CreateAndSearchBarProps} props - The properties passed to the component.
 * @returns {JSX.Element} The rendered search bar component.
 */
export const CreateAndSearchBar: React.FC<CreateAndSearchBarProps> = ({
  actions,
  filters,
  placeholder = "Search...",
  value = "",
  onChange,
}) => {
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const actionItems = actions.map((action) => (
    <Dropdown.Item
      icon={action.icon}
      text={action.title}
      onClick={action.action_function}
      key={action.key}
    />
  ));

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    data: InputOnChangeData
  ) => {
    if (onChange) {
      onChange(data.value);
    }
  };

  return (
    <SearchBarContainer>
      <SearchInputWrapper>
        <Form>
          <StyledFormInput
            icon="search"
            placeholder={placeholder}
            value={value}
            onChange={handleInputChange}
            fluid
          />
        </Form>
      </SearchInputWrapper>

      <ActionsWrapper>
        {filters && (
          <Popup
            trigger={
              <StyledButton
                icon="filter"
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                aria-label="Filter"
              />
            }
            content={<FilterPopoverContent>{filters}</FilterPopoverContent>}
            on="click"
            open={isFilterOpen}
            onClose={() => setIsFilterOpen(false)}
            onOpen={() => setIsFilterOpen(true)}
            position="bottom right"
            pinned
          />
        )}

        {actions.length > 0 && (
          <StyledButtonGroup>
            <Dropdown button className="icon" trigger={<Button icon="plus" />}>
              <Dropdown.Menu>{actionItems}</Dropdown.Menu>
            </Dropdown>
          </StyledButtonGroup>
        )}
      </ActionsWrapper>
    </SearchBarContainer>
  );
};

/**
 * Container for the search bar, removing the blue tint and applying a neutral background.
 */
const SearchBarContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  background: #ffffff;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  border-radius: 12px;
`;

/**
 * Wrapper for the search input to control its growth and margin.
 */
const SearchInputWrapper = styled.div`
  flex-grow: 1;
  margin-right: 1rem;
  max-width: 50vw;
`;

/**
 * Styled form input with customized border and focus effects.
 */
const StyledFormInput = styled(Form.Input)`
  .ui.input > input {
    border-radius: 20px;
    border: 1px solid #ccc;
    transition: all 0.3s ease;

    &:focus {
      box-shadow: 0 0 0 2px #aaa;
    }
  }
`;

/**
 * Wrapper for action buttons, aligning them with appropriate spacing.
 */
const ActionsWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

/**
 * Styled button for the filter, ensuring a consistent size and appearance.
 */
const StyledButton = styled(Button)`
  border-radius: 20px;
  background: #333;
  color: white;
  transition: background 0.3s ease;
  padding: 0.5rem;

  &:hover {
    background: #555;
  }
`;

/**
 * Styled button group removing unnecessary styling to ensure sane sizing.
 */
const StyledButtonGroup = styled(Button.Group)`
  .ui.button {
    border-radius: 4px;
    padding: 0.5rem 1rem;
    background: #28a745;
    color: white;
    transition: background 0.3s ease;

    &:hover {
      background: #218838;
    }
  }
`;

/**
 * Content container for the filter popup, ensuring proper anchoring and styling.
 */
const FilterPopoverContent = styled.div`
  max-height: 300px;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

  /* Customize scrollbar */
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: #555;
  }
`;
