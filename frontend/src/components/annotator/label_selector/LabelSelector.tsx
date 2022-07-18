import React, { useContext, useRef, useState } from "react";
import { Divider, Header, Segment, Popup, Icon } from "semantic-ui-react";

import styled, { ThemeContext } from "styled-components";

import { LabelElement, BlankLabelElement } from "./LabelElements";
import { LabelSelectorDialog } from "./LabelSelectorDialog";

import _ from "lodash";

import "./LabelSelector.css";
import { AnnotationStore } from "../context";
import { AnnotationLabelType } from "../../../graphql/types";

interface LabelSelectorProps {
  sidebarWidth: string;
}

export const LabelSelector = ({ sidebarWidth }: LabelSelectorProps) => {
  const annotationStore = useContext(AnnotationStore);

  const label_choices = annotationStore.labels;
  const active_label = annotationStore.activeLabel;

  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  const debouncedHover = useRef(
    _.debounce((open) => {
      setOpen(open);
    }, 500)
  );

  const onSelect = (label: AnnotationLabelType): void => {
    annotationStore.setActiveLabel(label);
  };

  // Filter out already applied labels from the label options
  let filtered_label_choices = active_label
    ? label_choices.filter((obj) => obj.id !== active_label.id)
    : label_choices;

  return (
    <Popup
      open={open}
      onMouseEnter={() => debouncedHover.current(true)}
      onMouseLeave={() => debouncedHover.current(false)}
      position="top right"
      offset={[-30, -10]}
      trigger={
        <LabelSelectorWidgetContainer
          sidebarWidth={sidebarWidth}
          onMouseEnter={() => debouncedHover.current(true)}
          onMouseLeave={() => debouncedHover.current(false)}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-end",
            }}
          >
            <Segment
              secondary
              className="main_body"
              attached="top"
              style={{ padding: "8px 0px 6px 8px" }}
            >
              <div
                style={{ float: "right", cursor: "pointer" }}
                onClick={() => setOpen(!open)}
              >
                <Icon className="glowable_icon" name="ellipsis vertical" />
              </div>
              <Divider
                horizontal
                style={{ margin: "0px", paddingRight: "10px" }}
              >
                <Header as="h5">
                  {active_label
                    ? "Text Label To Apply:"
                    : "Select Text Label to Apply"}
                </Header>
              </Divider>
            </Segment>
            <Segment secondary attached="bottom" style={{ padding: "8px" }}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  flex: 1,
                }}
              >
                {active_label ? (
                  <LabelElement key={active_label.id} label={active_label} />
                ) : (
                  <BlankLabelElement key="Blank_LABEL" />
                )}
              </div>
            </Segment>
          </div>
        </LabelSelectorWidgetContainer>
      }
    >
      <LabelSelectorDialog
        labels={filtered_label_choices}
        onSelect={onSelect}
      />
    </Popup>
  );
};

interface LabelSelectorWidgetContainerProps {
  sidebarWidth: string;
}

const LabelSelectorWidgetContainer =
  styled.div<LabelSelectorWidgetContainerProps>(
    ({ sidebarWidth }) => `
  position: fixed;
  z-index: 1000;
  bottom: 2vh;
  left: calc(${sidebarWidth} + 2vw);
  display: flex;
  flex-direction: row;
  justify-content: center;
`
  );
