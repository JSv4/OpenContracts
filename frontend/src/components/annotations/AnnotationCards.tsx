import React, { useEffect, useState } from "react";
import { useReactiveVar } from "@apollo/client";
import { useLocation, useNavigate } from "react-router-dom";
import _ from "lodash";
import styled from "styled-components";
import { Card, Dimmer, Loader, Label, Header, Popup } from "semantic-ui-react";
import {
  Tags,
  FileText,
  BookOpen,
  Database,
  User,
  BotIcon,
  Layers,
} from "lucide-react";

import { PlaceholderCard } from "../placeholders/PlaceholderCard";
import {
  selectedAnnotation,
  openedDocument,
  openedCorpus,
  selectedAnalysesIds,
  displayAnnotationOnAnnotatorLoad,
} from "../../graphql/cache";
import {
  ServerAnnotationType,
  PageInfo,
  CorpusType,
  DocumentType,
} from "../../graphql/types";
import { FetchMoreOnVisible } from "../widgets/infinite_scroll/FetchMoreOnVisible";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { determineCardColCount } from "../../utils/layout";
import { MOBILE_VIEW_BREAKPOINT } from "../../assets/configurations/constants";

const StyledCard = styled(Card)`
  &.ui.card {
    height: 220px;
    display: flex;
    flex-direction: column;
    transition: all 0.3s ease;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    border-radius: 8px;
    overflow: hidden;
    position: relative;

    &:hover {
      box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
      transform: translateY(-2px);
    }

    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 1rem;
      position: relative;
      z-index: 1;
    }

    .header {
      margin-bottom: 0.5rem;
    }

    .description {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }

    .extra {
      padding: 0.5rem 1rem;
      background-color: rgba(248, 249, 250, 0.9);
      border-top: 1px solid rgba(0, 0, 0, 0.05);
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: relative;
      z-index: 1;
    }
  }
`;

const GradientOverlay = styled.div`
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60%;
  background: linear-gradient(
    to bottom,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.8) 100%
  );
  pointer-events: none;
`;

const PageNumber = styled.div`
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background-color: rgba(255, 255, 255, 0.8);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: bold;
  display: flex;
  align-items: center;
  z-index: 2;
`;

const TagLabel = styled(Label)`
  &.ui.label {
    display: flex;
    align-items: center;
    margin-bottom: 0.5rem;
    border-radius: 4px;
    z-index: 2;

    svg {
      margin-right: 0.3rem;
    }
  }
`;

const SourceLabel = styled.div`
  display: flex;
  align-items: center;
  font-size: 0.9rem;
  color: #555;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  background-color: #f0f0f0;

  svg {
    margin-right: 0.3rem;
  }
`;

interface AnnotationToNavigateTo {
  selected_annotation: ServerAnnotationType;
  selected_corpus: CorpusType;
  selected_document: DocumentType;
}

interface AnnotationCardProps {
  style?: React.CSSProperties;
  items: ServerAnnotationType[];
  pageInfo: PageInfo | undefined | null;
  loading: boolean;
  loading_message: string;
  fetchMore: (args?: any) => void | any;
}

