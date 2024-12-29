import React, { useState, useMemo, useEffect } from "react";
import styled from "styled-components";
import { Icon, Popup, Button } from "semantic-ui-react";
import { AnnotationLabelType } from "../../../../types/graphql-api";
import { SpanLabelCard, BlankLabelElement } from "./LabelElements";
import { LabelSelectorDialog } from "./LabelSelectorDialog";
import { TruncatedText } from "../../../widgets/data-display/TruncatedText";
import useWindowDimensions from "../../../hooks/WindowDimensionHook";
import { useCorpusState } from "../../context/CorpusAtom";
import { useSelectedDocument } from "../../context/DocumentAtom";

interface LabelSelectorProps {
  sidebarWidth: string;
  activeSpanLabel: AnnotationLabelType | null;
  setActiveLabel: (label: AnnotationLabelType | undefined) => void;
}

export const LabelSelector: React.FC<LabelSelectorProps> = ({
  sidebarWidth,
  activeSpanLabel,
  setActiveLabel,
}) => {
  const { width } = useWindowDimensions();
  const [open, setOpen] = useState(false);

  const { selectedDocument } = useSelectedDocument();
  const { humanSpanLabels, humanTokenLabels } = useCorpusState();

  const titleCharCount = width >= 1024 ? 64 : width >= 800 ? 36 : 24;

  const filteredLabelChoices = useMemo(() => {
    // Filter labels based on file type
    const isTextFile = selectedDocument?.fileType?.startsWith("text/") ?? false;
    const isPdfFile = selectedDocument?.fileType === "application/pdf" ?? false;

    let availableLabels: AnnotationLabelType[] = [];
    if (isTextFile) {
      availableLabels = [...humanSpanLabels];
    } else if (isPdfFile) {
      availableLabels = [...humanTokenLabels];
    }
    console.log("filtered for filetype", selectedDocument?.fileType);
    console.log("availableLabels", availableLabels);

    // Filter out the active label if it exists
    return activeSpanLabel
      ? availableLabels.filter((obj) => obj.id !== activeSpanLabel.id)
      : availableLabels;
  }, [
    humanSpanLabels,
    humanTokenLabels,
    activeSpanLabel,
    selectedDocument?.id,
  ]);

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

  useEffect(() => {
    console.log("LabelSelector - activeSpanLabel changed:", activeSpanLabel);
  }, [activeSpanLabel]);

  useEffect(() => {
    console.log("LabelSelector - selectedDocument changed:", selectedDocument);
  }, [selectedDocument]);

  useEffect(() => {
    console.log("LabelSelector - humanSpanLabels changed:", humanSpanLabels);
    console.log("LabelSelector - humanTokenLabels changed:", humanTokenLabels);
  }, [humanSpanLabels, humanTokenLabels]);

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
                  <>
                    <SpanLabelCard
                      key={activeSpanLabel.id}
                      label={activeSpanLabel}
                    />
                    <ClearButton
                      icon
                      circular
                      size="tiny"
                      onClick={(e: { stopPropagation: () => void }) => {
                        e.stopPropagation();
                        setActiveLabel(undefined);
                      }}
                    >
                      <Icon name="x" />
                    </ClearButton>
                  </>
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
  display: flex;
  align-items: center;
  gap: 10px;
`;

const ClearButton = styled(Button)`
  &.ui.button {
    padding: 8px;
    min-width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
  }
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
