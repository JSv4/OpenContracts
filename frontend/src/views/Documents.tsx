import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useReactiveVar } from "@apollo/client";
import { useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import _ from "lodash";

import {
  DeleteMultipleDocumentsInputs,
  DeleteMultipleDocumentsOutputs,
  DELETE_MULTIPLE_DOCUMENTS,
  UpdateDocumentInputs,
  UpdateDocumentOutputs,
  UPDATE_DOCUMENT,
} from "../graphql/mutations";
import {
  RequestDocumentsInputs,
  RequestDocumentsOutputs,
  GET_DOCUMENTS,
} from "../graphql/queries";
import {
  authToken,
  documentSearchTerm,
  editingDocument,
  filterToCorpus,
  filterToLabelId,
  filterToLabelsetId,
  openedDocument,
  selectedDocumentIds,
  showAddDocsToCorpusModal,
  showDeleteDocumentsModal,
  showUploadNewDocumentsModal,
  viewingDocument,
} from "../graphql/cache";

import { CRUDModal } from "../components/widgets/CRUD/CRUDModal";
import { ActionDropdownItem, LooseObject } from "../components/types";
import { CardLayout } from "../components/layout/CardLayout";
import { DocumentCards } from "../components/documents/DocumentCards";
import { FilterToLabelSelector } from "../components/widgets/model-filters/FilterToLabelSelector";
import { DocumentType, LabelType } from "../graphql/types";
import { AddToCorpusModal } from "../components/corpuses/AddToCorpusModal";
import { DocumentUploadModal } from "../components/documents/DocumentUploadModal";
import { ConfirmModal } from "../components/widgets/modals/ConfirmModal";
import { CreateAndSearchBar } from "../components/layout/CreateAndSearchBar";
import {
  editDocForm_Schema,
  editDocForm_Ui_Schema,
} from "../components/forms/schemas";
import { PdfViewer } from "../components/documents/PdfViewer";
import { FilterToLabelsetSelector } from "../components/widgets/model-filters/FilterToLabelsetSelector";
import { FilterToCorpusSelector } from "../components/widgets/model-filters/FilterToCorpusSelector";

export const Documents = () => {
  const auth_token = useReactiveVar(authToken);
  const document_to_edit = useReactiveVar(editingDocument);
  const document_to_view = useReactiveVar(viewingDocument);
  const document_to_open = useReactiveVar(openedDocument);

  const filtered_to_labelset_id = useReactiveVar(filterToLabelsetId);
  const filtered_to_label_id = useReactiveVar(filterToLabelId);
  const filtered_to_corpus = useReactiveVar(filterToCorpus);
  const selected_document_ids = useReactiveVar(selectedDocumentIds);
  const document_search_term = useReactiveVar(documentSearchTerm);
  const show_add_docs_to_corpus_modal = useReactiveVar(
    showAddDocsToCorpusModal
  );
  const show_upload_new_documents_modal = useReactiveVar(
    showUploadNewDocumentsModal
  );
  const show_delete_documents_modal = useReactiveVar(showDeleteDocumentsModal);

  const [searchCache, setSearchCache] = useState<string>(document_search_term);

  const location = useLocation();

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
  } = useQuery<RequestDocumentsOutputs, RequestDocumentsInputs>(GET_DOCUMENTS, {
    variables: document_variables,
    nextFetchPolicy: "network-only",
    notifyOnNetworkStatusChange: true, // required to get loading signal on fetchMore
  });

  const document_nodes = documents_data?.documents?.edges
    ? documents_data.documents.edges
    : [];
  const document_items = document_nodes
    .map((edge) => (edge?.node ? edge.node : undefined))
    .filter((item): item is DocumentType => !!item);
  let visible_docs_are_processing = document_items.reduce<boolean>(
    (accum, current) => accum || Boolean(current.backendLock),
    false
  );

  const onSelect = (document: DocumentType) => {
    // console.log("On selected document", document);
    if (selected_document_ids.includes(document.id)) {
      // console.log("Already selected... deselect")
      const values = selected_document_ids.filter((id) => id !== document.id);
      // console.log("Filtered values", values);
      selectedDocumentIds(values);
    } else {
      selectedDocumentIds([...selected_document_ids, document.id]);
    }
    // console.log("selected doc ids", selected_document_ids);
  };

  const onOpen = (document: DocumentType) => {
    openedDocument(document);
  };

  // If we just logged in, refetch docs in case there are documents that are not public and are only visible to current user
  useEffect(() => {
    if (auth_token) {
      console.log("DocumentItem - refetchDocuments due to auth_token");
      refetchDocuments();
    }
  }, [auth_token]);

  // If we navigated here, refetch documents to ensure we have fresh docs
  useEffect(() => {
    console.log("DocumentItem - refetchDocuments due to location change");
    refetchDocuments();
  }, [location]);

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

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Implementing various resolvers / mutations to create action methods
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const [tryDeleteDocuments] = useMutation<
    DeleteMultipleDocumentsOutputs,
    DeleteMultipleDocumentsInputs
  >(DELETE_MULTIPLE_DOCUMENTS, {
    onCompleted: () => {
      selectedDocumentIds([]);
      refetchDocuments();
    },
  });
  const handleDeleteDocuments = (
    ids: string[] | null,
    callback?: (args?: any) => void | any
  ) => {
    if (ids) {
      tryDeleteDocuments({ variables: { documentIdsToDelete: ids } })
        .then((data) => {
          toast.success("SUCCESS - Deleted Documents: ");
          if (callback) {
            callback();
          }
        })
        .catch((err) => {
          toast.error("ERROR - Could Not Delete Document");
          if (callback) {
            callback();
          }
        });
    }
  };

  const [tryUpdateDocument] = useMutation<
    UpdateDocumentOutputs,
    UpdateDocumentInputs
  >(UPDATE_DOCUMENT);
  const handleUpdateDocument = (document_obj: any) => {
    console.log("handleUpdateDocument", document_obj);
    let variables = {
      variables: document_obj,
    };
    console.log("handleUpdateDocument variables", variables);
    tryUpdateDocument(variables);
  };

  // Build the actions for the search / context bar dropdown menu
  let document_actions: ActionDropdownItem[] = [];

  if (auth_token) {
    document_actions.push({
      key: "documents_action_dropdown_0",
      title: "Import",
      icon: "cloud upload",
      color: "blue",
      action_function: () =>
        showUploadNewDocumentsModal(!show_upload_new_documents_modal),
    });
    if (selected_document_ids.length > 0) {
      document_actions.push({
        key: `documents_action_dropdown_${document_actions.length}`,
        title: "Add to Corpus",
        icon: "plus",
        color: "green",
        action_function: () =>
          showAddDocsToCorpusModal(!show_add_docs_to_corpus_modal),
      });
      document_actions.push({
        key: `documents_action_dropdown_${document_actions.length}`,
        title: "Delete",
        icon: "trash",
        color: "red",
        action_function: () =>
          showDeleteDocumentsModal(!show_delete_documents_modal),
      });
    }
  }

  return (
    <CardLayout
      Modals={
        <>
          <AddToCorpusModal
            open={show_add_docs_to_corpus_modal}
            toggleModal={() =>
              showAddDocsToCorpusModal(!show_add_docs_to_corpus_modal)
            }
            documents={document_items}
          />
          <DocumentUploadModal
            refetch={() => {
              refetchDocuments();
              showUploadNewDocumentsModal(false);
            }}
            open={Boolean(show_upload_new_documents_modal)}
            onClose={() => showUploadNewDocumentsModal(false)}
          />
          <ConfirmModal
            message={`Are you sure you want to delete these documents?`}
            yesAction={() =>
              handleDeleteDocuments(
                selected_document_ids ? selected_document_ids : null,
                () => showDeleteDocumentsModal(false)
              )
            }
            noAction={() => showDeleteDocumentsModal(false)}
            toggleModal={() => showDeleteDocumentsModal(false)}
            visible={show_delete_documents_modal}
          />
          {document_to_open && document_to_open.pdfFile ? (
            <PdfViewer
              url={document_to_open.pdfFile}
              toggleModal={() => openedDocument(null)}
              opened={Boolean(document_to_open)}
            />
          ) : (
            <></>
          )}
          <CRUDModal
            open={document_to_edit !== null}
            mode="EDIT"
            old_instance={document_to_edit ? document_to_edit : {}}
            model_name="document"
            ui_schema={editDocForm_Ui_Schema}
            data_schema={editDocForm_Schema}
            onSubmit={handleUpdateDocument}
            onClose={() => editingDocument(null)}
            has_file={true}
            file_field="pdfFile"
            file_label="PDF File"
            file_is_image={false}
            accepted_file_types="pdf"
          />
          <CRUDModal
            open={document_to_view !== null}
            mode="VIEW"
            old_instance={document_to_view ? document_to_view : {}}
            model_name="document"
            ui_schema={editDocForm_Ui_Schema}
            data_schema={editDocForm_Schema}
            onClose={() => viewingDocument(null)}
            has_file={true}
            file_field="pdfFile"
            file_label="PDF File"
            file_is_image={false}
            accepted_file_types="pdf"
          />
        </>
      }
      SearchBar={
        <CreateAndSearchBar
          actions={document_actions}
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
              {filtered_to_labelset_id || filtered_to_corpus?.labelSet?.id ? (
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
        onClick={onOpen}
        onShiftClick={onSelect}
        items={document_items}
        pageInfo={documents_data?.documents?.pageInfo}
        loading={documents_loading}
        loading_message="Loading Documents..."
        fetchMore={fetchMoreDocuments}
      />
    </CardLayout>
  );
};
