import { useState, useRef, useEffect } from "react";
import { Tab } from "semantic-ui-react";
import _, { update } from "lodash";
import { toast } from "react-toastify";
import {
  ApolloError,
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
import { LabelSetSelector } from "../components/widgets/CRUD/LabelSetSelector";
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
  openedDocument,
  showSelectedAnnotationOnly,
  showAnnotationBoundingBoxes,
  showAnnotationLabels,
  selectedMetaAnnotationId,
  filterToLabelId,
  showAnalyzerSelectionForCorpus,
  selectedAnalyses,
  analysisSearchTerm,
  selectedAnalysesIds,
  displayAnnotationOnAnnotatorLoad,
  exportingCorpus,
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
  GetCorpusesInputs,
  GetCorpusesOutputs,
  GetCorpusMetadataInputs,
  GetCorpusMetadataOutputs,
  GET_CORPUSES,
  GET_CORPUS_METADATA,
  RequestDocumentsInputs,
  RequestDocumentsOutputs,
  GET_DOCUMENTS,
} from "../graphql/queries";
import { CorpusType, LabelType } from "../graphql/types";
import { LooseObject } from "../components/types";
import { Annotator } from "../components/annotator/Annotator";
import { toBase64 } from "../utils/files";
import { FilterToLabelSelector } from "../components/widgets/model-filters/FilterToLabelSelector";
import { CorpusAnnotationCards } from "../components/annotations/CorpusAnnotationCards";
import { CorpusDocumentCards } from "../components/documents/CorpusDocumentCards";
import { SelectAnalyzerModal } from "../components/analyzers/SelectAnalyzerModal";
import { CorpusAnalysesCards } from "../components/analyses/CorpusAnalysesCards";
import { FilterToAnalysesSelector } from "../components/widgets/model-filters/FilterToAnalysesSelector";
import useWindowDimensions from "../components/hooks/WindowDimensionHook";
import { FilterToMetadataSelector } from "../components/widgets/model-filters/FilterToMetadataSelector";
import { SelectExportTypeModal } from "../components/widgets/modals/SelectExportTypeModal";
import { CorpusQueryList } from "../components/queries/CorpusQueryList";
import { NewQuerySearch } from "../components/queries/NewQuerySearch";

