import { Button, Form, Dropdown } from "semantic-ui-react";
import styled from "styled-components";
import { FilterWrapper } from "../common";

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
  placeholder: string;
  value: string;
  onChange: (search_string: string) => any | void;
}

export const CreateAndSearchBar = ({
  actions,
  filters,
  placeholder,
  value,
  onChange,
}: CreateAndSearchBarProps) => {
  let buttongroup = <></>;
  let buttons = [];

  if (actions && actions.length > 0) {
    buttons = actions.map((action_json) => (
      <Dropdown.Item
        icon={action_json.icon}
        text={action_json.title}
        onClick={action_json.action_function}
        key={action_json.title}
        color={action_json.color}
      />
    ));

    buttongroup = (
      <Button.Group
        color="teal"
        floated="right"
        style={{ marginRight: "10px" }}
      >
        <Button disabled={buttons?.length === 0}>Actions</Button>
        <Dropdown
          disabled={buttons?.length === 0}
          className="button icon"
          floating
          trigger={<></>}
        >
          <Dropdown.Menu>{buttons}</Dropdown.Menu>
        </Dropdown>
      </Button.Group>
    );
  }

  return (
    <SearchBarContainer>
      <div style={{ width: "25vw" }}>
        <Form>
          <Form.Input
            icon="search"
            placeholder={placeholder}
            onChange={(data) => onChange(data.target.value)}
            value={value}
          />
        </Form>
      </div>
      <FilterWrapper>{filters}</FilterWrapper>
      <div>{buttongroup}</div>
    </SearchBarContainer>
  );
};

const SearchBarContainer = styled.div`
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
`;
