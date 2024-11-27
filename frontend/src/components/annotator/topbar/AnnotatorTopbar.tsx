import React, { useRef, useLayoutEffect, useState } from "react";
import styled, { keyframes } from "styled-components";
import { Icon } from "semantic-ui-react";
import { useReactiveVar } from "@apollo/client";
import { setTopbarVisible } from "../../../graphql/cache";
import useWindowDimensions from "../../hooks/WindowDimensionHook";
import {
  AnalysisType,
  CorpusType,
  DocumentType,
  ExtractType,
} from "../../../types/graphql-api";
import { ExtractAndAnalysisHorizontalSelector } from "../../analyses/AnalysisSelectorForCorpus";
import { MOBILE_VIEW_BREAKPOINT } from "../../../assets/configurations/constants";

interface AnnotatorTopbarProps {
  opened_corpus: CorpusType | null | undefined;
  opened_document: DocumentType | null | undefined;
  analyses: AnalysisType[];
  extracts: ExtractType[];
  selected_analysis: AnalysisType | null | undefined;
  selected_extract: ExtractType | null | undefined;
  onSelectAnalysis: (analysis: AnalysisType | null) => void;
  onSelectExtract: (extract: ExtractType | null) => void;
  children?: React.ReactNode;
}

// Keyframes for icon animation
const rotateUp = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(180deg);
  }
`;

const rotateDown = keyframes`
  from {
    transform: rotate(180deg);
  }
  to {
    transform: rotate(0deg);
  }
`;

const TopbarContainer = styled.div<{ visible: boolean; height: number }>`
  position: absolute;
  top: ${(props) => (props.visible ? "0" : `-${props.height}px`)};
  left: 0;
  right: 0;
  z-index: 3;
  background-color: #fff;
  transition: top 0.5s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
`;

const ToggleButton = styled.div<{ visible: boolean; topbarHeight: number }>`
  position: absolute;
  top: ${(props) => (props.visible ? `${props.topbarHeight - 20}px` : "20px")};
  right: 20px;
  z-index: 4;
  cursor: pointer;
  width: 40px;
  height: 40px;
  background-color: #4c4f52;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: top 0.5s ease;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  &:hover {
    background-color: #5a5e63;
  }

  .icon {
    color: rgba(255, 255, 255, 0.8);
    animation: ${(props) => (props.visible ? rotateUp : rotateDown)} 0.5s
      forwards;
  }
`;

export const AnnotatorTopbar: React.FC<AnnotatorTopbarProps> = ({
  opened_corpus,
  opened_document,
  analyses,
  extracts,
  selected_analysis,
  selected_extract,
  onSelectAnalysis,
  onSelectExtract,
  children,
}) => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;

  const topbarRef = useRef<HTMLDivElement>(null);
  const [topbarHeight, setTopbarHeight] = useState(0);
  const topbarVisible = useReactiveVar(setTopbarVisible);

  useLayoutEffect(() => {
    if (topbarRef.current) {
      setTopbarHeight(topbarRef.current.offsetHeight);
    }
  }, [topbarVisible]);

  const toggleTopbar = () => {
    setTopbarVisible(!topbarVisible);
  };

  return (
    <div style={{ position: "relative" }}>
      <TopbarContainer
        ref={topbarRef}
        visible={topbarVisible}
        height={topbarHeight}
      >
        {/* Topbar Content */}
        {opened_corpus && (
          <ExtractAndAnalysisHorizontalSelector
            read_only={false}
            corpus={opened_corpus}
            analyses={analyses}
            extracts={extracts}
            selected_analysis={selected_analysis}
            selected_extract={selected_extract}
            onSelectAnalysis={onSelectAnalysis}
            onSelectExtract={onSelectExtract}
          />
        )}
      </TopbarContainer>

      <ToggleButton
        onClick={toggleTopbar}
        visible={topbarVisible}
        topbarHeight={topbarHeight}
      >
        <Icon name="chevron up" size="large" className="icon" />
      </ToggleButton>
    </div>
  );
};
