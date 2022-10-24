import { useQuery, useReactiveVar } from "@apollo/client";
import { useRef, useState } from "react";
import {
  Dimmer,
  Loader,
  Segment,
  Form,
  Button,
  Dropdown,
  Popup,
} from "semantic-ui-react";
import {
  analysisSearchTerm,
  openedCorpus,
  selectedAnalyses,
  selectedAnalysesIds,
  showAnalyzerSelectionForCorpus,
} from "../../graphql/cache";
import {
  GetAnalysesInputs,
  GetAnalysesOutputs,
  GET_ANALYSES,
} from "../../graphql/queries";
import { AnalysisType, CorpusType } from "../../graphql/types";
import { PlaceholderItem } from "../placeholders/PlaceholderItem";
import { LooseObject } from "../types";
import { AnalysisItem } from "./AnalysisItem";

import _ from "lodash";
import { PlaceholderCard } from "../placeholders/PlaceholderCard";
import useWindowDimensions from "../hooks/WindowDimensionHook";

interface AnalysisSelectorForCorpusProps {
  corpus: CorpusType;
  read_only: boolean;
}

export const HorizontalAnalysisSelectorForCorpus = ({
  corpus,
  read_only,
}: AnalysisSelectorForCorpusProps) => {
  //////////////////////////////////////////////////////////////////////
  // Responsive Layout
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= 400;

  //////////////////////////////////////////////////////////////////////
  // Local State Vars
  const [searchBuffer, setSearchBuffer] = useState<string>(
    "Search for Analysis..."
  );

  //////////////////////////////////////////////////////////////////////
  // Global State Vars in Apollo Cache
  const opened_corpus = useReactiveVar(openedCorpus);
  const analysis_search_term = useReactiveVar(analysisSearchTerm);
  const analyses_to_display = useReactiveVar(selectedAnalyses);
  const analysis_ids_to_display = analyses_to_display.map(
    (analysis) => analysis.id
  );

  //////////////////////////////////////////////////////////////////////
  // Craft the query variables obj based on current application state
  const analyses_variables: LooseObject = {
    corpusId: corpus.id,
  };
  if (analysis_search_term) {
    analyses_variables["searchText"] = analysis_search_term;
  }
  //////////////////////////////////////////////////////////////////////

  //////////////////////////////////////////////////////////////////////
  // Debounce the search function
  const debouncedAnalyzerSearch = useRef(
    _.debounce((searchTerm) => {
      analysisSearchTerm(searchTerm);
    }, 1000)
  );

  const handleAnalysisSearchChange = (value: string) => {
    setSearchBuffer(value);
    debouncedAnalyzerSearch.current(value);
  };
  //////////////////////////////////////////////////////////////////////

  const toggleAnalysis = (selected_analysis: AnalysisType) => {
    if (analysis_ids_to_display.includes(selected_analysis.id)) {
      let cleaned_analyses = analyses_to_display.filter(
        (analysis) => analysis.id !== selected_analysis.id
      );
      selectedAnalyses(cleaned_analyses);
      selectedAnalysesIds(cleaned_analyses.map((analysis) => analysis.id));
    } else {
      selectedAnalysesIds(
        [...analyses_to_display, selected_analysis].map(
          (analysis) => analysis.id
        )
      );
      selectedAnalyses([...analyses_to_display, selected_analysis]);
    }
  };

  const {
    refetch: refetchAnalyses,
    loading: loading_analyses,
    error: analyses_load_error,
    data: analyses_response,
    fetchMore: fetchMoreAnalyses,
  } = useQuery<GetAnalysesOutputs, GetAnalysesInputs>(GET_ANALYSES, {
    variables: analyses_variables,
    fetchPolicy: "network-only",
    notifyOnNetworkStatusChange: true,
  });

  const analyses = analyses_response?.analyses?.edges
    ? analyses_response.analyses.edges.map((edge) => edge.node)
    : [];
  const analysis_items =
    analyses.length > 0 ? (
      analyses.map((analysis) => (
        <AnalysisItem
          compact={use_mobile_layout}
          key={analysis.id}
          analysis={analysis}
          corpus={corpus}
          selected={analysis_ids_to_display.includes(analysis.id)}
          read_only={read_only}
          onSelect={() => toggleAnalysis(analysis)}
        />
      ))
    ) : (
      <PlaceholderCard
        style={{
          padding: ".5em",
          margin: ".75em",
          minWidth: use_mobile_layout ? "250px" : "300px",
        }}
        key="no_analyses_available_placeholder"
        title="No Analyses Available..."
        description="If you have sufficient privileges, try running a new analysis from the corpus page (right click on the corpus)."
      />
    );

  const action_buttons = [
    {
      key: "start_new",
      color: "green",
      title: "Start New",
      icon: "plus",
      action_function: () => window.alert("Yo yo"),
    },
  ].map((action_json) => (
    <Dropdown.Item
      icon={action_json.icon}
      text={action_json.title}
      onClick={action_json.action_function}
      key={action_json.title}
      color={action_json.color}
    />
  ));

  return (
    <Segment.Group
      id="HorizontalAnalysisSelectorForCorpus"
      style={{
        height: "300px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <Segment
        id="HorizontalAnalysisSelectorForCorpus_Menu"
        attached="top"
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "flex-start",
          borderRadius: "0px",
          height: "60px",
        }}
      >
        <div
          style={{
            width: use_mobile_layout ? "200px" : "50%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <Form>
            <Form.Input
              icon="search"
              placeholder={"Search for analysis..."}
              onChange={(data) => handleAnalysisSearchChange(data.target.value)}
              value={searchBuffer}
            />
          </Form>
        </div>
        <div
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            marginLeft: ".5vw",
          }}
        >
          <div>
            <Popup
              content="Start New Analysis For This **CORPUS**"
              trigger={
                <Button
                  color="green"
                  circular
                  icon="add circle"
                  onClick={() => showAnalyzerSelectionForCorpus(opened_corpus)}
                />
              }
            />
          </div>
        </div>
        <div
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            marginLeft: ".1vw",
          }}
        >
          <div>
            <Popup
              content="Clear **ALL** Selected Analyses"
              trigger={
                <Button
                  color="blue"
                  circular
                  icon="cancel"
                  onClick={() => {
                    selectedAnalyses([]);
                    selectedAnalysesIds([]);
                  }}
                />
              }
            />
          </div>
        </div>
      </Segment>
      <Segment
        id="HorizontalAnalysisSelectorForCorpus_CardSegment"
        attached="bottom"
        style={{
          maxHeight: "240px",
          overflow: "auto",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          borderRadius: "0px",
        }}
      >
        {loading_analyses ? (
          <Dimmer active={true}>
            <Loader content="Loading Analyses..." />
          </Dimmer>
        ) : (
          <></>
        )}
        <div
          id="HorizontalAnalysisSelectorForCorpus_CardTrack"
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            overflowX: "auto",
            flex: 1,
          }}
        >
          {analysis_items}
        </div>
      </Segment>
    </Segment.Group>
  );
};
