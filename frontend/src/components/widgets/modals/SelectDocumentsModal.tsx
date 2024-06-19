import {
  ModalHeader,
  ModalContent,
  ModalActions,
  Button,
  Modal,
} from "semantic-ui-react";
import { useQuery, useReactiveVar } from "@apollo/client";
import _ from "lodash";
import {
  RequestDocumentsOutputs,
  RequestDocumentsInputs,
  SEARCH_DOCUMENTS,
} from "../../../graphql/queries";
import { DataGrid } from "../../../extracts/datagrid/DataGrid";
import { CardLayout } from "../../layout/CardLayout";
import { DocumentCards } from "../../documents/DocumentCards";
import { AddToCorpusModal } from "../../corpuses/AddToCorpusModal";
import { CreateAndSearchBar } from "../../layout/CreateAndSearchBar";
import { FilterToLabelsetSelector } from "../model-filters/FilterToLabelsetSelector";
import { FilterToCorpusSelector } from "../model-filters/FilterToCorpusSelector";
import { FilterToLabelSelector } from "../model-filters/FilterToLabelSelector";
import { useEffect, useRef, useState } from "react";
import { CorpusType, DocumentType, LabelType } from "../../../graphql/types";
import { LooseObject } from "../../types";
import { selectedDocumentIds } from "../../../graphql/cache";

interface SelectDocumentsModalProps {
  open: boolean;
  filterDocIds: string[];
  toggleModal: () => void;
  onAddDocumentIds: (documents: string[]) => void;
}

export const SelectDocumentsModal = ({
  open,
  filterDocIds,
  toggleModal,
  onAddDocumentIds,
}: SelectDocumentsModalProps) => {
  const [filtered_to_labelset_id, filterToLabelsetId] = useState<string | null>(
    null
  );
  const [filtered_to_label_id, filterToLabelId] = useState<string | null>(null);
  const [filtered_to_corpus, filterToCorpus] = useState<CorpusType | null>(
    null
  );
  const selected_document_ids = useReactiveVar(selectedDocumentIds);
  const [document_search_term, documentSearchTerm] = useState<string>("");
  const [searchCache, setSearchCache] = useState<string>(document_search_term);

  let document_variables: LooseObject = {
    includeMetadata: true,
  };
  if (document_search_term) {
    document_variables["textSearch"] = document_search_term;
  }

  if (filtered_to_label_id) {
    document_variables["hasLabelWithId"] = filtered_to_label_id;
  }
  if (filtered_to_corpus) {
    document_variables["inCorpusWithId"] = filtered_to_corpus.id;
  }
  // Only annotate document labels if there is a selected corpus to cut down on possible explosion of possible labels otherwise.
  if (filtered_to_corpus || filtered_to_labelset_id) {
    document_variables["annotateDocLabels"] = true;
  } else {
    document_variables["annotateDocLabels"] = false;
  }

  const {
    refetch: refetchDocuments,
    loading: documents_loading,
    error: documents_error,
    data: documents_data,
    fetchMore: fetchMoreDocuments,
  } = useQuery<RequestDocumentsOutputs, RequestDocumentsInputs>(
    SEARCH_DOCUMENTS,
    {
      variables: document_variables,
      nextFetchPolicy: "network-only",
      notifyOnNetworkStatusChange: true, // required to get loading signal on fetchMore
    }
  );

  const document_nodes = documents_data?.documents?.edges
    ? documents_data.documents.edges
    : [];
  const document_items = document_nodes
    .map((edge) => (edge?.node ? edge.node : undefined))
    .filter((item): item is DocumentType => !!item)
    .filter((item) => !filterDocIds.includes(item.id));

  // If doc search term changes, refetch documents
  useEffect(() => {
    console.log("document_search_term change");
    refetchDocuments();
  }, [document_search_term]);

  // If selected label changes, refetch docs
  useEffect(() => {
    console.log("filtered_to_label_id change");
    refetchDocuments();
  }, [filtered_to_label_id]);

  // If selected labelSET changes, refetch docs
  useEffect(() => {
    console.log("filter_to_labelset_id change");
    refetchDocuments();
  }, [filtered_to_labelset_id]);

  // If selected corpus changes, refetch docs
  useEffect(() => {
    console.log("filtered_to_corpus change");
    refetchDocuments();
  }, [filtered_to_corpus]);

  /**
   * Set up the debounced search handling for the Document SearchBar
   */
  const debouncedSearch = useRef(
    _.debounce((searchTerm) => {
      documentSearchTerm(searchTerm);
    }, 1000)
  );

  const handleSearchChange = (value: string) => {
    setSearchCache(value);
    debouncedSearch.current(value);
  };

  const handleConfirm = () => {
    onAddDocumentIds(selected_document_ids);
    selectedDocumentIds([]);
    toggleModal();
  };
  const handleCancel = () => {
    selectedDocumentIds([]);
    toggleModal();
  };

  return (
    <Modal
      size="fullscreen"
      open={open}
      closeIcon
      onClose={() => toggleModal()}
      style={{
        height: "90vh",
        display: "flex !important",
        flexDirection: "column",
        alignContent: "flex-start",
        justifyContent: "center",
      }}
    >
      <ModalHeader>Select Document(s)</ModalHeader>
      <ModalContent style={{ flex: 1 }}>
        <CardLayout
          Modals={<></>}
          SearchBar={
            <CreateAndSearchBar
              actions={[]}
              filters={
                <>
                  <FilterToLabelsetSelector
                    fixed_labelset_id={
                      filtered_to_corpus?.labelSet?.id
                        ? filtered_to_corpus.labelSet.id
                        : undefined
                    }
                  />
                  <FilterToCorpusSelector
                    uses_labelset_id={filtered_to_labelset_id}
                  />
                  {filtered_to_labelset_id ||
                  filtered_to_corpus?.labelSet?.id ? (
                    <FilterToLabelSelector
                      label_type={LabelType.TokenLabel}
                      only_labels_for_labelset_id={
                        filtered_to_labelset_id
                          ? filtered_to_labelset_id
                          : filtered_to_corpus?.labelSet?.id
                          ? filtered_to_corpus.labelSet.id
                          : undefined
                      }
                    />
                  ) : (
                    <></>
                  )}
                </>
              }
              value={searchCache}
              placeholder="Search for document containing text..."
              onChange={handleSearchChange}
            />
          }
        >
          <DocumentCards
            items={document_items}
            pageInfo={documents_data?.documents?.pageInfo}
            loading={documents_loading}
            loading_message="Loading Documents..."
            fetchMore={fetchMoreDocuments}
          />
        </CardLayout>
      </ModalContent>
      <ModalActions>
        <Button negative onClick={() => handleCancel()}>
          Cancel
        </Button>
        <Button positive onClick={() => handleConfirm()}>
          Add Documents
        </Button>
      </ModalActions>
    </Modal>
  );
};
