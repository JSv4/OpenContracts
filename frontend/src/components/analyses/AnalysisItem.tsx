import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { useMutation } from "@apollo/client";
import { toast } from "react-toastify";
import {
  Button,
  Card,
  Dimmer,
  Icon,
  Image,
  Label,
  Loader,
  Popup,
} from "semantic-ui-react";
import {
  RequestDeleteAnalysisInputType,
  RequestDeleteAnalysisOutputType,
  REQUEST_DELETE_ANALYSIS,
} from "../../graphql/mutations";
import { GetAnalysesOutputs, GET_ANALYSES } from "../../graphql/queries";
import { AnalysisType, CorpusType } from "../../types/graphql-api";
import _ from "lodash";
import { PermissionTypes } from "../types";
import { getPermissions } from "../../utils/transform";
import { selectedAnalyses, selectedAnalysesIds } from "../../graphql/cache";
import useWindowDimensions from "../hooks/WindowDimensionHook";
import { MOBILE_VIEW_BREAKPOINT } from "../../assets/configurations/constants";
import { useSelectedCorpus } from "../annotator/context/DocumentAtom";

interface AnalysisItemProps {
  analysis: AnalysisType;
  selected?: boolean;
  read_only?: boolean;
  compact?: boolean;
  onSelect?: () => any | never;
  corpus?: CorpusType | null | undefined;
}

const StyledCard = styled(Card).withConfig({
  shouldForwardProp: (prop) => !["useMobileLayout", "selected"].includes(prop),
})`
  display: flex !important;
  flex-direction: column !important;
  padding: 0.5em !important;
  margin: 0.75em !important;
  width: ${(props) => (props.useMobileLayout ? "200px" : "300px")} !important;
  min-width: ${(props) =>
    props.useMobileLayout ? "200px" : "300px"} !important;
  background-color: ${(props) =>
    props.selected ? "#e2ffdb" : "white"} !important;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;

  &:hover {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15) !important;
    transform: translateY(-2px);
  }
`;

const CardContent = styled(Card.Content)`
  flex: 1 !important;
  overflow: hidden !important;
`;

const CardHeader = styled(Card.Header)`
  font-size: 1.1em !important;
  word-break: break-word !important;
  margin-bottom: 0.5em !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CardMeta = styled(Card.Meta)`
  font-size: 0.9em !important;
  margin-bottom: 0.5em !important;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ExtraContent = styled(Card.Content)`
  padding-top: 0.5em !important;
  border-top: 1px solid rgba(0, 0, 0, 0.05) !important;
`;

const LabelContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5em;
`;

const StyledLabel = styled(Label)`
  margin: 0 !important;
  font-size: 0.85em !important;
`;

const DeleteButton = styled(Button)`
  position: absolute !important;
  top: 0.5em !important;
  right: 0.5em !important;
  padding: 0.5em !important;
  opacity: 0.7;
  transition: opacity 0.3s ease;

  &:hover {
    opacity: 1;
  }
`;

const CardDescription = styled(Card.Description)`
  max-height: 3.6em;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  position: relative;
`;

const ReadMoreLink = styled.span`
  color: #4183c4;
  cursor: pointer;
  position: absolute;
  bottom: 0;
  right: 0;
  background: white;
  padding-left: 4px;
