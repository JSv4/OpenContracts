import {
  ApolloError,
  useMutation,
  useQuery,
  useReactiveVar,
} from "@apollo/client";
import _ from "lodash";
import { useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  Button,
  Card,
  Dimmer,
  Icon,
  Loader,
  Modal,
  Segment,
} from "semantic-ui-react";
import { analyzerSearchTerm } from "../../graphql/cache";
import {
  StartAnalysisInputType,
  StartAnalysisOutputType,
  START_ANALYSIS_FOR_CORPUS,
} from "../../graphql/mutations";
import {
  GetAnalyzersOutputs,
  GetAnalyzersInputs,
  GET_ANALYZERS,
  GET_ANALYSES,
  GetAnalysesOutputs,
} from "../../graphql/queries";
import { CorpusType } from "../../graphql/types";
import { CreateAndSearchBar } from "../layout/CreateAndSearchBar";
import { PlaceholderCard } from "../placeholders/PlaceholderCard";
import { LooseObject } from "../types";
import { AnalyzerSummaryCard } from "./AnalyzerSummaryCard";

interface SelectAnalyzerModalProps {
  corpus: CorpusType;
  open: boolean;
  toggleModal: () => any;
}

export const SelectAnalyzerModal = ({
  corpus,
  open,
  toggleModal,
}: SelectAnalyzerModalProps) => {
  const [selected_analyzer_id, setSelectAnalyzerId] = useState<string | null>(
    null
  );
  const [searchTerm, setSearchTerm] = useState<string>("");
  const analyzer_search_term = useReactiveVar(analyzerSearchTerm);

  // Debounce the search function
  const debouncedAnalyzerSearch = useRef(
    _.debounce((searchTerm) => {
      analyzerSearchTerm(searchTerm);
    }, 1000)
  );

  const handleAnalyzerSearchChange = (value: string) => {
    setSearchTerm(value);
    debouncedAnalyzerSearch.current(value);
  };

  //////////////////////////////////////////////////////////////////////
  // Fetch Available Analyzers on the Server
  let analyzer_query_vars: LooseObject = {};
  if (analyzer_search_term !== null && analyzer_search_term.length > 0) {
    analyzer_query_vars["description_contains"] = analyzer_search_term;
  }

  const {
    refetch: fetchAnalyzers,
    loading: loading_analyzers,
    error: analyzers_load_error,
    data: analyzers_response,
    fetchMore: fetchMoreAnalyzers,
  } = useQuery<GetAnalyzersOutputs, GetAnalyzersInputs>(GET_ANALYZERS, {
    notifyOnNetworkStatusChange: true, // required to get loading signal on fetchMore
    variables: analyzer_query_vars,
  });

  if (analyzers_load_error) {
    toast.error("ERROR! Could not load analyzers from server.");
  }

  //////////////////////////////////////////////////////////////////////
  // Mutation to Start the Analysis
  const [startAnalysisOnCorpus, { loading: create_corpus_loading }] =
    useMutation<StartAnalysisOutputType, StartAnalysisInputType>(
      START_ANALYSIS_FOR_CORPUS,
      {
        onCompleted: (data) => {
          toast.success("Analysis started!");
          toggleModal();
        },
        onError: (error: ApolloError) => {
          toast.error(`Could Not Start Analysis: ${error.message}`);
          toggleModal();
        },
        update: (cache, { data: start_analysis_data }) => {
          const new_obj = start_analysis_data?.startAnalysisOnCorpus.obj;
          if (new_obj) {
            const cache_data: GetAnalysesOutputs | null = cache.readQuery({
              query: GET_ANALYSES,
              variables: { corpusId: corpus.id },
            });
            if (cache_data) {
              const new_cache_data = _.cloneDeep(cache_data);
              new_cache_data.analyses.edges = [
                ...new_cache_data.analyses.edges,
                { node: new_obj },
              ];
              cache.writeQuery({
                query: GET_ANALYSES,
                variables: { corpusId: corpus.id },
                data: new_cache_data,
              });
            }
          }
        },
      }
    );

  const startAnalysisForCorpus = (corpus: CorpusType, analyzer_id: string) => {
    startAnalysisOnCorpus({
      variables: {
        corpusId: corpus.id,
        analyzerId: analyzer_id,
      },
    });
  };

  //////////////////////////////////////////////////////////////////////
  // Process Analyzer Response
  const analyzers = analyzers_response?.analyzers.edges
    ? analyzers_response.analyzers.edges.map((edge) => edge.node)
    : [];
  const analyzer_cards =
    analyzers.length > 0
      ? analyzers.map((analyzer) => (
          <AnalyzerSummaryCard
            corpus={corpus}
            analyzer={analyzer}
            selected={analyzer.analyzerId === selected_analyzer_id}
            onSelect={() =>
              setSelectAnalyzerId(
                analyzer?.analyzerId ? analyzer.analyzerId : null
              )
            }
          />
        ))
      : [
          <PlaceholderCard
            description="No Analyzers Matching Specified Criteria (or none installed)"
            include_image={false}
          />,
        ];

  return (
    <Modal
      closeIcon
      open={open}
      onClose={() => toggleModal()}
      size="fullscreen"
    >
      <Modal.Header>Choose an Analyzer to Apply:</Modal.Header>
      <Segment
        secondary
        style={{
          flex: 1,
          marginRight: "1.5rem",
          marginLeft: "1.5rem",
          marginBottom: "0px",
          paddingTop: ".75rem",
          paddingBottom: ".75rem",
        }}
      >
        <CreateAndSearchBar
          onChange={(value) => handleAnalyzerSearchChange(value)}
          actions={[]}
          placeholder="Search for analyzer by description or name..."
          value={searchTerm}
        />
      </Segment>
      <Modal.Content>
        {loading_analyzers || create_corpus_loading ? (
          <Dimmer active={true}>
            <Loader
              content={
                create_corpus_loading
                  ? `Requesting Analysis with ${selected_analyzer_id}`
                  : "Loading Available Analyzers..."
              }
            />
          </Dimmer>
        ) : (
          <></>
        )}
        <Segment>
          <Card.Group>{analyzer_cards}</Card.Group>
        </Segment>
      </Modal.Content>
      <Modal.Actions>
        <Button basic color="grey">
          <Icon name="remove" onClick={() => toggleModal()} /> Close
        </Button>
        {selected_analyzer_id ? (
          <Button
            color="green"
            inverted
            onClick={() => startAnalysisForCorpus(corpus, selected_analyzer_id)}
          >
            <Icon name="checkmark" /> Analyze!
          </Button>
        ) : (
          <></>
        )}
      </Modal.Actions>
    </Modal>
  );
};
