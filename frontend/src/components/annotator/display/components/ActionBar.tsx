import React, { useContext, useRef, useState, useCallback } from "react";
import { Form, Icon, Popup, Menu, SemanticICONS } from "semantic-ui-react";
import { Search, X } from "lucide-react";
import styled from "styled-components";
import _ from "lodash";
import { AnnotationStore } from "../../context"; // Adjust the import path as needed
import { ZoomButtonGroup } from "../../../widgets/buttons/ZoomButtonGroup";

const ActionBar = styled.div`
  padding: 12px 16px;
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
`;

const StyledMenu = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const StyledSearchInput = styled(Form.Input)`
  width: 50%;
  max-width: 400px;

  .ui.input {
    width: 100%;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  input {
    border: none !important;
    padding-left: 40px !important;
    padding-right: 40px !important;
  }

  i.icon {
    height: 100%;
    display: flex !important;
    align-items: center;
    justify-content: center;
  }

  i.icon:first-child {
    left: 10px !important;
  }

  i.icon:last-child {
    right: 10px !important;
  }
`;

interface PDFActionBarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  actionItems: {
    key: string;
    text: string;
    value: CallableFunction;
    icon?: SemanticICONS;
  }[];
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
  const [isPopupOpen, setIsPopupOpen] = useState(false);

  const { searchForText, searchText } = annotationStore;

  const debouncedDocSearch = useCallback(
    _.debounce((searchTerm: string) => {
      console.log("Searching for", searchTerm);
      searchForText(searchTerm);
    }, 300),
    [searchForText]
  );

  const handleDocSearchChange = (value: string) => {
    searchForText(value);
    debouncedDocSearch(value);
  };

  const clearSearch = () => {
    searchForText("");
    searchForText("");
  };

  const handleActionClick = () => {
    setIsPopupOpen(!isPopupOpen);
  };

  const handleMenuItemClick = (value: CallableFunction) => {
    value();
    setIsPopupOpen(false);
  };

  const actionMenu = (
    <Menu vertical>
      {actionItems.map((item) => (
        <Menu.Item
          key={item.key}
          onClick={() => handleMenuItemClick(item.value)}
        >
          {item.icon && <Icon name={item.icon} />}
          {item.text}
        </Menu.Item>
      ))}
    </Menu>
  );

  return (
    <ActionBar>
      <StyledMenu>
        <Popup
          trigger={
            <ZoomButtonGroup
              onZoomOut={onZoomOut}
              onZoomIn={onZoomIn}
              zoomLevel={zoom}
              onActionClick={handleActionClick}
            />
          }
          style={{ zIndex: 9999999 }}
          content={actionMenu}
          on="click"
          position="bottom right"
          open={isPopupOpen}
          onClose={() => setIsPopupOpen(false)}
          onOpen={() => setIsPopupOpen(true)}
        />
        <StyledSearchInput
          icon={
            searchText ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <Icon as={X} link onClick={clearSearch} />
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <Icon as={Search} />
              </div>
            )
          }
          iconPosition="left"
          placeholder="Search document..."
          value={searchText}
          onChange={(e: any, data: { value: string }) =>
            handleDocSearchChange(data.value)
          }
        />
      </StyledMenu>
    </ActionBar>
  );
};
