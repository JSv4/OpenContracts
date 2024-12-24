import React from "react";
import styled from "styled-components";

const GroupContainer = styled.div`
  display: inline-flex;
  vertical-align: middle;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  overflow: hidden;
`;

const ButtonStyled = styled.button<{
  $isMiddle?: boolean;
  $isAction?: boolean;
}>`
  background-color: ${(props) => (props.$isAction ? "#2185d0" : "#f8f9fa")};
  border: 1px solid ${(props) => (props.$isAction ? "#2185d0" : "#ced4da")};
  color: ${(props) => (props.$isAction ? "#ffffff" : "#495057")};
  padding: 0.375rem 0.75rem;
  font-size: 1rem;
  line-height: 1.5;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s ease-in-out;

  &:hover {
    background-color: ${(props) => (props.$isAction ? "#1678c2" : "#e9ecef")};
  }

  &:focus {
    outline: 0;
    box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
  }

  ${(props) =>
    props.$isMiddle &&
    `
    border-left: none;
    border-right: none;
  `}

  &:first-child {
    border-top-left-radius: 6px;
    border-bottom-left-radius: 6px;
  }

  &:last-child {
    border-top-right-radius: 6px;
    border-bottom-right-radius: 6px;
  }
`;

const TextDisplay = styled(ButtonStyled)`
  background-color: #ffffff;
  cursor: default;
  min-width: 60px;
  font-weight: bold;

  &:hover {
    background-color: #ffffff;
  }
`;

interface CustomButtonGroupProps {
  onZoomOut: () => void;
  onZoomIn: () => void;
  zoomLevel: number;
  onActionClick: () => void;
}

/**
 * A group of buttons for zooming in, zooming out, and accessing additional actions.
 */
export const ZoomButtonGroup: React.FC<CustomButtonGroupProps> = ({
  onZoomOut,
  onZoomIn,
  zoomLevel,
  onActionClick,
}) => {
  return (
    <GroupContainer>
      <ButtonStyled onClick={onZoomOut}>-</ButtonStyled>
      <TextDisplay $isMiddle>{`${(zoomLevel * 100).toFixed(0)}%`}</TextDisplay>
      <ButtonStyled onClick={onZoomIn}>+</ButtonStyled>
      <ButtonStyled $isAction onClick={onActionClick}>
        ⋯
      </ButtonStyled>
    </GroupContainer>
  );
};
