import { useEffect, useRef, useState } from "react";
import {
  useLazyQuery,
  useMutation,
  useQuery,
  useReactiveVar,
} from "@apollo/client";
import { useLocation, useParams } from "react-router-dom";
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
  GET_DOCUMENT_ONLY,
  GetDocumentOnlyInput,
  GetDocumentOnlyOutput,
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
  viewingDocument,
  openedCorpus,
  userObj,
  showBulkUploadModal,
  showUploadNewDocumentsModal,
  backendUserObj,
} from "../graphql/cache";

import { CRUDModal } from "../components/widgets/CRUD/CRUDModal";
import { ActionDropdownItem, LooseObject } from "../components/types";
import { CardLayout } from "../components/layout/CardLayout";
import { FilterToLabelSelector } from "../components/widgets/model-filters/FilterToLabelSelector";
import { DocumentType, LabelType } from "../types/graphql-api";
import { AddToCorpusModal } from "../components/modals/AddToCorpusModal";
import { ConfirmModal } from "../components/widgets/modals/ConfirmModal";
import { CreateAndSearchBar } from "../components/layout/CreateAndSearchBar";
import {
  editDocForm_Schema,
  editDocForm_Ui_Schema,
} from "../components/forms/schemas";
import { FilterToLabelsetSelector } from "../components/widgets/model-filters/FilterToLabelsetSelector";
import { FilterToCorpusSelector } from "../components/widgets/model-filters/FilterToCorpusSelector";
import { CorpusDocumentCards } from "../components/documents/CorpusDocumentCards";
import { BulkUploadModal } from "../components/widgets/modals/BulkUploadModal";

