import { useState } from "react";
import { Button, Form, Dropdown, Popup } from "semantic-ui-react";
import styled from "styled-components";
import { FilterWrapper, MobileFilterWrapper } from "../common";
import useWindowDimensions from "../hooks/WindowDimensionHook";

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
  style?: object | {};
  onChange: (search_string: string) => any | void;
}

export const CreateAndSearchBar = ({
  actions,
  filters,
  placeholder,
  value,
  style,
  onChange,
}: CreateAndSearchBarProps) => {
  const [expand_filters, setExpandFilters] = useState(false);

  const { width } = useWindowDimensions();
  const use_responsive_layout = width <= 1000;
  const use_mobile_layout = width <= 400;

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
        {use_mobile_layout ? (
          <></>
        ) : (
          <Button disabled={buttons?.length === 0}>Actions</Button>
        )}
        <Dropdown
          disabled={buttons?.length === 0}
          className="button icon"
          floating
          icon="ellipsis vertical"
          trigger={<></>}
        >
          <Dropdown.Menu>{buttons}</Dropdown.Menu>
        </Dropdown>
      </Button.Group>
    );
  }

  if (use_responsive_layout) {
    return (
      <MobileSearchBarContainer>
        <SearchBarContainer style={style}>
          <div
            style={
              use_mobile_layout
                ? {
                    width: "175px",
                  }
                : {
                    width: "25vw",
                    minWidth: "175px",
                    maxWidth: "400px",
                  }
            }
          >
            <Form>
              <Form.Input
                icon="search"
                placeholder={placeholder}
                onChange={(data) => onChange(data.target.value)}
                value={value}
              />
            </Form>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "flex-end",
            }}
          >
            {filters ? (
              <Popup
                trigger={
                  <div>
                    <Button icon="filter" />
                  </div>
                }
                offset={[-35, 0]}
                content={<MobileFilterWrapper>{filters}</MobileFilterWrapper>}
                on="click"
                position="bottom right"
              />
            ) : (
              <></>
            )}
            <div>{buttongroup}</div>
          </div>
        </SearchBarContainer>
      </MobileSearchBarContainer>
    );
  } else {
    return (
      <SearchBarContainer style={style}>
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
  }
};

const SearchBarContainer = styled.div`
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
`;

const MobileSearchBarContainer = styled.div`
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
`;