`;

export const AnalysisItem = ({
  analysis,
  selected,
  read_only,
  onSelect,
  compact,
  corpus: selectedCorpus,
}: AnalysisItemProps) => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;
  const descriptionRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      if (descriptionRef.current) {
        const element = descriptionRef.current;
        setIsOverflowing(element.scrollHeight > element.clientHeight);
      }
    };

    checkOverflow();
    window.addEventListener("resize", checkOverflow);
    return () => window.removeEventListener("resize", checkOverflow);
  }, [analysis.analyzer.description]);

  const [requestDeleteAnalysis] = useMutation<
    RequestDeleteAnalysisOutputType,
    RequestDeleteAnalysisInputType
  >(REQUEST_DELETE_ANALYSIS, {
    variables: {
      id: analysis.id,
    },
    onCompleted: (data) => {
      toast.success("Analysis deleting...");
    },
    onError: (data) => {
      toast.error("Could not delete analysis...");
    },
    update: (cache, { data: delete_analysis_data }) => {
      if (!selectedCorpus) return;

      const cache_data: GetAnalysesOutputs | null = cache.readQuery({
        query: GET_ANALYSES,
        variables: { corpusId: selectedCorpus.id },
      });

      if (cache_data) {
        const new_cache_data = _.cloneDeep(cache_data);
        new_cache_data.analyses.edges = new_cache_data.analyses.edges.filter(
          (edge) => edge.node.id !== analysis.id
        );
        cache.writeQuery({
          query: GET_ANALYSES,
          variables: { corpusId: selectedCorpus.id },
          data: new_cache_data,
        });
      }
    },
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedCorpus) {
      toast.error("No corpus selected");
      return;
    }
    selectedAnalyses([]);
    selectedAnalysesIds([]);
    requestDeleteAnalysis();
  };

  const my_permissions = getPermissions(
    analysis.myPermissions ? analysis.myPermissions : []
  );
  const can_delete = my_permissions.includes(PermissionTypes.CAN_REMOVE);

  return (
    <StyledCard
      raised
      onClick={
        onSelect && analysis.analysisCompleted ? () => onSelect() : () => {}
      }
      useMobileLayout={use_mobile_layout}
      selected={selected}
    >
      {analysis.corpusAction && (
        <Label attached="top" color="green" size="tiny">
          <Icon name="cog" /> Action - {analysis.corpusAction.name}
        </Label>
      )}
      <CardContent>
        {!read_only && can_delete && (
          <DeleteButton
            circular
            icon="trash"
            color="red"
            size="tiny"
            onClick={handleDelete}
            disabled={!selectedCorpus}
            title={!selectedCorpus ? "No corpus selected" : "Delete analysis"}
          />
        )}
        {!analysis.analysisCompleted && (
          <Dimmer active inverted>
            <Loader inverted>Processing...</Loader>
          </Dimmer>
        )}
        {analysis.analyzer.manifest?.label_set?.icon_data && (
          <Image
            src={`data:image/png;base64,${analysis.analyzer.manifest.label_set.icon_data}`}
            floated="right"
            size="mini"
          />
        )}
        <CardHeader>{analysis.analyzer.analyzerId}</CardHeader>
        <CardMeta>
          <span className="date">
            <u>Author</u>:{" "}
            {analysis.analyzer.manifest?.metadata?.author_name || ""}
          </span>
        </CardMeta>
        {!compact && (
          <CardDescription>
            <div ref={descriptionRef}>
              {analysis.analyzer.description}
              {isOverflowing && !showFullDescription && (
                <ReadMoreLink
                  onClick={(
                    e: React.MouseEvent<HTMLSpanElement, MouseEvent>
                  ) => {
                    e.stopPropagation();
                    setShowFullDescription(true);
                  }}
                >
                  ...more
                </ReadMoreLink>
              )}
            </div>
          </CardDescription>
        )}
        {showFullDescription && (
          <Popup
            wide
            trigger={<span style={{ display: "none" }}></span>}
            content={analysis.analyzer.description}
            on="click"
            open={true}
            onClose={() => setShowFullDescription(false)}
            position="bottom center"
          />
        )}
      </CardContent>
      <ExtraContent extra>
        <LabelContainer>
          <StyledLabel>
            <Icon name="tags" />
            {analysis?.analyzer?.annotationlabelSet?.totalCount || 0} Labels
          </StyledLabel>
          <StyledLabel>
            <Icon name="pencil" /> {analysis.annotations.totalCount} Annot.
          </StyledLabel>
        </LabelContainer>
      </ExtraContent>
    </StyledCard>
  );
};
