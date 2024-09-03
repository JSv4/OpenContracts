import React, { useContext, useRef, useState } from "react";
import {
  Button,
  ButtonGroup,
  ButtonOr,
  Dropdown,
  Form,
  Icon,
} from "semantic-ui-react";
import { ZoomIn, ZoomOut } from "lucide-react";
import styled from "styled-components";
import _ from "lodash";
import { AnnotationStore } from "../context"; // Adjust the import path as needed

const ActionBar = styled.div`
  padding: 10px;
  background-color: #f0f0f0;
`;

const StyledMenu = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-start;
`;

const LeftGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const RightGroup = styled.div`
  display: flex;
  align-items: center;
  padding-left: 1rem;
`;

interface PDFActionBarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  actionItems: { key: string; text: string; value: string }[];
  onActionSelect?: (value: string) => void;
}

export const PDFActionBar: React.FC<PDFActionBarProps> = ({
  zoom,
  onZoomIn,
  onZoomOut,
  actionItems,
  onActionSelect,
}) => {
  const annotationStore = useContext(AnnotationStore);

  const {
    textSearchMatches,
    searchForText,
    searchText,
    selectedTextSearchMatchIndex,
  } = annotationStore;

  const [docSearchCache, setDocSeachCache] = useState<string | undefined>(
    searchText
  );

  const handleDocSearchChange = (value: string) => {
    setDocSeachCache(value);
    debouncedDocSearch.current(value);
  };

  const debouncedDocSearch = useRef(
    _.debounce((searchTerm: string) => {
      searchForText(searchTerm);
    }, 1000)
  );

  const clearSearch = () => {
    setDocSeachCache("");
    searchForText("");
  };

  return (
    <ActionBar>
      <StyledMenu>
        <LeftGroup>
          <ButtonGroup>
            <Button icon onClick={onZoomOut}>
              <ZoomOut />
            </Button>
            <ButtonOr text={zoom.toFixed(1)} />
            <Button icon onClick={onZoomIn}>
              <ZoomIn />
            </Button>
          </ButtonGroup>
          <Form>
            <Form.Input
              iconPosition="left"
              icon={
                <Icon
                  name={searchText ? "cancel" : "search"}
                  link
                  onClick={searchText ? () => clearSearch() : () => {}}
                />
              }
              placeholder="Search document..."
              onChange={(e, data) => handleDocSearchChange(data.value)}
              value={docSearchCache}
              style={textSearchMatches.length > 0 ? { color: "green" } : {}}
            />
          </Form>
        </LeftGroup>
        <RightGroup>
          <Dropdown
            button
            className="icon"
            floating
            labeled
            icon="tasks"
            options={actionItems}
            search
            text="Actions"
            onChange={(e, data) =>
              onActionSelect && onActionSelect(data.value as string)
            }
            style={{ paddingRight: "5rem" }}
          />
        </RightGroup>
      </StyledMenu>
    </ActionBar>
  );
};