export const Documents = () => {
  const { documentId: routeDocumentId } = useParams();
  const auth_token = useReactiveVar(authToken);
  const current_user = useReactiveVar(userObj);
  const backend_user = useReactiveVar(backendUserObj);
  const document_to_edit = useReactiveVar(editingDocument);
  const document_to_view = useReactiveVar(viewingDocument);
  const show_bulk_upload_modal = useReactiveVar(showBulkUploadModal);

  const show_upload_new_documents_modal = useReactiveVar(
    showUploadNewDocumentsModal
  );
  const filtered_to_labelset_id = useReactiveVar(filterToLabelsetId);
  const filtered_to_label_id = useReactiveVar(filterToLabelId);
  const filtered_to_corpus = useReactiveVar(filterToCorpus);
  const selected_document_ids = useReactiveVar(selectedDocumentIds);
  const document_search_term = useReactiveVar(documentSearchTerm);
  const show_add_docs_to_corpus_modal = useReactiveVar(
    showAddDocsToCorpusModal
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

  // Handlers are provided by `CorpusDocumentCards` which passes them down to `DocumentCards`.

  // If we just logged in, refetch docs in case there are documents that are not public and are only visible to current user
  useEffect(() => {
    if (auth_token) {
      // console.log("DocumentItem - refetchDocuments due to auth_token");
      refetchDocuments();
    }
  }, [auth_token]);

  // If we navigated here, refetch documents to ensure we have fresh docs
  useEffect(() => {
    refetchDocuments();
  }, [location]);

  // If doc search term changes, refetch documents
  useEffect(() => {
    // console.log("document_search_term change");
    refetchDocuments();
  }, [document_search_term]);

  // If selected label changes, refetch docs
  useEffect(() => {
    // console.log("filtered_to_label_id change");
    refetchDocuments();
  }, [filtered_to_label_id]);

  // If selected labelSET changes, refetch docs
  useEffect(() => {
    // console.log("filter_to_labelset_id change");
    refetchDocuments();
  }, [filtered_to_labelset_id]);

  // If selected corpus changes, refetch docs
  useEffect(() => {
    // console.log("filtered_to_corpus change");
    refetchDocuments();
  }, [filtered_to_corpus]);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout;
    const areDocumentsProcessing = document_items.some(
      (doc) => doc.backendLock
    );

    if (areDocumentsProcessing) {
      // Start polling every 5 seconds
      pollInterval = setInterval(() => {
        refetchDocuments();
      }, 15000);

      // Set up a timeout to stop polling after 10 minutes
      const timeoutId = setTimeout(() => {
        clearInterval(pollInterval);
        toast.info(
          "Document processing is taking too long... polling paused after 10 minutes."
        );
      }, 600000);

      // Clean up the interval and timeout when the component unmounts or the condition changes
      return () => {
        clearInterval(pollInterval);
        clearTimeout(timeoutId);
      };
    }
  }, [document_items, refetchDocuments]);

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

  /**
   * URL → State hydration for openedDocument
   * When a user lands on /documents/:documentId, fetch the document (if needed)
   * and ensure openedDocument reflects the route selection.
   */
  useEffect(() => {
    if (!routeDocumentId) {
      // If URL no longer has a document id, clear openedDocument
      if (openedDocument()) openedDocument(null);
      return;
    }
    // If we already have the correct opened document, do nothing
    const current = openedDocument();
    if (current && current.id === routeDocumentId) return;
    // Set a minimal placeholder so downstream UI updates quickly; detailed data can be hydrated elsewhere
    openedDocument({ id: routeDocumentId } as any);
  }, [routeDocumentId]);

  /**
   * Deep-link hydration: if the selected document id is not present in the
   * current list results, lazily fetch it and populate openedDocument.
   */
  const [fetchDocumentById, { data: docByIdData, loading: docByIdLoading }] =
    useLazyQuery<GetDocumentOnlyOutput, GetDocumentOnlyInput>(
      GET_DOCUMENT_ONLY,
      {
        fetchPolicy: "network-only",
      }
    );

  useEffect(() => {
    if (!routeDocumentId) return;
    const inList = document_items.some((d) => d.id === routeDocumentId);
    if (!inList && !docByIdLoading && !docByIdData) {
      fetchDocumentById({ variables: { documentId: routeDocumentId } });
    }
  }, [
    routeDocumentId,
    document_items,
    docByIdLoading,
    docByIdData,
    fetchDocumentById,
  ]);

  useEffect(() => {
    if (docByIdData?.document) {
      openedDocument(docByIdData.document as any);
    }
  }, [docByIdData]);

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
    // console.log("handleUpdateDocument", document_obj);
    let variables = { variables: document_obj };
    // console.log("handleUpdateDocument variables", variables);
    tryUpdateDocument(variables);
  };

  // Build the actions for the search / context bar dropdown menu
  let document_actions: ActionDropdownItem[] = [];

  if (auth_token && current_user) {
    document_actions.push({
      key: "documents_action_dropdown_import_single",
      title: "Import Document",
      icon: "file alternate outline",
      color: "blue",
      action_function: () =>
        showUploadNewDocumentsModal(!show_upload_new_documents_modal),
    });
    if (backend_user && !backend_user.isUsageCapped) {
      document_actions.push({
        key: "documents_action_dropdown_bulk_upload",
        title: "Bulk Upload (.zip)",
        icon: "cloud upload",
        color: "teal",
        action_function: () => showBulkUploadModal(!show_bulk_upload_modal),
      });
    }
    if (selected_document_ids.length > 0) {
      document_actions.push({
        key: `documents_action_dropdown_add_to_corpus`,
        title: "Add to Corpus",
        icon: "plus",
        color: "green",
        action_function: () =>
          showAddDocsToCorpusModal(!show_add_docs_to_corpus_modal),
      });
      document_actions.push({
        key: `documents_action_dropdown_delete`,
        title: "Delete",
        icon: "trash",
        color: "red",
        action_function: () =>
          showDeleteDocumentsModal(!show_delete_documents_modal),
      });
    }
  }

  ////////////////////////////////////////////////////////////////////////////////
  // LONG POLL CODE                                                             //
  ////////////////////////////////////////////////////////////////////////////////

  const opened_corpus = useReactiveVar(openedCorpus);

  return (
    <CardLayout
      Modals={
        <>
          <BulkUploadModal />
          <AddToCorpusModal
            open={show_add_docs_to_corpus_modal}
            onClose={() => showAddDocsToCorpusModal(false)}
            onSuccess={(corpusId) => {
              toast.success("Documents added to corpus successfully!");
              selectedDocumentIds([]);
            }}
            documents={document_items}
            selectedDocumentIds={selected_document_ids}
            multiStep={true}
            title="Add Documents to Corpus"
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
          <CRUDModal
            open={document_to_edit !== null}
            mode="EDIT"
            oldInstance={document_to_edit ? document_to_edit : {}}
            modelName="document"
            uiSchema={editDocForm_Ui_Schema}
            dataSchema={editDocForm_Schema}
            onSubmit={handleUpdateDocument}
            onClose={() => editingDocument(null)}
            hasFile={true}
            fileField="pdfFile"
            fileLabel="PDF File"
            fileIsImage={false}
            acceptedFileTypes="pdf"
          />
          <CRUDModal
            open={document_to_view !== null}
            mode="VIEW"
            oldInstance={document_to_view ? document_to_view : {}}
            modelName="document"
            uiSchema={editDocForm_Ui_Schema}
            dataSchema={editDocForm_Schema}
            onClose={() => viewingDocument(null)}
            hasFile={true}
            fileField="pdfFile"
            fileLabel="PDF File"
            fileIsImage={false}
            acceptedFileTypes="pdf"
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
      <CorpusDocumentCards opened_corpus_id={opened_corpus?.id || null} />
    </CardLayout>
  );
};
