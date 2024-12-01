import React, { forwardRef } from "react";
import {
  Form,
  Dropdown,
  Popup,
  InputOnChangeData,
  Icon,
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
  filters?: JSX.Element;
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
              <StyledButton aria-label="Filter">
                <Icon name="filter" />
              </StyledButton>
            }
            content={<FilterPopoverContent>{filters}</FilterPopoverContent>}
            on="click"
            position="bottom right"
            pinned
          />
        )}

        {actions.length > 0 && (
          <StyledButtonGroup>
            <Dropdown
              button
              className="icon"
              trigger={
                <StyledButton aria-label="Add">
                  <Icon name="plus" />
                </StyledButton>
              }
            >
              <Dropdown.Menu>{actionItems}</Dropdown.Menu>
            </Dropdown>
          </StyledButtonGroup>
        )}
      </ActionsWrapper>
    </SearchBarContainer>
  );
};

/**
 * Styled button that forwards refs properly and uses a native button element.
 *
 * @param {React.ButtonHTMLAttributes<HTMLButtonElement>} props - Button properties.
 * @param {React.Ref<HTMLButtonElement>} ref - Reference to the button element.
 * @returns {JSX.Element} The styled button component.
 */
const StyledButton = styled(
  forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
    (props, ref) => (
      <button {...props} ref={ref}>
        {props.children}
      </button>
    )
  )
)`
  /* Reset button styles */
  appearance: none;
  border: none;
  cursor: pointer;

  /* Base styles */
  background: var(--primary-color, #2185d0);
  color: white;
  padding: 0.8em;
  min-width: 2.5em;
  height: 2.5em;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 500;

  /* Flexbox for icon alignment */
  display: inline-flex;
  align-items: center;
  justify-content: center;

  /* Smooth transitions */
  transition: all 0.2s ease-in-out;

  /* Icon styling */
  i.icon {
    margin: 0 !important;
    font-size: 1em;
    height: auto;
    width: auto;
  }

  /* Hover state */
  &:hover {
    background: var(--primary-hover, #1678c2);
    transform: translateY(-1px);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  }

  /* Active state */
  &:active {
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  /* Focus state */
  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(33, 133, 208, 0.2);
  }

  /* Disabled state */
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    background: #cccccc;
  }
`;

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
 * Styled button group removing unnecessary styling to ensure sane sizing.
 */
const StyledButtonGroup = styled.div`
  display: flex;
  align-items: center;
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