export const Corpuses = () => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= 400;
  const banish_sidebar = width <= 1000;

  const show_remove_docs_from_corpus_modal = useReactiveVar(
    showRemoveDocsFromCorpusModal
  );
  const selected_metadata_id_to_filter_on = useReactiveVar(
    selectedMetaAnnotationId
  );
  const selected_analyes = useReactiveVar(selectedAnalyses);
  const selected_document_ids = useReactiveVar(selectedDocumentIds);
  const document_search_term = useReactiveVar(documentSearchTerm);
  const corpus_search_term = useReactiveVar(corpusSearchTerm);
  const analysis_search_term = useReactiveVar(analysisSearchTerm);
  const deleting_corpus = useReactiveVar(deletingCorpus);
  const corpus_to_analyze = useReactiveVar(showAnalyzerSelectionForCorpus);
  const corpus_to_edit = useReactiveVar(editingCorpus);
  const corpus_to_view = useReactiveVar(viewingCorpus);
  const opened_corpus = useReactiveVar(openedCorpus);
  const exporting_corpus = useReactiveVar(exportingCorpus);
  const opened_document = useReactiveVar(openedDocument);
  const opened_to_annotation = useReactiveVar(displayAnnotationOnAnnotatorLoad);
  const show_selected_annotation_only = useReactiveVar(
    showSelectedAnnotationOnly
  );
  const show_annotation_bounding_boxes = useReactiveVar(
    showAnnotationBoundingBoxes
  );
  const show_annotation_labels = useReactiveVar(showAnnotationLabels);
  const filter_to_label_id = useReactiveVar(filterToLabelId);

  const auth_token = useReactiveVar(authToken);
  const annotation_search_term = useReactiveVar(annotationContentSearchTerm);

  const location = useLocation();

  const corpusUploadRef = useRef() as React.MutableRefObject<HTMLInputElement>;

  const [show_multi_delete_confirm, setShowMultiDeleteConfirm] =
    useState<boolean>(false);
  const [show_new_corpus_modal, setShowNewCorpusModal] =
    useState<boolean>(false);
  const [active_tab, setActiveTab] = useState<number>(0);

  const [corpusSearchCache, setCorpusSearchCache] =
    useState<string>(corpus_search_term);
  const [analysesSearchCache, setAnalysesSearchCache] =
    useState<string>(analysis_search_term);
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

  const debouncedAnalysisSearch = useRef(
    _.debounce((searchTerm) => {
      analysisSearchTerm(searchTerm);
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

  const handleAnalysisSearchChange = (value: string) => {
    setAnalysesSearchCache(value);
    debouncedAnalysisSearch.current(value);
  };

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Setup document resolvers and mutations
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const [startImportCorpus, {}] = useMutation<
    StartImportCorpusExport,
    StartImportCorpusInputs
  >(START_IMPORT_CORPUS, {
    onCompleted: () =>
      toast.success("SUCCESS!\vCorpus file upload and import has started."),
    onError: (error: ApolloError) =>
      toast.error(`Could Not Start Import: ${error.message}`),
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
    fetchMore: fetchMoreCorpusesOrig,
  } = useQuery<GetCorpusesOutputs, GetCorpusesInputs>(GET_CORPUSES, {
    variables: corpus_variables,
    notifyOnNetworkStatusChange: true, // required to get loading signal on fetchMore
  });

  if (corpus_load_error) {
    toast.error("ERROR\nUnable to fetch corpuses.");
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Query to get Metadata for Selected Corpus
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const [
    fetchMetadata,
    {
      called: metadata_called,
      loading: metadata_loading,
      data: metadata_data,
      refetch: refetchMetadata,
    },
  ] = useLazyQuery<GetCorpusMetadataOutputs, GetCorpusMetadataInputs>(
    GET_CORPUS_METADATA
  );

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Query to refetch documents if dropdown action is used to delink a doc from corpus
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const [
    fetchDocumentsLazily,
    { error: documents_error, refetch: refetch_documents },
  ] = useLazyQuery<RequestDocumentsOutputs, RequestDocumentsInputs>(
    GET_DOCUMENTS,
    {
      variables: {
        ...(opened_corpus_id
          ? {
              annotateDocLabels: true,
              includeMetadata: true,
              inCorpusWithId: opened_corpus_id,
            }
          : { annotateDocLabels: false, includeMetadata: false }),
        ...(filter_to_label_id ? { hasLabelWithId: filter_to_label_id } : {}),
        ...(selected_metadata_id_to_filter_on
          ? { hasAnnotationsWithIds: selected_metadata_id_to_filter_on }
          : {}),
        ...(document_search_term ? { textSearch: document_search_term } : {}),
      },
      notifyOnNetworkStatusChange: true, // necessary in order to trigger loading signal on fetchMore
    }
  );
  if (documents_error) {
    toast.error("ERROR\nCould not fetch documents for corpus.");
  }

  useEffect(() => {
    // console.log("Corpuses.tsx - Loading Corpuses changed...");
  }, [loading_corpuses]);

  const fetchMoreCorpuses = (args: any) => {
    // console.log("Corpuses.txt - fetchMoreCorpuses()");
    fetchMoreCorpusesOrig(args);
  };

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Effects to reload data on certain changes
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // If user logs in while on this page... refetch to get their authorized corpuses
  useEffect(() => {
    if (auth_token) {
      refetchCorpuses();
      refetchMetadata();
    }
  }, [auth_token]);

  useEffect(() => {
    // console.log("corpus_search_term");
    refetchCorpuses();
  }, [corpus_search_term]);

  // If we detech user navigated to this page, refetch
  useEffect(() => {
    if (location.pathname === "/corpuses") {
      refetchCorpuses();
    }
  }, [location]);

  useEffect(() => {
    if (!opened_corpus_id || opened_corpus_id === null) {
      refetchCorpuses();
    } else {
      fetchMetadata({ variables: { metadataForCorpusId: opened_corpus_id } });
    }
  }, [opened_corpus_id]);

  useEffect(() => {
    console.log(
      "selected_metadata_id_to_filter_on changed",
      selected_metadata_id_to_filter_on
    );
    refetch_documents();
  }, [selected_metadata_id_to_filter_on]);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Query to shape item data
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const corpus_data = corpus_response?.corpuses?.edges
    ? corpus_response.corpuses.edges
    : [];
  const corpus_items = corpus_data
    .map((edge) => (edge ? edge.node : undefined))
    .filter((item): item is CorpusType => !!item);

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

  const [removeDocumentsFromCorpus, {}] = useMutation<
    RemoveDocumentsFromCorpusOutputs,
    RemoveDocumentsFromCorpusInputs
  >(REMOVE_DOCUMENTS_FROM_CORPUS, {
    onCompleted: () => {
      fetchDocumentsLazily();
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

  // TODO - Improve typing.
  const handleUpdateCorpus = (corpus_obj: any) => {
    // console.log("handleUpdateCorpus", corpus_obj);
    let variables = {
      variables: corpus_obj,
    };
    // console.log("handleUpdateCorpus variables", variables);
    tryMutateCorpus(variables);
  };

  // TODO - Improve typing.
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

  // TODO - Improve typing.
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
        icon: "plus",
        title: "Create Corpus",
        key: `Corpus_action_${0}`,
        color: "blue",
        action_function: () => setShowNewCorpusModal(true),
      },
    ];

    // Currently the import capability is enabled via an env variable in case we want it disabled
    // (which we'll probably do for the public demo to cut down on attack surface and load on server)
    if (process.env.REACT_APP_ALLOW_IMPORTS) {
      corpus_actions.push({
        icon: "cloud upload",
        title: "Import Corpus",
        key: `Corpus_action_${1}`,
        color: "green",
        action_function: () => corpusUploadRef.current.click(),
      });
    }
  }

  let contract_actions: DropdownActionProps[] = [];
  if (selected_document_ids.length > 0 && auth_token) {
    contract_actions.push({
      icon: "remove circle",
      title: "Remove Contract(s)",
      key: `Corpus_action_${corpus_actions.length}`,
      color: "blue",
      action_function: () => setShowMultiDeleteConfirm(true),
    });
  }

  // Actions for analyzer pane (if user is signed in)
  let analyses_actions: DropdownActionProps[] = [];
  if (auth_token) {
    analyses_actions.push({
      icon: "factory",
      title: "Start New Analysis",
      key: `Analysis_action_${analyses_actions.length}`,
      color: "blue",
      action_function: () => showAnalyzerSelectionForCorpus(opened_corpus),
    });
  }

  let panes = [
    {
      menuItem: {
        key: "documents",
        icon: "file text",
        content: use_mobile_layout ? "" : "Documents",
      },
      render: () => (
        <Tab.Pane>
          <CorpusDocumentCards opened_corpus_id={opened_corpus_id} />
        </Tab.Pane>
      ),
    },
    {
      menuItem: {
        key: "annotations",
        icon: "rocketchat",
        content: use_mobile_layout ? "" : "Annotations",
      },
      render: () => (
        <Tab.Pane>
          <CorpusAnnotationCards opened_corpus_id={opened_corpus_id} />
        </Tab.Pane>
      ),
    },
    {
      menuItem: {
        key: "analyses",
        icon: "factory",
        content: use_mobile_layout ? "" : "Analyses",
      },
      render: () => (
        <Tab.Pane>
          <CorpusAnalysesCards />
        </Tab.Pane>
      ),
    },
  ];
  if (opened_corpus_id) {
    panes = [
      {
        menuItem: {
          key: "query",
          icon: "search",
          content: use_mobile_layout ? "" : "Query",
        },
        render: () => (
          <Tab.Pane>
            <NewQuerySearch corpus_id={opened_corpus_id} />
            {/* <CorpusQueryList opened_corpus_id={opened_corpus_id}/> */}
          </Tab.Pane>
        ),
      },
    ].concat(panes);
  }

  let content = <></>;

  // These else if statements should really be broken into separate components.
  //console.log(`Opened_corpus`, opened_corpus, 'opened_document', opened_document);

  if (
    (opened_corpus === null || opened_corpus === undefined) &&
    (opened_document === null || opened_document === undefined)
  ) {
    // console.log("Set content to CorpusCards");
    content = (
      <CorpusCards
        items={corpus_items}
        pageInfo={corpus_response?.corpuses?.pageInfo}
        loading={
          loading_corpuses ||
          delete_corpus_loading ||
          update_corpus_loading ||
          create_corpus_loading
        }
        loading_message="Loading Corpuses..."
        fetchMore={fetchMoreCorpuses}
      />
    );
  } else if (
    (opened_corpus !== null || opened_corpus !== undefined) &&
    (opened_document === null || opened_document === undefined)
  ) {
    // console.log("Set content to tab");
    content = (
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
          height: "100%",
          ...(use_mobile_layout
            ? {
                marginLeft: "5px",
                marginRight: "5px",
              }
            : {
                marginLeft: "1rem",
                marginRight: "1rem",
              }),
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
    );
  } else if (
    opened_corpus !== null &&
    opened_corpus !== undefined &&
    opened_document !== null &&
    opened_document !== undefined
  ) {
    // console.log("Reset Annotator ref");
    content = (
      <Annotator
        open={Boolean(opened_document)}
        onClose={() => {
          openedDocument(null);
          selectedAnalysesIds([]);
          selectedAnalyses([]);
        }}
        opened_document={opened_document}
        opened_corpus={opened_corpus}
        read_only={selected_analyes.length > 0 || banish_sidebar}
        scroll_to_annotation_on_open={opened_to_annotation}
        show_selected_annotation_only={show_selected_annotation_only}
        show_annotation_bounding_boxes={show_annotation_bounding_boxes}
        show_annotation_labels={show_annotation_labels}
      />
    );
  }

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
          {exporting_corpus ? (
            <SelectExportTypeModal visible={Boolean(exportingCorpus)} />
          ) : (
            <></>
          )}
          {corpus_to_analyze !== null ? (
            <SelectAnalyzerModal
              corpus={corpus_to_analyze}
              toggleModal={() => showAnalyzerSelectionForCorpus(null)}
              open={corpus_to_analyze !== null}
            />
          ) : (
            <></>
          )}

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
                <>
                  <FilterToMetadataSelector
                    selected_corpus_id={opened_corpus.id}
                  />
                  <FilterToLabelSelector
                    only_labels_for_labelset_id={
                      opened_corpus.labelSet?.id
                        ? opened_corpus.labelSet.id
                        : ""
                    }
                    label_type={LabelType.DocTypeLabel}
                  />
                </>
              ) : (
                <></>
              )
            }
          />
        ) : active_tab == 1 ? (
          <CreateAndSearchBar
            onChange={handleAnnotationSearchChange}
            actions={[]}
            placeholder="Search for annotated text in corpus..."
            value={annotationSearchCache}
            filters={
              opened_corpus ? (
                <>
                  <FilterToAnalysesSelector corpus={opened_corpus} />
                  <FilterToLabelSelector
                    only_labels_for_labelset_id={
                      opened_corpus.labelSet?.id
                        ? opened_corpus.labelSet.id
                        : ""
                    }
                    label_type={LabelType.TokenLabel}
                  />
                </>
              ) : (
                <></>
              )
            }
          />
        ) : (
          <CreateAndSearchBar
            onChange={handleAnalysisSearchChange}
            actions={analyses_actions}
            placeholder="Search for analyses..."
            value={analysesSearchCache}
            filters={<FilterToAnalysesSelector corpus={opened_corpus} />}
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
      {content}
    </CardLayout>
  );
};
