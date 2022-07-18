import { useState, useRef, useEffect, ReactNode } from "react";
import { Tab } from "semantic-ui-react";
import _ from "lodash";
import { toast } from "react-toastify";
import {
  useLazyQuery,
  useMutation,
  useQuery,
  useReactiveVar,
} from "@apollo/client";
import { useLocation } from "react-router-dom";

import { ConfirmModal } from "../components/widgets/modals/ConfirmModal";
import { CorpusCards } from "../components/corpuses/CorpusCards";
import {
  CreateAndSearchBar,
  DropdownActionProps,
} from "../components/layout/CreateAndSearchBar";
import { CRUDModal } from "../components/widgets/CRUD/CRUDModal";
import { CardLayout } from "../components/layout/CardLayout";
import { CorpusBreadcrumbs } from "../components/corpuses/CorpusBreadcrumbs";
import { DocumentCards } from "../components/documents/DocumentCards";
import { LabelSetSelector } from "../components/widgets/CRUD/LabelSetSelector";
import { AnnotationCards } from "../components/annotations/AnnotationCards";
import {
  newCorpusForm_Ui_Schema,
  newCorpusForm_Schema,
  editCorpusForm_Schema,
  editCorpusForm_Ui_Schema,
} from "../components/forms/schemas";

import {
  openedCorpus,
  selectedDocumentIds,
  corpusSearchTerm,
  deletingCorpus,
  showRemoveDocsFromCorpusModal,
  editingCorpus,
  viewingCorpus,
  documentSearchTerm,
  authToken,
  annotationContentSearchTerm,
  filterToLabelsetId,
  openedDocument,
  showSelectedAnnotationOnly,
  showAnnotationBoundingBoxes,
  showAnnotationLabels,
  selectedAnnotation,
  filterToLabelId,
} from "../graphql/cache";
import {
  UPDATE_CORPUS,
  UpdateCorpusOutputs,
  UpdateCorpusInputs,
  CREATE_CORPUS,
  CreateCorpusOutputs,
  CreateCorpusInputs,
  DELETE_CORPUS,
  DeleteCorpusOutputs,
  DeleteCorpusInputs,
  REMOVE_DOCUMENTS_FROM_CORPUS,
  RemoveDocumentsFromCorpusOutputs,
  RemoveDocumentsFromCorpusInputs,
  StartImportCorpusExport,
  StartImportCorpusInputs,
  START_IMPORT_CORPUS,
} from "../graphql/mutations";
import {
  GetAnnotationsInputs,
  GetAnnotationsOutputs,
  GetCorpusesInputs,
  GetCorpusesOutputs,
  GET_ANNOTATIONS,
  GET_CORPUSES,
  RequestDocumentsInputs,
  RequestDocumentsOutputs,
  REQUEST_DOCUMENTS,
} from "../graphql/queries";
import {
  ServerAnnotationType,
  CorpusType,
  DocumentType,
  LabelType,
} from "../graphql/types";
import { LooseObject } from "../components/types";
import { Annotator } from "../components/annotator/Annotator";
import { toBase64 } from "../utils/files";
import { FilterToLabelSelector } from "../components/widgets/model-filters/FilterToLabelSelector";