export const AnnotationCards: React.FC<AnnotationCardProps> = ({
  style,
  items,
  pageInfo,
  loading,
  loading_message,
  fetchMore,
}) => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;
  const card_cols = determineCardColCount(width);

  const selected_annotation = useReactiveVar(selectedAnnotation);
  const [targetAnnotation, setTargetAnnotation] =
    useState<AnnotationToNavigateTo>();
  const location = useLocation();
  const navigate = useNavigate();

  const handleUpdate = () => {
    if (!loading && pageInfo?.hasNextPage) {
      console.log("Fetching more annotation cards...");
      fetchMore({
        variables: {
          limit: 20,
          cursor: pageInfo.endCursor,
        },
      });
    }
  };

  useEffect(() => {
    if (targetAnnotation) {
      displayAnnotationOnAnnotatorLoad(targetAnnotation.selected_annotation);
      selectedAnnotation(targetAnnotation.selected_annotation);
      openedDocument(targetAnnotation.selected_document);
      openedCorpus(targetAnnotation.selected_corpus);
      if (targetAnnotation.selected_annotation.analysis?.id) {
        selectedAnalysesIds([targetAnnotation.selected_annotation.analysis.id]);
      }
      setTargetAnnotation(undefined);
      if (location.pathname !== "/") {
        navigate("/");
      }
    }
  }, [targetAnnotation]);

  const getSourceInfo = (item: ServerAnnotationType) => {
    if (item.structural) {
      return {
        icon: <Layers size={14} />,
        label: "Structural Layout",
        color: "#6200ea",
      };
    } else if (
      item?.analysis?.analyzer?.analyzerId?.toLowerCase().includes("manually")
    ) {
      return {
        icon: <User size={14} />,
        label: "Manually-Annotated",
        color: "#4CAF50",
      };
    } else if (
      item.analysis?.analyzer?.analyzerId?.toLowerCase().includes("extract")
    ) {
      return {
        icon: <Database size={14} />,
        label: "Extract",
        color: "#2196F3",
      };
    } else {
      return {
        icon: <BotIcon size={14} />,
        label: item.analysis?.analyzer.analyzerId || "Analysis",
        color: "#FF9800",
      };
    }
  };

  const renderCards = () => {
    if (!items || items.length === 0) {
      return [<PlaceholderCard key={0} title="No Matching Annotations..." />];
    }

    return _.uniqBy(items, "id").map((item) => {
      const sourceInfo = getSourceInfo(item);

      return (
        <StyledCard
          key={item.id}
          style={{
            backgroundColor:
              item.id === selected_annotation?.id ? "#e2ffdb" : "",
          }}
          onClick={() => {
            if (item && item.document && item.corpus) {
              setTargetAnnotation({
                selected_annotation: item,
                selected_corpus: item.corpus,
                selected_document: item.document,
              });
            }
          }}
        >
          <GradientOverlay />
          <Card.Content>
            <PageNumber>
              <BookOpen size={14} style={{ marginRight: "4px" }} />
              Page {item.page + 1}
            </PageNumber>
            <TagLabel color={item.annotationLabel?.color || "grey"}>
              <Tags size={14} />
              {item.annotationLabel ? item.annotationLabel.text : "Unknown"}
            </TagLabel>
            <Header as="h4">Tagged Text:</Header>
            <Popup
              content={item.rawText}
              trigger={
                <Card.Description>
                  {item.rawText?.substring(0, 100)}...
                </Card.Description>
              }
            />
          </Card.Content>
          <Card.Content extra>
            <SourceLabel
              style={{
                backgroundColor: `${sourceInfo.color}20`,
                color: sourceInfo.color,
              }}
            >
              {sourceInfo.icon}
              <span>{sourceInfo.label}</span>
            </SourceLabel>
            {item && item.document && item.corpus && (
              <Popup
                content={item.document.title}
                trigger={
                  <Label
                    as="div"
                    corner="right"
                    style={{ cursor: "pointer", zIndex: 2 }}
                  >
                    <FileText size={14} />
                  </Label>
                }
              />
            )}
          </Card.Content>
        </StyledCard>
      );
    });
  };

  const cardGroupStyle: React.CSSProperties = {
    width: "100%",
    padding: "1rem",
    ...(use_mobile_layout ? { paddingLeft: "0px", paddingRight: "0px" } : {}),
  };

  return (
    <>
      <Dimmer active={loading}>
        <Loader content={loading_message} />
      </Dimmer>
      <div
        style={{
          flex: 1,
          width: "100%",
          overflowY: "auto",
          ...style,
        }}
      >
        <Card.Group stackable itemsPerRow={card_cols} style={cardGroupStyle}>
          {renderCards()}
        </Card.Group>
        <FetchMoreOnVisible fetchNextPage={handleUpdate} />
      </div>
    </>
  );
};
