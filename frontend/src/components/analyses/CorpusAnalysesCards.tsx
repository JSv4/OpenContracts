import { useEffect } from "react";
import _ from "lodash";
import { toast } from "react-toastify";
import { useQuery, useReactiveVar } from "@apollo/client";
import { useLocation } from "react-router-dom";

import { AnalysesCards } from "./AnalysesCards";
import {
  analysisSearchTerm,
  authToken,
  openedCorpus,
  selectedAnalyses,
} from "../../graphql/cache";
import { LooseObject } from "../types";
import {
  GetAnalysesInputs,
  GetAnalysesOutputs,
  GET_ANALYSES,
} from "../../graphql/queries";

export const CorpusAnalysesCards = () => {
  /**
   * Similar to AnnotationCorpusCards, this component wraps the DocumentCards component
   * (which is a pure rendering component) with some query logic for a given corpus_id.
   * If the corpus_id is passed in, it will query and display the documents for
   * that corpus and let you browse them.
   */
  const opened_corpus = useReactiveVar(openedCorpus);
  const analysis_search_term = useReactiveVar(analysisSearchTerm);
  const auth_token = useReactiveVar(authToken);
  const analyses_to_display = useReactiveVar(selectedAnalyses);

  const location = useLocation();

  //////////////////////////////////////////////////////////////////////
  // Craft the query variables obj based on current application state
  const analyses_variables: LooseObject = {
    corpusId: opened_corpus?.id ? opened_corpus.id : "",
  };
  if (analysis_search_term) {
    analyses_variables["searchText"] = analysis_search_term;
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Setup document resolvers and mutations
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
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
  if (analyses_load_error) {
    toast.error("ERROR\nCould not fetch analyses for corpus.");
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Effects to reload data on certain changes
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  useEffect(() => {
    refetchAnalyses();
  }, [analysis_search_term]);

  // If user logs in while on this page... refetch to get their authorized corpuses
  useEffect(() => {
    // console.log("Auth token change", auth_token);
    if (auth_token && opened_corpus?.id) {
      refetchAnalyses();
    }
  }, [auth_token]);

  // TODO - triggering constant refresh
  //   useEffect(() => {
  //     if (analysis_ids_to_display) {
  //       refetchAnalyses();
  //     }
  //   }, [analysis_ids_to_display]);

  //If we detech user navigated to this page, refetch
  useEffect(() => {
    if (opened_corpus?.id && location.pathname === "/corpuses") {
      refetchAnalyses();
    }
  }, [location]);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Query to shape item data
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const analyses = analyses_response?.analyses?.edges
    ? analyses_response.analyses.edges.map((edge) => edge.node)
    : [];

  return (
    <AnalysesCards
      analyses={analyses}
      opened_corpus={opened_corpus}
      loading={loading_analyses}
      loading_message="Analyses Loading..."
      pageInfo={analyses_response?.analyses?.pageInfo}
      fetchMore={fetchMoreAnalyses}
      style={{ minHeight: "70vh" }}
    />
  );
};
