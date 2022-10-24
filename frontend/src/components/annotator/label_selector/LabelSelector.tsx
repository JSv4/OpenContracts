import React, { useContext, useRef, useState } from "react";
import { Divider, Header, Segment, Popup, Icon } from "semantic-ui-react";

import styled, { ThemeContext } from "styled-components";

import { SpanLabelCard, BlankLabelElement } from "./LabelElements";
import { LabelSelectorDialog } from "./LabelSelectorDialog";

import _ from "lodash";

import "./LabelSelector.css";
import { AnnotationStore } from "../context";
import { AnnotationLabelType } from "../../../graphql/types";
import { TruncatedText } from "../../widgets/data-display/TruncatedText";
import useWindowDimensions from "../../hooks/WindowDimensionHook";

interface LabelSelectorProps {
  sidebarWidth: string;
}

export const LabelSelector = ({ sidebarWidth }: LabelSelectorProps) => {
  const { width } = useWindowDimensions();
  let title_char_count = 24;
  if (width >= 800) {
    title_char_count = 36;
  } else if (width >= 1024) {
    title_char_count = 64;
  }

  const annotationStore = useContext(AnnotationStore);

  // Some labels are not meant to be manually annotated (namely those for
  // analyzer results). The label selector should not allow the user to select
  // labels used by an analyzer (at least not for now), so we need to track that
  // list separately.
  const human_label_choices = annotationStore.humanSpanLabelChoices;
  const active_label = annotationStore.activeSpanLabel;

  const [open, setOpen] = useState(false);

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
    ? human_label_choices.filter((obj) => obj.id !== active_label.id)
    : human_label_choices;

  return (
    <Popup
      open={open}
      onMouseEnter={() => debouncedHover.current(true)}
      onMouseLeave={() => debouncedHover.current(false)}
      position="top left"
      offset={[100, 0]}
      trigger={
        <LabelSelectorWidgetContainer
          sidebarWidth={sidebarWidth}
          onMouseEnter={() => debouncedHover.current(true)}
          onMouseLeave={() => debouncedHover.current(false)}
        >
          <div className="LabelSelector_ContentFlexContainer">
            <Segment
              inverted
              secondary
              className="LabelSelector_HeaderSegment"
              attached="top"
            >
              <div
                className="LabelSelector_Ellipses"
                onClick={() => setOpen(!open)}
              >
                <Icon className="glowable_icon" name="ellipsis vertical" />
              </div>
              <Divider
                horizontal
                style={{ margin: "0px", paddingRight: "10px" }}
              >
                <Header as="h5">
                  <TruncatedText
                    text={
                      active_label
                        ? "Text Label To Apply:"
                        : "Select Text Label to Apply"
                    }
                    limit={title_char_count}
                  />
                </Header>
              </Divider>
            </Segment>
            <Segment
              className="LabelSelector_BodySegment"
              inverted
              secondary
              attached="bottom"
            >
              <div className="LabelSelector_CardWrapperDiv">
                {active_label ? (
                  <SpanLabelCard key={active_label.id} label={active_label} />
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
