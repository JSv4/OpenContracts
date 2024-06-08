import { useEffect } from "react";
import _ from "lodash";
import { toast } from "react-toastify";
import { useMutation, useQuery, useReactiveVar } from "@apollo/client";
import { useLocation } from "react-router-dom";

import {
  openedQueryId,
  selectedQueryIds,
  authToken,
} from "../../graphql/cache";
import {
  GetCorpusQueryDetailsInputType,
  GetCorpusQueryDetailsOutputType,
  GetCorpusQueryOutputType,
  GetCorpusQueryInputType,
  GET_CORPUS_QUERY,
  GET_CORPUS_QUERIES,
  GetCorpusQueriesOutput,
  GetCorpusQueriesInput,
} from "../../graphql/queries";
import { CorpusQueryType } from "../../graphql/types";
import { QueryList } from "./QueryList";

export const CorpusQueryList = ({
  opened_corpus_id,
}: {
  opened_corpus_id: string;
}) => {
  /**
   * Similar to AnnotationCorpusCards, this component wraps the QueryList component
   * (which is a pure rendering component) with some query logic for a given corpus_id.
   * If the corpus_id is passed in, it will query and display the queries for
   * that corpus and let you browse them.
   */

  const auth_token = useReactiveVar(authToken);
  const selected_query_ids = useReactiveVar(selectedQueryIds);

  const location = useLocation();

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Setup document resolvers and mutations
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const {
    refetch: refetchQueries,
    loading: queries_loading,
    error: queries_error,
    data: queries_response,
    fetchMore: fetchMoreDocuments,
  } = useQuery<GetCorpusQueriesOutput, GetCorpusQueriesInput>(
    GET_CORPUS_QUERIES,
    {
      variables: {
        corpusId: opened_corpus_id,
      },
      notifyOnNetworkStatusChange: true, // necessary in order to trigger loading signal on fetchMore
    }
  );
  if (queries_error) {
    toast.error("ERROR\nCould not fetch documents for corpus.");
  }

  //   const [removeDocumentsFromCorpus, {}] = useMutation<
  //     RemoveDocumentsFromCorpusOutputs,
  //     RemoveDocumentsFromCorpusInputs
  //   >(REMOVE_DOCUMENTS_FROM_CORPUS, {
  //     onCompleted: () => {
  //       refetchDocuments();
  //     },
  //   });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Effects to reload data on certain changes
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // If user logs in while on this page... refetch to get their authorized corpuses
  useEffect(() => {
    // console.log("Auth token change", auth_token);
    if (auth_token && opened_corpus_id) {
      refetchQueries();
    }
  }, [auth_token]);

  // If we detech user navigated to this page, refetch
  useEffect(() => {
    if (opened_corpus_id && location.pathname === "/corpuses") {
      refetchQueries();
    }
  }, [location]);

  useEffect(() => {
    console.log("Opened corpus id changed", opened_corpus_id);
    if (opened_corpus_id) {
      refetchQueries();
    }
  }, [opened_corpus_id]);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Query to shape item data
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const query_data = queries_response?.corpusQueries?.edges
    ? queries_response.corpusQueries.edges
    : [];
  const query_items = query_data
    .map((edge) => (edge?.node ? edge.node : undefined))
    .filter((item): item is CorpusQueryType => !!item);

  const handleRemoveQuery = (id: string) => {
    console.log("I will delete", selected_query_ids);
    //     removeDocumentsFromCorpus({
    //       variables: {
    //         corpusId: opened_corpus_id ? opened_corpus_id : "",
    //         documentIdsToRemove: delete_ids,
    //       },
    //     })
    //       .then(() => {
    //         selectedDocumentIds([]);
    //         toast.success("SUCCESS! Contracts removed.");
    //       })
    //       .catch(() => {
    //         selectedDocumentIds([]);
    //         toast.error("ERROR! Contract removal failed.");
    //       });
  };

  return (
    <QueryList
      items={query_items}
      loading={queries_loading}
      pageInfo={queries_response?.corpusQueries.pageInfo}
      style={{ minHeight: "40vh" }}
      fetchMore={fetchMoreDocuments}
      onDelete={(item: CorpusQueryType) => handleRemoveQuery(item.id)}
      onSelectRow={(item: CorpusQueryType) => openedQueryId(item)}
    />
  );
};
