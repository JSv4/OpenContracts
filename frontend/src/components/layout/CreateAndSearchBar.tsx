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
            <StyledDropdown
              pointing="top right"
              button
              className="icon"
              trigger={
                <StyledButton aria-label="Add">
                  <Icon name="plus" />
                </StyledButton>
              }
            >
              <Dropdown.Menu>{actionItems}</Dropdown.Menu>
            </StyledDropdown>
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
  background: var(--background-subtle, #f0f2f5);
  color: var(--text-primary, #1a2433);
  padding: 0.65em;
  min-width: 2.3em;
  height: 2.3em;
  border-radius: 8px;
  font-size: 0.95rem;
  position: relative;
  overflow: hidden;

  /* Flexbox for icon alignment */
  display: inline-flex;
  align-items: center;
  justify-content: center;

  /* Smooth transitions */
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  /* Icon styling */
  i.icon {
    margin: 0 !important;
    font-size: 1em;
    height: auto;
    width: auto;
    opacity: 0.85;
    position: relative;
    z-index: 2;
  }

  /* Hover effect with pseudo-element */
  &::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 120%;
    height: 120%;
    background: var(--background-hover, #e2e8f0);
    border-radius: 50%;
    transform: translate(-50%, -50%) scale(0);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: 1;
  }

  /* Hover state */
  &:hover {
    background: var(--background-subtle, #f0f2f5);
    i.icon {
      opacity: 1;
      transform: scale(1.1);
    }
    &::before {
      transform: translate(-50%, -50%) scale(1);
    }
  }

  /* Active state */
  &:active {
    transform: scale(0.95);
    &::before {
      background: var(--background-active, #d1d8e5);
    }
  }

  /* Focus state */
  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px rgba(26, 36, 51, 0.15);
  }

  /* Disabled state */
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

/**
 * Styled dropdown component, removing default Semantic UI styling.
 *
 * @param {React.ButtonHTMLAttributes<HTMLButtonElement>} props - Button properties.
 * @param {React.Ref<HTMLButtonElement>} ref - Reference to the button element.
 * @returns {JSX.Element} The styled button component.
 */
const StyledDropdown = styled(Dropdown)`
  &.ui.dropdown {
    /* Remove default Semantic UI styling */
    background: none;
    border: none;
    padding: 0;
    min-height: 0;

    .menu {
      margin-top: 0.5rem !important;
      border: none !important;
      background: #ffffff !important;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08) !important;
      border-radius: 12px !important;
      padding: 0.5rem !important;

      /* Dropdown items */
      .item {
        border-radius: 8px !important;
        margin: 0.2rem 0 !important;
        padding: 0.6rem 1rem !important;
        transition: all 0.2s ease !important;

        /* Icon in dropdown items */
        i.icon {
          opacity: 0.85 !important;
          margin-right: 0.75rem !important;
        }

        &:hover {
          background: var(--background-subtle, #f0f2f5) !important;

          i.icon {
            opacity: 1 !important;
          }
        }
      }
    }
  }
`;
