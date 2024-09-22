import React, { useState, useRef } from "react";
import styled from "styled-components";
import { Popup, Icon } from "semantic-ui-react";
import _ from "lodash";
import { AnnotationLabelType } from "../../../../graphql/types";
import { SpanLabelCard, BlankLabelElement } from "./LabelElements";
import { LabelSelectorDialog } from "./LabelSelectorDialog";
import { TruncatedText } from "../../../widgets/data-display/TruncatedText";
import useWindowDimensions from "../../../hooks/WindowDimensionHook";

interface LabelSelectorProps {
  sidebarWidth: string;
  humanSpanLabelChoices: AnnotationLabelType[];
  activeSpanLabel: AnnotationLabelType | null;
  setActiveLabel: (label: AnnotationLabelType) => void;
}

export const LabelSelector: React.FC<LabelSelectorProps> = ({
  sidebarWidth,
  humanSpanLabelChoices,
  activeSpanLabel,
  setActiveLabel,
}) => {
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);

  const titleCharCount = width >= 1024 ? 64 : width >= 800 ? 36 : 24;

  const debouncedHover = useRef(
    _.debounce((isOpen: boolean) => {
      setOpen(isOpen);
    }, 500)
  ).current;

  const onSelect = (label: AnnotationLabelType): void => {
    setActiveLabel(label);
    setOpen(false);
  };

  const filteredLabelChoices = activeSpanLabel
    ? humanSpanLabelChoices.filter((obj) => obj.id !== activeSpanLabel.id)
    : humanSpanLabelChoices;

  return (
    <Popup
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      on="click"
      position="top left"
      offset={[0, 10]}
      trigger={
        <LabelSelectorWidgetContainer sidebarWidth={sidebarWidth}>
          <LabelSelectorContent>
            <HeaderSection>
              <IconWrapper onClick={() => setOpen(!open)}>
                <StyledIcon name="ellipsis vertical" />
              </IconWrapper>
              <TruncatedText
                text={
                  activeSpanLabel
                    ? "Text Label To Apply:"
                    : "Select Text Label to Apply"
                }
                limit={titleCharCount}
              />
            </HeaderSection>
            <BodySection>
              {activeSpanLabel ? (
                <SpanLabelCard
                  key={activeSpanLabel.id}
                  label={activeSpanLabel}
                />
              ) : (
                <BlankLabelElement key="Blank_LABEL" />
              )}
            </BodySection>
          </LabelSelectorContent>
        </LabelSelectorWidgetContainer>
      }
    >
      <LabelSelectorDialog labels={filteredLabelChoices} onSelect={onSelect} />
    </Popup>
  );
};

const LabelSelectorWidgetContainer = styled.div<{ sidebarWidth: string }>`
  position: fixed;
  z-index: 1000;
  bottom: 2vh;
  left: calc(${(props) => props.sidebarWidth} + 2vw);
  display: flex;
  flex-direction: row;
  justify-content: center;
  background-color: #f8f9fa;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  transition: all 0.3s ease;

  &:hover {
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.15);
  }
`;

const LabelSelectorContent = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const HeaderSection = styled.div`
  display: flex;
  align-items: center;
  padding: 10px 15px;
  background-color: #e9ecef;
  border-bottom: 1px solid #dee2e6;
`;

const IconWrapper = styled.div`
  margin-right: 10px;
  cursor: pointer;
`;

const StyledIcon = styled(Icon)`
  color: #495057;
  transition: color 0.2s ease;

  &:hover {
    color: #212529;
  }
`;

const BodySection = styled.div`
  padding: 15px;
`;
