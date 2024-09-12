import React, { useState } from "react";
import { Button, Form, Dropdown, Popup } from "semantic-ui-react";
import styled from "styled-components";

export interface DropdownActionProps {
  icon: string;
  title: string;
  key: string;
  color: string;
  action_function: (args?: any) => any | void;
}

interface CreateAndSearchBarProps {
  actions: DropdownActionProps[];
  filters?: JSX.Element | JSX.Element[];
  placeholder?: string;
  value?: string;
  onChange?: (search_string: string) => any | void;
}

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

  return (
    <SearchBarContainer>
      <SearchInputWrapper>
        <Form>
          <Form.Input
            icon="search"
            placeholder={placeholder}
            value={value}
            onChange={(e, { value }) => onChange && onChange(value as string)}
            fluid
          />
        </Form>
      </SearchInputWrapper>

      <ActionsWrapper>
        {filters && (
          <Popup
            trigger={
              <Button
                icon="filter"
                onClick={() => setIsFilterOpen(!isFilterOpen)}
              />
            }
            content={<FilterPopoverContent>{filters}</FilterPopoverContent>}
            on="click"
            open={isFilterOpen}
            onClose={() => setIsFilterOpen(false)}
            onOpen={() => setIsFilterOpen(true)}
            position="bottom right"
          />
        )}

        {actions.length > 0 && (
          <Button.Group color="teal">
            <Dropdown className="button icon" floating trigger={<></>}>
              <Dropdown.Menu>{actionItems}</Dropdown.Menu>
            </Dropdown>
          </Button.Group>
        )}
      </ActionsWrapper>
    </SearchBarContainer>
  );
};

const SearchBarContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  background-color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.24);
  border-radius: 4px;
`;

const SearchInputWrapper = styled.div`
  flex-grow: 1;
  margin-right: 1rem;
  max-width: 50vw;
`;

const ActionsWrapper = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const FilterPopoverContent = styled.div`
  max-height: 300px;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;

  /* Customize scrollbar */
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #f1f1f1;
  }

  &::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: #555;
  }
`;
