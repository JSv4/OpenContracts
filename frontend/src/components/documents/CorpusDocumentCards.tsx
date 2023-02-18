import { useEffect } from "react";
import _ from "lodash";
import { toast } from "react-toastify";
import { useMutation, useQuery, useReactiveVar } from "@apollo/client";
import { useLocation } from "react-router-dom";

import { DocumentCards } from "../../components/documents/DocumentCards";

import {
  selectedDocumentIds,
  documentSearchTerm,
  authToken,
  filterToLabelId,
  selectedMetaAnnotationId,
} from "../../graphql/cache";
import {
  REMOVE_DOCUMENTS_FROM_CORPUS,
  RemoveDocumentsFromCorpusOutputs,
  RemoveDocumentsFromCorpusInputs,
} from "../../graphql/mutations";
import {
  RequestDocumentsInputs,
  RequestDocumentsOutputs,
  GET_DOCUMENTS,
} from "../../graphql/queries";
import { DocumentType } from "../../graphql/types";

export const CorpusDocumentCards = ({
  opened_corpus_id,
}: {
  opened_corpus_id: string | null;
}) => {
  /**
   * Similar to AnnotationCorpusCards, this component wraps the DocumentCards component
   * (which is a pure rendering component) with some query logic for a given corpus_id.
   * If the corpus_id is passed in, it will query and display the documents for
   * that corpus and let you browse them.
   */

  const document_search_term = useReactiveVar(documentSearchTerm);
  const selected_metadata_id_to_filter_on = useReactiveVar(
    selectedMetaAnnotationId
  );

  const auth_token = useReactiveVar(authToken);
  const filter_to_label_id = useReactiveVar(filterToLabelId);

  const location = useLocation();

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Setup document resolvers and mutations
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const {
    refetch: refetchDocuments,
    loading: documents_loading,
    error: documents_error,
    data: documents_response,
    fetchMore: fetchMoreDocuments,
  } = useQuery<RequestDocumentsOutputs, RequestDocumentsInputs>(GET_DOCUMENTS, {
    variables: {
      ...(opened_corpus_id
        ? {
            annotateDocLabels: true,
            inCorpusWithId: opened_corpus_id,
            includeMetadata: true,
          }
        : { annotateDocLabels: false, includeMetadata: false }),
      ...(selected_metadata_id_to_filter_on
        ? { hasAnnotationsWithIds: selected_metadata_id_to_filter_on }
        : {}),
      ...(filter_to_label_id ? { hasLabelWithId: filter_to_label_id } : {}),
      ...(document_search_term ? { textSearch: document_search_term } : {}),
    },
    notifyOnNetworkStatusChange: true, // necessary in order to trigger loading signal on fetchMore
  });
  if (documents_error) {
    toast.error("ERROR\nCould not fetch documents for corpus.");
  }

  useEffect(() => {
    refetchDocuments();
  }, [document_search_term]);

  useEffect(() => {
    refetchDocuments();
  }, [selected_metadata_id_to_filter_on]);

  const [removeDocumentsFromCorpus, {}] = useMutation<
    RemoveDocumentsFromCorpusOutputs,
    RemoveDocumentsFromCorpusInputs
  >(REMOVE_DOCUMENTS_FROM_CORPUS, {
    onCompleted: () => {
      refetchDocuments();
    },
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Effects to reload data on certain changes
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // If user logs in while on this page... refetch to get their authorized corpuses
  useEffect(() => {
    // console.log("Auth token change", auth_token);
    if (auth_token && opened_corpus_id) {
      refetchDocuments();
    }
  }, [auth_token]);

  useEffect(() => {
    if (filter_to_label_id) {
      refetchDocuments();
    }
  }, [filter_to_label_id]);

  // If we detech user navigated to this page, refetch
  useEffect(() => {
    if (opened_corpus_id && location.pathname === "/corpuses") {
      refetchDocuments();
    }
  }, [location]);

  useEffect(() => {
    console.log("Opened corpus id changed", opened_corpus_id);
    if (opened_corpus_id) {
      refetchDocuments();
    }
  }, [opened_corpus_id]);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Query to shape item data
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const document_data = documents_response?.documents?.edges
    ? documents_response.documents.edges
    : [];
  const document_items = document_data
    .map((edge) => (edge?.node ? edge.node : undefined))
    .filter((item): item is DocumentType => !!item);

  const handleRemoveContracts = (delete_ids: string[]) => {
    removeDocumentsFromCorpus({
      variables: {
        corpusId: opened_corpus_id ? opened_corpus_id : "",
        documentIdsToRemove: delete_ids,
      },
    })
      .then(() => {
        selectedDocumentIds([]);
        toast.success("SUCCESS! Contracts removed.");
      })
      .catch(() => {
        selectedDocumentIds([]);
        toast.error("ERROR! Contract removal failed.");
      });
  };

  return (
    <DocumentCards
      items={document_items}
      loading={documents_loading}
      loading_message="Documents Loading..."
      pageInfo={documents_response?.documents.pageInfo}
      style={{ minHeight: "70vh" }}
      fetchMore={fetchMoreDocuments}
      removeFromCorpus={opened_corpus_id ? handleRemoveContracts : undefined}
    />
  );
};
