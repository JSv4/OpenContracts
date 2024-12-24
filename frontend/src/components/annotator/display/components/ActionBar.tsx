import React, { useState, useCallback } from "react";
import { Form, Icon, Popup, Menu, SemanticICONS } from "semantic-ui-react";
import { Search, X } from "lucide-react";
import styled from "styled-components";
import _ from "lodash";
import { ZoomButtonGroup } from "../../../widgets/buttons/ZoomButtonGroup";
import { useSearchText } from "../../context/DocumentAtom";
import { useTextSearch } from "../../hooks/useTextSearch";
import { ChangeEvent } from "react";

const ActionBarContainer = styled.div`
  position: sticky;
  top: 0;
  z-index: 500;
  padding: 8px 16px;
  background-color: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
  height: 60px;
  display: flex;
  align-items: center;
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

/**
 * Debounce delay in milliseconds for search input
 */
const DEBOUNCE_DELAY = 600;

/**
 * Action bar for the PDF viewer, including zoom controls and a search bar.
 */
export const PDFActionBar: React.FC<PDFActionBarProps> = ({
  zoom,
  onZoomIn,
  onZoomOut,
  actionItems,
  onActionSelect,
}) => {
  const { searchText, setSearchText } = useSearchText();
  const [localSearchText, setLocalSearchText] = useState(searchText);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  useTextSearch();

  // Create a memoized debounced function with proper typing
  const debouncedSetSearchText = useCallback(
    _.debounce((value: string) => {
      setSearchText(value);
    }, DEBOUNCE_DELAY),
    [] // Empty dependency array since setSearchText is stable
  );

  const handleDocSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Update local state immediately for UI responsiveness
    setLocalSearchText(value);
    // Debounce the actual search operation
    debouncedSetSearchText(value);
  };

  // Clean up the debounced function on component unmount
  React.useEffect(() => {
    return () => {
      debouncedSetSearchText.cancel();
    };
  }, [debouncedSetSearchText]);

  const clearSearch = () => {
    setSearchText("");
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
    <ActionBarContainer>
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
          style={{ zIndex: 9999 }}
          content={actionMenu}
          on="click"
          position="bottom right"
          open={isPopupOpen}
          onClose={() => setIsPopupOpen(false)}
          onOpen={() => setIsPopupOpen(true)}
        />
        <StyledSearchInput
          icon={
            localSearchText ? (
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
          value={localSearchText}
          onChange={handleDocSearchChange}
        />
      </StyledMenu>
    </ActionBarContainer>
  );
};
