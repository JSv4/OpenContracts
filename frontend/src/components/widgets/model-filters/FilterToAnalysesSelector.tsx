import { useQuery, useReactiveVar } from "@apollo/client";
import { useEffect } from "react";
import { toast } from "react-toastify";
import {
  Dropdown,
  DropdownItemProps,
  DropdownProps,
  Label,
  Menu,
} from "semantic-ui-react";
import {
  authToken,
  selectedAnalyses,
  selectedAnalysesIds,
} from "../../../graphql/cache";
import {
  GetAnalysesInputs,
  GetAnalysesOutputs,
  GET_ANALYSES,
} from "../../../graphql/queries";
import { AnalysisType, CorpusType } from "../../../graphql/types";
import useWindowDimensions from "../../hooks/WindowDimensionHook";

interface FilterToAnalysesSelectorProps {
  corpus: CorpusType;
  style?: Record<string, any>;
}

export const FilterToAnalysesSelector = ({
  corpus,
  style,
}: FilterToAnalysesSelectorProps) => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= 600;

  const auth_token = useReactiveVar(authToken);
  const selected_analyses = useReactiveVar(selectedAnalyses);

  const analysis_ids_to_display = selected_analyses.map(
    (analysis) => analysis.id
  ) as string[];

  const handleChange = (
    event: React.SyntheticEvent<HTMLElement, Event>,
    data: DropdownProps
  ) => {
    // console.log("Handle analysis slection", data.value);

    let selected_analyses: AnalysisType[] = [];

    if (data.value !== undefined && Array.isArray(data.value)) {
      for (let analysis_id of data.value) {
        let analysis_to_add = analyses_response?.analyses.edges
          .filter((analysis_edge) => analysis_edge.node.id === analysis_id)
          .map((edge) => edge.node);

        if (analysis_to_add !== undefined) {
          selected_analyses = [...selected_analyses, ...analysis_to_add];
        }
      }
      console.log("Set selected analyses", selected_analyses);
      selectedAnalyses(selected_analyses);
      selectedAnalysesIds(selected_analyses.map((analysis) => analysis.id));
    } else {
      selectedAnalyses([]);
      selectedAnalysesIds([]);
    }
  };

  ///////////////////////////////////////////////////////////////////////////////
  const {
    refetch: refetchAnalyses,
    loading: loading_analyses,
    error: analyses_load_error,
    data: analyses_response,
    fetchMore: fetchMoreAnalyses,
  } = useQuery<GetAnalysesOutputs, GetAnalysesInputs>(GET_ANALYSES, {
    variables: {
      corpusId: corpus.id,
    },
    fetchPolicy: "network-only",
    notifyOnNetworkStatusChange: true,
  });
  if (analyses_load_error) {
    toast.error("ERROR\nCould not fetch analyses for multiselector.");
    console.error(analyses_load_error);
  }

  useEffect(() => {
    refetchAnalyses();
  }, [auth_token]);

  useEffect(() => {
    refetchAnalyses();
  }, [corpus]);

  ///////////////////////////////////////////////////////////////////////////////
  let analysis_options: DropdownItemProps[] = [];
  if (analyses_response?.analyses?.edges) {
    analysis_options = analyses_response?.analyses?.edges.map((edge) => ({
      key: edge.node.id,
      text: `${edge.node.id}: ${edge.node.analyzer.analyzerId}`,
      value: edge.node.id,
    }));
  }

  return (
    <Menu
      style={{
        padding: "0px",
        margin: use_mobile_layout ? ".25rem" : "0px",
        marginRight: ".25rem",
      }}
    >
      <Label
        style={{
          marginRight: "0px",
          borderRadius: "5px 0px 0px 5px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div>Created by Analysis:</div>
      </Label>
      <Dropdown
        placeholder="Created by Analysis"
        fluid
        multiple
        selection
        clearable
        options={analysis_options}
        onChange={handleChange}
        value={analysis_ids_to_display}
        style={{
          margin: "0px",
          minWidth: "15rem",
          ...style,
        }}
      />
    </Menu>
  );
};