export const Corpuses = () => {
  const show_remove_docs_from_corpus_modal = useReactiveVar(
    showRemoveDocsFromCorpusModal
  );
  const selected_document_ids = useReactiveVar(selectedDocumentIds);
  const document_search_term = useReactiveVar(documentSearchTerm);
  const corpus_search_term = useReactiveVar(corpusSearchTerm);
  const deleting_corpus = useReactiveVar(deletingCorpus);
  const corpus_to_edit = useReactiveVar(editingCorpus);
  const corpus_to_view = useReactiveVar(viewingCorpus);
  const opened_corpus = useReactiveVar(openedCorpus);
  const opened_document = useReactiveVar(openedDocument);
  const opened_to_annotation = useReactiveVar(selectedAnnotation);
  const show_selected_annotation_only = useReactiveVar(
    showSelectedAnnotationOnly
  );
  const show_annotation_bounding_boxes = useReactiveVar(
    showAnnotationBoundingBoxes
  );
  const show_annotation_labels = useReactiveVar(showAnnotationLabels);

  const auth_token = useReactiveVar(authToken);
  const annotation_search_term = useReactiveVar(annotationContentSearchTerm);
  const filter_to_labelset_id = useReactiveVar(filterToLabelsetId);
  const filter_to_label_id = useReactiveVar(filterToLabelId);

  const location = useLocation();

  const corpusUploadRef = useRef() as React.MutableRefObject<HTMLInputElement>;

  const [show_multi_delete_confirm, setShowMultiDeleteConfirm] =
    useState<boolean>(false);
  const [show_new_corpus_modal, setShowNewCorpusModal] =
    useState<boolean>(false);
  const [active_tab, setActiveTab] = useState<number>(0);

  const [corpusSearchCache, setCorpusSearchCache] =
    useState<string>(corpus_search_term);
  const [documentSearchCache, setDocumentSearchCache] =
    useState<string>(document_search_term);
  const [annotationSearchCache, setAnnotationSearchCache] = useState<string>(
    annotation_search_term
  );

  const opened_corpus_id = opened_corpus?.id ? opened_corpus.id : null;

  /**
   * Set up the debounced search handling for the two SearchBars (Corpus search is rendered first by this component,
   * but it will switch to doc search if you select a corpus, as this will navigate to show the corpus' docs)
   */
  const debouncedCorpusSearch = useRef(
    _.debounce((searchTerm) => {
      corpusSearchTerm(searchTerm);
    }, 1000)
  );

  const debouncedDocumentSearch = useRef(
    _.debounce((searchTerm) => {
      documentSearchTerm(searchTerm);
    }, 1000)
  );

  const debouncedAnnotationSearch = useRef(
    _.debounce((searchTerm) => {
      annotationContentSearchTerm(searchTerm);
    }, 1000)
  );

  const handleCorpusSearchChange = (value: string) => {
    setCorpusSearchCache(value);
    debouncedCorpusSearch.current(value);
  };

  const handleDocumentSearchChange = (value: string) => {
    setDocumentSearchCache(value);
    debouncedDocumentSearch.current(value);
  };

  const handleAnnotationSearchChange = (value: string) => {
    setAnnotationSearchCache(value);
    debouncedAnnotationSearch.current(value);
  };

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Setup document resolvers and mutations
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const [
    fetchDocuments,
    {
      refetch: refetchDocuments,
      loading: documents_loading,
      error: documents_error,
      data: documents_response,
      fetchMore: fetchMoreDocuments,
    },
  ] = useLazyQuery<RequestDocumentsOutputs, RequestDocumentsInputs>(
    REQUEST_DOCUMENTS,
    {
      variables: {
        ...(opened_corpus
          ? { annotateDocLabels: true, inCorpusWithId: opened_corpus.id }
          : { annotateDocLabels: false }),
        ...(filter_to_label_id ? { hasLabelWithId: filter_to_label_id } : {}),
        ...(document_search_term ? { textSearch: document_search_term } : {}),
      },
      notifyOnNetworkStatusChange: true, // necessary in order to trigger loading signal on fetchMore
    }
  );

  useEffect(() => {
    refetchDocuments();
  }, [document_search_term]);

  const [removeDocumentsFromCorpus, {}] = useMutation<
    RemoveDocumentsFromCorpusOutputs,
    RemoveDocumentsFromCorpusInputs
  >(REMOVE_DOCUMENTS_FROM_CORPUS, {
    onCompleted: () => {
      refetchDocuments();
    },
  });

  const [startImportCorpus, {}] = useMutation<
    StartImportCorpusExport,
    StartImportCorpusInputs
  >(START_IMPORT_CORPUS, {
    onCompleted: () =>
      toast.success("SUCCESS!\vCorpus file upload and import has started."),
    onError: () => toast.error("ERROR\nCould not upload the corpus file"),
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Query to get corpuses
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  let corpus_variables: LooseObject = {};
  if (corpus_search_term) {
    corpus_variables["textSearch"] = corpus_search_term;
  }
  const {
    refetch: refetchCorpuses,
    loading: loading_corpuses,
    error: corpus_load_error,
    data: corpus_response,
    fetchMore: fetchMoreCorpuses,
  } = useQuery<GetCorpusesOutputs, GetCorpusesInputs>(GET_CORPUSES, {
    variables: corpus_variables,
    notifyOnNetworkStatusChange: true, // required to get loading signal on fetchMore
  });
  if (corpus_load_error) {
    toast.error("ERROR\nUnable to fetch corpuses.");
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Query to get annotations
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const [
    fetchAnnotations,
    {
      refetch: refetchAnnotations,
      loading: annotation_loading,
      error: annotation_error,
      data: annotation_response,
      fetchMore: fetchMoreAnnotations,
    },
  ] = useLazyQuery<GetAnnotationsOutputs, GetAnnotationsInputs>(
    GET_ANNOTATIONS,
    {
      notifyOnNetworkStatusChange: true, // necessary in order to trigger loading signal on fetchMore
      variables: {
        annotationLabel_Type: "TOKEN_LABEL",
        ...(opened_corpus ? { corpusId: opened_corpus.id } : {}),
        ...(filter_to_label_id
          ? { annotationLabelId: filter_to_label_id }
          : {}),
        ...(filter_to_labelset_id
          ? { usesLabelFromLabelsetId: filter_to_labelset_id }
          : {}),
        ...(annotation_search_term
          ? { rawText_Contains: annotation_search_term }
          : {}),
      },
    }
  );
  if (annotation_error) {
    toast.error("ERROR\nCould not fetch annotations.");
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Effects to reload data on certain changes
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // If user logs in while on this page... refetch to get their authorized corpuses
  useEffect(() => {
    if (auth_token) {
      refetchCorpuses();
      if (opened_corpus) {
        refetchDocuments();
        refetchAnnotations();
      }
    }
  }, [auth_token]);

  // If the tab changes, refetch appropriate data for selected tab
  useEffect(() => {
    switch (active_tab) {
      case 0:
        refetchDocuments();
        break;
      case 1:
        refetchAnnotations();
        break;
      default:
        break;
    }
  }, [active_tab]);

  useEffect(() => {
    refetchCorpuses();
  }, [corpus_search_term]);

  useEffect(() => {
    console.log("Apple");
    if (filter_to_label_id) {
      switch (active_tab) {
        case 0:
          refetchDocuments();
          break;
        case 1:
          refetchAnnotations();
          break;
        default:
          console.log(`Unexpected tab index: ${active_tab}`);
      }
    }
  }, [filter_to_label_id]);

  // If we detech user navigated to this page, refetch
  useEffect(() => {
    refetchCorpuses().then(() => {
      if (opened_corpus) {
        fetchDocuments();
        refetchAnnotations();
      }
    });
  }, [location]);

  useEffect(() => {
    console.log("Opened corpus");
    if (opened_corpus_id) {
      console.log("Fetch docs and annotations");
      refetchDocuments();
      refetchAnnotations();
    } else {
      console.log("Fetch corpuses");
      refetchCorpuses();
    }
  }, [opened_corpus_id, refetchCorpuses, fetchDocuments, fetchAnnotations]);

  useEffect(() => {
    refetchAnnotations();
  }, [annotation_search_term]);

  useEffect(() => {
    fetchDocuments();
    if (active_tab === 1) {
      fetchAnnotations();
    }
  }, []);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Query to shape item data
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const annotation_data = annotation_response?.annotations?.edges
    ? annotation_response.annotations.edges
    : [];
  const annotation_items = annotation_data
    .map((edge) => (edge ? edge.node : undefined))
    .filter((item): item is ServerAnnotationType => !!item);

  const corpus_data = corpus_response?.corpuses?.edges
    ? corpus_response.corpuses.edges
    : [];
  const corpus_items = corpus_data
    .map((edge) => (edge ? edge.node : undefined))
    .filter((item): item is CorpusType => !!item);

  const document_data = documents_response?.documents?.edges
    ? documents_response.documents.edges
    : [];
  const document_items = document_data
    .map((edge) => (edge?.node ? edge.node : undefined))
    .filter((item): item is DocumentType => !!item);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Query to mutate corpus
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const [tryMutateCorpus, { loading: update_corpus_loading }] = useMutation<
    UpdateCorpusOutputs,
    UpdateCorpusInputs
  >(UPDATE_CORPUS, {
    onCompleted: (data) => {
      refetchCorpuses();
      editingCorpus(null);
    },
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Query to delete corpus
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const [tryDeleteCorpus, { loading: delete_corpus_loading }] = useMutation<
    DeleteCorpusOutputs,
    DeleteCorpusInputs
  >(DELETE_CORPUS, {
    onCompleted: (data) => {
      refetchCorpuses();
    },
  });

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Query to delete corpus
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const [tryCreateCorpus, { loading: create_corpus_loading }] = useMutation<
    CreateCorpusOutputs,
    CreateCorpusInputs
  >(CREATE_CORPUS, {
    onCompleted: (data) => {
      refetchCorpuses();
      setShowNewCorpusModal(false);
    },
  });

  // When an import file is selected by user and change is detected in <input>,
  // read and convert file to base64string, then upload to the start import mutation.
  const onImportFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event?.target?.files?.item(0)) {
      let reader = new FileReader();
      reader.onload = async (e) => {
        if (event?.target?.files?.item(0) != null) {
          var base64FileString = await toBase64(
            event.target.files.item(0) as File
          );
          if (
            typeof base64FileString === "string" ||
            base64FileString instanceof String
          ) {
            startImportCorpus({
              variables: { base64FileString: base64FileString.split(",")[1] },
            });
          }
        }
      };
      reader.readAsDataURL(event.target.files[0]);
    }
  };

  // TODO - Implement; Improve typing.
  const handleUpdateCorpus = (corpus_obj: any) => {
    // console.log("handleUpdateCorpus", corpus_obj);
    let variables = {
      variables: corpus_obj,
    };
    // console.log("handleUpdateCorpus variables", variables);
    tryMutateCorpus(variables);
  };

  // TODO - Implement; Improve typing.
  const handleDeleteCorpus = (corpus_id: string | undefined) => {
    if (corpus_id) {
      // console.log("handleDeleteCorpus", corpus_id)
      tryDeleteCorpus({ variables: { id: corpus_id } })
        .then((data) => {
          toast.success("SUCCESS! Deleted corpus.");
        })
        .catch((err) => {
          toast.error("ERROR! Could not delete corpus.");
        });
    }
  };

  // TODO - Implement.
  const handleRemoveContracts = (delete_ids: string[]) => {
    // console.log("handleRemoveContracts", delete_ids);
    removeDocumentsFromCorpus({
      variables: {
        corpusId: opened_corpus?.id ? opened_corpus.id : "",
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

  // TODO - Implement; Improve typing.
  const handleCreateNewCorpus = (corpus_json: Record<string, any>) => {
    tryCreateCorpus({ variables: corpus_json })
      .then((data) => {
        console.log("Data", data);
        if (data.data?.createCorpus.ok) {
          toast.success("SUCCESS. Created corpus.");
        } else {
          toast.error(`FAILED on server: ${data.data?.createCorpus.message}`);
        }
        refetchCorpuses();
        setShowNewCorpusModal(false);
      })
      .catch((err) => {
        toast.error("ERROR. Could not create corpus.");
      });
  };

  let corpus_actions: DropdownActionProps[] = [];
  if (auth_token) {
    corpus_actions = [
      ...corpus_actions,
      {
        icon: "cloud upload",
        title: "Import Corpus",
        key: `Corpus_action_${1}`,
        color: "green",
        action_function: () => corpusUploadRef.current.click(),
      },
      {
        icon: "plus",
        title: "Create Corpus",
        key: `Corpus_action_${0}`,
        color: "blue",
        action_function: () => setShowNewCorpusModal(true),
      },
    ];
  }

  let contract_actions: DropdownActionProps[] = [];
  if (selected_document_ids.length > 0 && authToken) {
    contract_actions.push({
      icon: "remove circle",
      title: "Remove Contract(s)",
      key: `Corpus_action_${corpus_actions.length}`,
      color: "blue",
      action_function: () => setShowMultiDeleteConfirm(true),
    });
  }

  let panes = [
    {
      menuItem: "Contracts",
      render: () => (
        <Tab.Pane>
          <DocumentCards
            items={document_items}
            loading={documents_loading}
            loading_message="Documents Loading..."
            pageInfo={documents_response?.documents.pageInfo}
            style={{ minHeight: "70vh" }}
            fetchMore={fetchMoreDocuments}
            removeFromCorpus={opened_corpus ? handleRemoveContracts : undefined}
          />
        </Tab.Pane>
      ),
    },
    {
      menuItem: "Annotations",
      render: () => (
        <Tab.Pane>
          <AnnotationCards
            items={annotation_items}
            loading={annotation_loading}
            loading_message="Annotations Loading..."
            pageInfo={annotation_response?.annotations.pageInfo}
            style={{ minHeight: "70vh" }}
            fetchMore={fetchMoreAnnotations}
          />
        </Tab.Pane>
      ),
    },
  ];

  return (
    <CardLayout
      Modals={
        <>
          <ConfirmModal
            message={`Are you sure you want to delete corpus?`}
            yesAction={() => handleDeleteCorpus(deleting_corpus?.id)}
            noAction={() => deletingCorpus(null)}
            toggleModal={() => deletingCorpus(null)}
            visible={Boolean(deleting_corpus)}
          />
          <ConfirmModal
            message={"Remove selected contracts?"}
            yesAction={() => handleRemoveContracts(selected_document_ids)}
            noAction={() => setShowMultiDeleteConfirm(false)}
            toggleModal={() => setShowMultiDeleteConfirm(false)}
            visible={show_multi_delete_confirm}
          />
          <ConfirmModal
            message={`Are you sure you want to remove contract(s) from corpus?`}
            yesAction={() => handleRemoveContracts(selected_document_ids)}
            noAction={() =>
              showRemoveDocsFromCorpusModal(!show_remove_docs_from_corpus_modal)
            }
            toggleModal={() =>
              showRemoveDocsFromCorpusModal(!show_remove_docs_from_corpus_modal)
            }
            visible={show_remove_docs_from_corpus_modal}
          />
          <CRUDModal
            open={corpus_to_edit !== null}
            mode="EDIT"
            old_instance={corpus_to_edit ? corpus_to_edit : {}}
            model_name="corpus"
            ui_schema={editCorpusForm_Ui_Schema}
            data_schema={editCorpusForm_Schema}
            onSubmit={handleUpdateCorpus}
            onClose={() => editingCorpus(null)}
            has_file={true}
            file_field={"icon"}
            file_label="Corpus Icon"
            file_is_image={true}
            accepted_file_types="image/*"
            property_widgets={{ labelSet: <LabelSetSelector /> }}
          />
          {corpus_to_view !== null ? (
            <CRUDModal
              open={corpus_to_view !== null}
              mode="VIEW"
              old_instance={corpus_to_view ? corpus_to_view : {}}
              model_name="corpus"
              ui_schema={editCorpusForm_Ui_Schema}
              data_schema={editCorpusForm_Schema}
              onClose={() => viewingCorpus(null)}
              has_file={true}
              file_field={"icon"}
              file_label="Corpus Icon"
              file_is_image={true}
              accepted_file_types="image/*"
              property_widgets={{
                labelSet: <LabelSetSelector read_only={true} />,
              }}
            />
          ) : (
            <></>
          )}

          {show_new_corpus_modal ? (
            <CRUDModal
              open={show_new_corpus_modal}
              mode="CREATE"
              old_instance={{ shared_with: [], is_public: false }}
              model_name="corpus"
              ui_schema={newCorpusForm_Ui_Schema}
              data_schema={newCorpusForm_Schema}
              onSubmit={handleCreateNewCorpus}
              onClose={() => setShowNewCorpusModal(!show_new_corpus_modal)}
              has_file={true}
              file_field={"icon"}
              file_label="Corpus Icon"
              file_is_image={true}
              accepted_file_types="image/*"
              property_widgets={{ labelSet: <LabelSetSelector /> }}
            />
          ) : (
            <></>
          )}
        </>
      }
      SearchBar={
        opened_corpus === null ? (
          <CreateAndSearchBar
            onChange={handleCorpusSearchChange}
            actions={corpus_actions}
            placeholder="Search for corpus..."
            value={corpusSearchCache}
          />
        ) : active_tab === 0 ? (
          <CreateAndSearchBar
            onChange={handleDocumentSearchChange}
            actions={contract_actions}
            placeholder="Search for document in corpus..."
            value={documentSearchCache}
            filters={
              opened_corpus ? (
                <FilterToLabelSelector
                  only_labels_for_labelset_id={
                    opened_corpus.labelSet?.id ? opened_corpus.labelSet.id : ""
                  }
                  label_type={LabelType.DocTypeLabel}
                />
              ) : (
                <></>
              )
            }
          />
        ) : (
          <CreateAndSearchBar
            onChange={handleAnnotationSearchChange}
            actions={[]}
            placeholder="Search for annotated text in corpus..."
            value={annotationSearchCache}
            filters={
              opened_corpus ? (
                <FilterToLabelSelector
                  only_labels_for_labelset_id={
                    opened_corpus.labelSet?.id ? opened_corpus.labelSet.id : ""
                  }
                  label_type={LabelType.TokenLabel}
                />
              ) : (
                <></>
              )
            }
          />
        )
      }
      BreadCrumbs={opened_corpus !== null ? <CorpusBreadcrumbs /> : null}
    >
      <input
        ref={corpusUploadRef}
        id="uploadInputFile"
        hidden
        type="file"
        onChange={onImportFileChange}
      />
      {opened_corpus !== null ? (
        opened_document === null ? (
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "center",
              height: "100%",
              marginLeft: "1rem",
              marginRight: "1rem",
            }}
          >
            <Tab
              attached="bottom"
              style={{ width: "100%" }}
              activeIndex={active_tab}
              onTabChange={(e, { activeIndex }) =>
                setActiveTab(activeIndex ? Number(activeIndex) : 0)
              }
              panes={panes}
            />
          </div>
        ) : (
          <Annotator
            open={Boolean(opened_document)}
            onClose={() => openedDocument(null)}
            openedDocument={opened_document}
            openedCorpus={opened_corpus}
            scroll_to_annotation_on_open={opened_to_annotation}
            show_selected_annotation_only={show_selected_annotation_only}
            show_annotation_bounding_boxes={show_annotation_bounding_boxes}
            show_annotation_labels={show_annotation_labels}
          />
        )
      ) : (
        <CorpusCards
          items={corpus_items}
          pageInfo={corpus_response?.corpuses?.pageInfo}
          loading={loading_corpuses}
          loading_message="Loading Corpuses..."
          fetchMore={fetchMoreCorpuses}
        />
      )}
    </CardLayout>
  );
};
