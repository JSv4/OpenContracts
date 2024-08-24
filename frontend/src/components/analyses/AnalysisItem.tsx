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
} from "semantic-ui-react";
import {
  RequestDeleteAnalysisInputType,
  RequestDeleteAnalysisOutputType,
  REQUEST_DELETE_ANALYSIS,
} from "../../graphql/mutations";
import { GetAnalysesOutputs, GET_ANALYSES } from "../../graphql/queries";
import { AnalysisType, CorpusType } from "../../graphql/types";

import _ from "lodash";
import { PermissionTypes } from "../types";
import { getPermissions } from "../../utils/transform";
import { selectedAnalyses, selectedAnalysesIds } from "../../graphql/cache";
import useWindowDimensions from "../hooks/WindowDimensionHook";

interface AnalysisItemProps {
  analysis: AnalysisType;
  corpus: CorpusType;
  selected?: boolean;
  read_only?: boolean;
  compact?: boolean;
  onSelect?: () => any | never;
}

export const AnalysisItem = ({
  analysis,
  corpus,
  selected,
  read_only,
  onSelect,
  compact,
}: AnalysisItemProps) => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= 400;

  //////////////////////////////////////////////////////////////////////
  // There is probably a way to move this to the parent component and pass
  // it in, but the update() function requires a local var that I was having
  // trouble figuring out how to pass in before knowing the analysis id. Obv
  // workaround is defining the mutation within a given analysis' <Card/>
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
      const cache_data: GetAnalysesOutputs | null = cache.readQuery({
        query: GET_ANALYSES,
        variables: { corpusId: corpus.id },
      });
      if (cache_data) {
        const new_cache_data = _.cloneDeep(cache_data);
        new_cache_data.analyses.edges = new_cache_data.analyses.edges.filter(
          (edge) => edge.node.id !== analysis.id
        );
        cache.writeQuery({
          query: GET_ANALYSES,
          variables: { corpusId: corpus.id },
          data: new_cache_data,
        });
      }
    },
  });

  //////////////////////////////////////////////////////////////////////
  // Determine User's Permissions for this Analysis
  const my_permissions = getPermissions(
    analysis.myPermissions ? analysis.myPermissions : []
  );
  const can_delete = my_permissions.includes(PermissionTypes.CAN_REMOVE);

  if (compact) {
    return (
      <Card
        raised
        onClick={
          onSelect && analysis.analysisCompleted ? () => onSelect() : () => {}
        }
        style={{
          padding: ".5em",
          margin: ".75em",
          ...(use_mobile_layout
            ? {
                width: "200px",
              }
            : {
                minWidth: "300px",
              }),
          ...(selected
            ? {
                backgroundColor: "#e2ffdb",
              }
            : {}),
        }}
      >
        <Card.Content>
          {!read_only && can_delete ? (
            <div
              style={{
                position: "absolute",
                bottom: ".5vh",
                right: ".5vh",
                cursor: "pointer",
              }}
            >
              <Button
                circular
                icon="trash"
                color="red"
                onClick={(e) => {
                  e.stopPropagation();
                  selectedAnalyses([]);
                  selectedAnalysesIds([]);
                  requestDeleteAnalysis();
                }}
              />
            </div>
          ) : (
            <></>
          )}
          {!analysis.analysisCompleted ? (
            <Dimmer active inverted>
              <Loader inverted>Processing...</Loader>
            </Dimmer>
          ) : (
            <></>
          )}
          {analysis.analyzer.manifest?.label_set?.icon_data ? (
            <Image
              src={`data:image/png;base64,${analysis.analyzer.manifest?.label_set.icon_data}`}
              floated="right"
              size="mini"
            />
          ) : (
            <></>
          )}
          <Card.Header style={{ wordBreak: "break-all" }}>
            {analysis.analyzer.analyzerId}
          </Card.Header>
          <Card.Meta>
            <span className="date">
              <u>Author</u>: {analysis.analyzer.manifest?.metadata.author_name}
            </span>
          </Card.Meta>
        </Card.Content>
        <Card.Content extra>
          <Label>
            <Icon name="tags" />
            {analysis?.analyzer?.annotationlabelSet?.totalCount
              ? analysis.analyzer.annotationlabelSet.totalCount
              : "0"}{" "}
            Labels
          </Label>
          <Label>
            <Icon name="pencil" /> {analysis.annotations.totalCount} Annot.
          </Label>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card
      raised
      onClick={
        onSelect && analysis.analysisCompleted ? () => onSelect() : () => {}
      }
      style={{
        padding: ".5em",
        margin: ".75em",
        ...(use_mobile_layout
          ? {
              width: "200px",
            }
          : {
              minWidth: "300px",
            }),
        ...(selected
          ? {
              backgroundColor: "#e2ffdb",
            }
          : {}),
      }}
    >
      <Card.Content>
        {!read_only && can_delete ? (
          <div
            style={{
              position: "absolute",
              bottom: ".5vh",
              right: ".5vh",
              cursor: "pointer",
            }}
          >
            <Button
              circular
              icon="trash"
              color="red"
              onClick={(e) => {
                e.stopPropagation();
                selectedAnalyses([]);
                selectedAnalysesIds([]);
                requestDeleteAnalysis();
              }}
            />
          </div>
        ) : (
          <></>
        )}
        {!analysis.analysisCompleted ? (
          <Dimmer active inverted>
            <Loader inverted>Processing...</Loader>
          </Dimmer>
        ) : (
          <></>
        )}
        {analysis.analyzer.manifest?.label_set?.icon_data ? (
          <Image
            src={`data:image/png;base64,${analysis.analyzer.manifest?.label_set.icon_data}`}
            floated="right"
            size="mini"
          />
        ) : (
          <></>
        )}

        <Card.Header>{analysis.analyzer.analyzerId}</Card.Header>
        <Card.Meta>
          <span className="date">
            <u>Author</u>:{" "}
            {analysis.analyzer.manifest?.metadata?.author_name
              ? analysis.analyzer.manifest.metadata.author_name
              : ""}
          </span>
        </Card.Meta>
        <Card.Description>{analysis.analyzer.description}</Card.Description>
      </Card.Content>
      <Card.Content extra>
        <Label>
          <Icon name="tags" />
          {analysis?.analyzer?.annotationlabelSet?.totalCount
            ? analysis.analyzer.annotationlabelSet.totalCount
            : "0"}{" "}
          Labels
        </Label>
        <Label>
          <Icon name="pencil" /> {analysis.annotations.totalCount} Annot.
        </Label>
      </Card.Content>
    </Card>
  );
};
