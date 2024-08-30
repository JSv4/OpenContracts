import { useEffect } from "react";

import _ from "lodash";
import { toast } from "react-toastify";
import { useQuery, useReactiveVar } from "@apollo/client";
import { useLocation } from "react-router-dom";

import { AnnotationCards } from "./AnnotationCards";

import {
  authToken,
  annotationContentSearchTerm,
  filterToLabelsetId,
  filterToLabelId,
  selectedAnalyses,
  showCorpusActionOutputs,
} from "../../graphql/cache";

import {
  GetAnnotationsInputs,
  GetAnnotationsOutputs,
  GET_ANNOTATIONS,
} from "../../graphql/queries";
import { ServerAnnotationType } from "../../graphql/types";

export const CorpusAnnotationCards = ({
  opened_corpus_id,
}: {
  opened_corpus_id: string | null;
}) => {
  /**
   * This component wraps the CorpusCards component (which is a pure rendering component)
   * with some query logic for a given corpus_id. If the corpus_id is passed in, it will
   * query for the annotations for that corpus and let you browse them.
   */

  const auth_token = useReactiveVar(authToken);
  const annotation_search_term = useReactiveVar(annotationContentSearchTerm);
  const filter_to_labelset_id = useReactiveVar(filterToLabelsetId);
  const filter_to_label_id = useReactiveVar(filterToLabelId);
  const selected_analyses = useReactiveVar(selectedAnalyses);
  const show_action_annotations = useReactiveVar(showCorpusActionOutputs);

  const location = useLocation();

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Query to get annotations
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

  const selected_analysis_id_string = selected_analyses
    .map((analysis) => analysis.id)
    .join();

  const {
    refetch: refetchAnnotations,
    loading: annotation_loading,
    error: annotation_error,
    data: annotation_response,
    fetchMore: fetchMoreAnnotations,
  } = useQuery<GetAnnotationsOutputs, GetAnnotationsInputs>(GET_ANNOTATIONS, {
    notifyOnNetworkStatusChange: true, // necessary in order to trigger loading signal on fetchMore
    variables: {
      annotationLabel_Type: "TOKEN_LABEL",
      createdByAnalysisIds: selected_analysis_id_string,
      analysis_Isnull: !show_action_annotations,
      ...(opened_corpus_id ? { corpusId: opened_corpus_id } : {}),
      ...(filter_to_label_id ? { annotationLabelId: filter_to_label_id } : {}),
      ...(filter_to_labelset_id
        ? { usesLabelFromLabelsetId: filter_to_labelset_id }
        : {}),
      ...(annotation_search_term
        ? { rawText_Contains: annotation_search_term }
        : {}),
    },
  });
  if (annotation_error) {
    toast.error("ERROR\nCould not fetch annotations for corpus.");
  }

  const handleFetchMoreAnnotations = () => {
    // console.log("Handle update");
    if (
      !annotation_loading &&
      annotation_response?.annotations.pageInfo?.hasNextPage
    ) {
      fetchMoreAnnotations({
        variables: {
          limit: 50,
          cursor: annotation_response.annotations.pageInfo.endCursor,
        },
      });
    }
  };

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Effects to reload data on certain changes
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // If user logs in while on this page... refetch to get their authorized corpuses
  useEffect(() => {
    // console.log("Auth token change", auth_token);
    if (auth_token && opened_corpus_id) {
      refetchAnnotations();
    }
  }, [auth_token]);

  useEffect(() => {
    // console.log("filter_to_label_id changed");
    if (filter_to_label_id && opened_corpus_id) {
      refetchAnnotations();
    }
  }, [filter_to_label_id]);

  useEffect(() => {
    refetchAnnotations();
  }, [selected_analyses]);

  useEffect(() => {
    refetchAnnotations();
  }, [show_action_annotations]);

  // If we detech user navigated to this page, refetch
  useEffect(() => {
    // console.log(
    //   "CorpusAnnotationCards checking location pathname",
    //   location.pathname
    // );
    if (opened_corpus_id && location.pathname === "/corpuses") {
      refetchAnnotations();
    }
  }, [location]);

  useEffect(() => {
    // console.log("Opened corpus");
    if (opened_corpus_id) {
      refetchAnnotations();
    }
  }, [opened_corpus_id]);

  useEffect(() => {
    // console.log("Annotation search term changed...");
    refetchAnnotations();
  }, [annotation_search_term]);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Query to shape item data
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const annotation_data = annotation_response?.annotations?.edges
    ? annotation_response.annotations.edges
    : [];
  const annotation_items = annotation_data
    .map((edge) => (edge ? edge.node : undefined))
    .filter((item): item is ServerAnnotationType => !!item);

  return (
    <AnnotationCards
      items={annotation_items}
      loading={annotation_loading}
      loading_message="Annotations Loading..."
      pageInfo={undefined}
      //pageInfo={annotation_response?.annotations?.pageInfo ? annotation_response.annotations.pageInfo : undefined}
      style={{ minHeight: "70vh" }}
      fetchMore={handleFetchMoreAnnotations}
    />
  );
};
