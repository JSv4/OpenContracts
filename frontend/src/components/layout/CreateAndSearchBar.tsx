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
  border-radius: 12px;
  font-size: 0.95rem;
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(8px);

  /* Flexbox for icon alignment */
  display: inline-flex;
  align-items: center;
  justify-content: center;

  /* Smooth transitions */
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform-origin: center;

  /* Icon styling */
  i.icon {
    margin: 0 !important;
    font-size: 1em;
    height: auto;
    width: auto;
    opacity: 0.85;
    position: relative;
    z-index: 2;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  /* Dynamic background gradient */
  background: linear-gradient(
    135deg,
    var(--background-subtle, #f0f2f5) 0%,
    var(--background-hover, #e2e8f0) 100%
  );
  background-size: 200% 200%;
  background-position: 0% 0%;

  /* Subtle border */
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1),
    0 2px 4px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1);

  /* Hover state */
  &:hover {
    transform: translateY(-1px) scale(1.02);
    background-position: 100% 100%;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2),
      0 4px 8px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.1);

    i.icon {
      opacity: 1;
      transform: scale(1.1) rotate(8deg);
    }
  }

  /* Active state */
  &:active {
    transform: translateY(1px) scale(0.98);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1),
      0 1px 2px rgba(0, 0, 0, 0.1);
    background-position: 50% 50%;
  }

  /* Focus state */
  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px #4285f4, 0 0 0 4px rgba(66, 133, 244, 0.2);
  }

  /* Special styling for the add button */
  &[aria-label="Add"] {
    background: #4285f4;
    color: white;
    box-shadow: 0 2px 4px rgba(66, 133, 244, 0.2),
      0 4px 8px rgba(66, 133, 244, 0.1);

    i.icon {
      opacity: 1;
    }

    &:hover {
      background: #5c9aff;
      box-shadow: 0 4px 8px rgba(66, 133, 244, 0.3),
        0 8px 16px rgba(66, 133, 244, 0.2);
    }

    &:active {
      background: #3b78e7;
      box-shadow: 0 2px 4px rgba(66, 133, 244, 0.2);
    }
  }

  /* Disabled state */
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
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

    /* Hide the dropdown arrow */
    .dropdown.icon {
      display: none !important;
    }

    .menu {
      margin-top: 0.75rem !important;
      border: none !important;
      background: rgba(255, 255, 255, 0.98) !important;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.08) !important;
      border-radius: 16px !important;
      padding: 0.75rem !important;
      backdrop-filter: blur(8px);
      transform-origin: top right;
      animation: dropdownAppear 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);

      @keyframes dropdownAppear {
        from {
          opacity: 0;
          transform: scale(0.95) translateY(-8px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      /* Dropdown items */
      .item {
        border-radius: 12px !important;
        margin: 0.3rem 0 !important;
        padding: 0.8rem 1rem !important;
        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
        color: var(--text-primary, #1a2433) !important;

        /* Icon in dropdown items */
        i.icon {
          opacity: 0.85 !important;
          margin-right: 0.75rem !important;
          transition: all 0.2s ease !important;
          color: #4285f4 !important;
        }

        &:hover {
          background: rgba(66, 133, 244, 0.08) !important;
          transform: translateX(4px);

          i.icon {
            opacity: 1 !important;
            transform: scale(1.1);
          }
        }
      }
    }
  }
`;
