import React, { useState, useRef } from "react";
import { Icon, Popup, Button, IconGroup, Menu } from "semantic-ui-react";
import styled, { keyframes } from "styled-components";

const pulse = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(33, 133, 208, 0.4);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(33, 133, 208, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(33, 133, 208, 0);
  }
`;

const MainIconWrapper = styled.div<{ color: string }>`
  position: relative;
  cursor: pointer;
  height: 65px;
  width: 65px;
  transition: all 0.3s ease;
  border-radius: 50%;
  padding: 0px;
  animation: ${pulse} 2s infinite;

  &:hover {
    transform: scale(1.1);
  }
`;

interface AnnotatorModeToggleProps {
  mode: "ANNOTATE" | "ANALYZE";
  allow_input: boolean;
  read_only: boolean;
  setMode: (mode: "ANNOTATE" | "ANALYZE") => void;
  setAllowInput: (v: boolean) => void;
}

export const AnnotatorModeToggle: React.FC<AnnotatorModeToggleProps> = ({
  mode,
  allow_input,
  read_only,
  setMode,
  setAllowInput,
}) => {
  const [open, setOpen] = useState(false);
  const contextRef = useRef<HTMLDivElement>(null);

  const mainColor = mode === "ANALYZE" ? "blue" : "green";
  const secondaryColor = mode === "ANALYZE" ? "purple" : "orange";

  const handleItemClick = (action: "toggle" | "input") => {
    if (action === "toggle") {
      setMode(mode === "ANALYZE" ? "ANNOTATE" : "ANALYZE");
    } else {
      setAllowInput(!allow_input);
    }
    setOpen(false);
  };

  return (
    <div>
      <MainIconWrapper
        color={mode === "ANALYZE" ? "#2185d0" : "#21ba45"}
        ref={contextRef}
        onClick={() => setOpen(true)}
      >
        <IconGroup size="big" style={{ fontSize: "55px", padding: "5px" }}>
          <Icon
            color={mainColor}
            name={mode === "ANALYZE" ? "chart bar" : "user"}
          />
          {allow_input && (
            <Icon
              corner="top right"
              name={mode === "ANALYZE" ? "thumbs up" : "edit"}
            />
          )}
        </IconGroup>
      </MainIconWrapper>

      <Popup
        context={contextRef}
        open={open}
        onClose={() => setOpen(false)}
        position="right center"
      >
        <Menu secondary vertical>
          <Menu.Item
            disabled={read_only}
            onClick={() => handleItemClick("toggle")}
          >
            <Icon name={mode === "ANALYZE" ? "user" : "chart bar"} />
            {mode === "ANALYZE"
              ? "Switch to Annotator"
              : "Switch to Analyzer View"}
          </Menu.Item>
          <Menu.Item
            disabled={read_only}
            onClick={() => handleItemClick("input")}
          >
            <Icon name={mode === "ANALYZE" ? "thumbs up" : "edit"} />
            {mode === "ANALYZE" ? "Enable Feedback" : "Enable Edits"}
          </Menu.Item>
        </Menu>
      </Popup>
    </div>
  );
};
