import React, { useState, useMemo, useEffect } from "react";
import styled from "styled-components";
import { Icon, Popup } from "semantic-ui-react";
import { AnnotationLabelType } from "../../../../types/graphql-api";
import { SpanLabelCard, BlankLabelElement } from "./LabelElements";
import { LabelSelectorDialog } from "./LabelSelectorDialog";
import { TruncatedText } from "../../../widgets/data-display/TruncatedText";
import useWindowDimensions from "../../../hooks/WindowDimensionHook";
import { useCorpusState } from "../../context/CorpusAtom";
import { useFileType } from "../../context/DocumentAtom";

interface LabelSelectorProps {
  sidebarWidth: string;
  activeSpanLabel: AnnotationLabelType | null;
  setActiveLabel: (label: AnnotationLabelType) => void;
}

export const LabelSelector: React.FC<LabelSelectorProps> = ({
  sidebarWidth,
  activeSpanLabel,
  setActiveLabel,
}) => {
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const { fileType } = useFileType();

  const { humanSpanLabels, humanTokenLabels } = useCorpusState();

  // Add detailed debug logging
  useEffect(() => {
    console.log("LabelSelector labels changed:", {
      humanSpanLabels,
      humanTokenLabels,
      fileType,
    });
  }, [humanSpanLabels, humanTokenLabels, fileType]);

  const titleCharCount = width >= 1024 ? 64 : width >= 800 ? 36 : 24;

  const filteredLabelChoices = useMemo(() => {
    // Filter labels based on file type
    const isTextFile = fileType.startsWith("text/");
    const isPdfFile = fileType === "application/pdf";

    let availableLabels: AnnotationLabelType[] = [];
    if (isTextFile) {
      availableLabels = [...humanSpanLabels];
    } else if (isPdfFile) {
      availableLabels = [...humanTokenLabels];
    }

    // Filter out the active label if it exists
    return activeSpanLabel
      ? availableLabels.filter((obj) => obj.id !== activeSpanLabel.id)
      : availableLabels;
  }, [humanSpanLabels, humanTokenLabels, activeSpanLabel, fileType]);

  const onSelect = (label: AnnotationLabelType): void => {
    setActiveLabel(label);
    setOpen(false);
  };

  const handleOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <LabelSelectorContainer id="LabelSelectorContainer">
      <StyledPopup
        trigger={
          <LabelSelectorWidgetContainer $sidebarWidth={sidebarWidth}>
            <LabelSelectorContent>
              <HeaderSection>
                <IconWrapper>
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
        on="click"
        open={open}
        onClose={handleClose}
        onOpen={handleOpen}
        position="top center"
        flowing
        hoverable
      >
        <PopupContent>
          <LabelSelectorDialog
            labels={filteredLabelChoices}
            onSelect={onSelect}
          />
        </PopupContent>
      </StyledPopup>
    </LabelSelectorContainer>
  );
};

const LabelSelectorContainer = styled.div`
  position: relative;
`;

const LoadingContainer = styled.div`
  position: fixed;
  z-index: 1000;
  bottom: 2vh;
  right: 2vw;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f8f9fa;
  border-radius: 8px;
  padding: 10px;
`;

const LabelSelectorWidgetContainer = styled.div<{ $sidebarWidth: string }>`
  position: fixed;
  z-index: 1000;
  bottom: 2vh;
  right: 2vw;
  display: flex;
  flex-direction: row;
  justify-content: center;
  background-color: #f8f9fa;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  transition: all 0.3s ease;
  cursor: pointer;

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

const PopupContent = styled.div`
  width: 300px;
  max-width: 90vw;
`;

const StyledPopup = styled(Popup)`
  &.ui.popup {
    z-index: 2000 !important;
  }
`;
