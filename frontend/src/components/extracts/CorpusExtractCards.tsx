import { useEffect } from "react";
import { toast } from "react-toastify";
import { useQuery, useReactiveVar } from "@apollo/client";
import { useLocation } from "react-router-dom";
import { ExtractCards } from "./ExtractCards";
import {
  openedCorpus,
  analysisSearchTerm,
  authToken,
  showCorpusActionOutputs,
} from "../../graphql/cache";
import { LooseObject } from "../types";
import {
  GetExtractsOutput,
  GetExtractsInput,
  GET_EXTRACTS,
} from "../../graphql/queries";

export const CorpusExtractCards = () => {
  const show_corpus_action_outputs = useReactiveVar(showCorpusActionOutputs);
  const opened_corpus = useReactiveVar(openedCorpus);
  const analysis_search_term = useReactiveVar(analysisSearchTerm);
  const auth_token = useReactiveVar(authToken);
  const location = useLocation();

  const extract_variables: LooseObject = {
    corpusId: opened_corpus?.id ? opened_corpus.id : "",
    corpusAction_Isnull: show_corpus_action_outputs,
  };
  if (analysis_search_term) {
    extract_variables["searchText"] = analysis_search_term;
  }

  const {
    refetch: refetchExtracts,
    loading: loading_extracts,
    error: extracts_load_error,
    data: extracts_response,
    fetchMore: fetchMoreExtracts,
  } = useQuery<GetExtractsOutput, GetExtractsInput>(GET_EXTRACTS, {
    variables: extract_variables,
    fetchPolicy: "network-only",
    notifyOnNetworkStatusChange: true,
  });

  if (extracts_load_error) {
    toast.error("ERROR\nCould not fetch extracts for corpus.");
  }

  useEffect(() => {
    refetchExtracts();
  }, [analysis_search_term, show_corpus_action_outputs]);

  useEffect(() => {
    if (auth_token && opened_corpus?.id) {
      refetchExtracts();
    }
  }, [auth_token]);

  useEffect(() => {
    if (opened_corpus?.id && location.pathname === "/corpuses") {
      refetchExtracts();
    }
  }, [location]);

  const extracts = extracts_response?.extracts?.edges
    ? extracts_response.extracts.edges.map((edge) => edge.node)
    : [];

  return (
    <ExtractCards
      extracts={extracts}
      opened_corpus={opened_corpus}
      loading={loading_extracts}
      loading_message="Extracts Loading..."
      pageInfo={extracts_response?.extracts?.pageInfo}
      fetchMore={fetchMoreExtracts}
      style={{ minHeight: "70vh" }}
    />
  );
};
