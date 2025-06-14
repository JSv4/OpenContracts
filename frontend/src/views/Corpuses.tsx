import { useState, useRef, useEffect } from "react";
import { Button, Tab, Menu } from "semantic-ui-react";
import _ from "lodash";
import { toast } from "react-toastify";
import {
  ApolloError,
  useLazyQuery,
  useMutation,
  useQuery,
  useReactiveVar,
} from "@apollo/client";
import { useLocation } from "react-router-dom";
import {
  FileText,
  MessageSquare,
  Table,
  Factory,
  Brain,
  Settings,
  Home,
  ArrowLeft,
} from "lucide-react";
import styled from "styled-components";

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
import { EmbedderSelector } from "../components/widgets/CRUD/EmbedderSelector";
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
  selectedMetaAnnotationId,
  filterToLabelId,
  analysisSearchTerm,
  exportingCorpus,
  showQueryViewState,
  openedQueryObj,
  showSelectCorpusAnalyzerOrFieldsetModal,
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
import { CorpusType, LabelType } from "../types/graphql-api";
import { LooseObject, PermissionTypes } from "../components/types";
import { toBase64 } from "../utils/files";
import { FilterToLabelSelector } from "../components/widgets/model-filters/FilterToLabelSelector";
import { CorpusAnnotationCards } from "../components/annotations/CorpusAnnotationCards";
import { CorpusDocumentCards } from "../components/documents/CorpusDocumentCards";
import { CorpusAnalysesCards } from "../components/analyses/CorpusAnalysesCards";
import { FilterToAnalysesSelector } from "../components/widgets/model-filters/FilterToAnalysesSelector";
import useWindowDimensions from "../components/hooks/WindowDimensionHook";
import { SelectExportTypeModal } from "../components/widgets/modals/SelectExportTypeModal";
import { ViewQueryResultsModal } from "../components/widgets/modals/ViewQueryResultsModal";
import { FilterToCorpusActionOutputs } from "../components/widgets/model-filters/FilterToCorpusActionOutputs";
import { CorpusExtractCards } from "../components/extracts/CorpusExtractCards";
import { getPermissions } from "../utils/transform";
import { MOBILE_VIEW_BREAKPOINT } from "../assets/configurations/constants";
import { CorpusDashboard } from "../components/corpuses/CorpusDashboard";
import { useCorpusState } from "../components/annotator/context/CorpusAtom";
import { CorpusSettings } from "../components/corpuses/CorpusSettings";
import { CorpusChat } from "../components/corpuses/CorpusChat";
import { CorpusHome } from "../components/corpuses/CorpusHome";
import { CorpusDescriptionEditor } from "../components/corpuses/CorpusDescriptionEditor";

const MobileTabMenu = styled(Menu)`
  &.ui.menu {
    border: none;
    box-shadow: none;
    background: transparent;
    margin-bottom: 0;

    .item {
      flex: 1;
      justify-content: center;
      padding: 1rem 0.5rem;
      min-height: 4rem;
      border: none;
      background: transparent;
      position: relative;

      &::after {
        content: "";
        position: absolute;
        bottom: 0;
        left: 10%;
        right: 10%;
        height: 3px;
        background: transparent;
        border-radius: 3px;
        transition: all 0.2s ease;
      }

      &.active {
        color: #4a90e2;
        font-weight: 500;

        &::after {
          background: #4a90e2;
        }

        svg {
          stroke-width: 2.5;
          transform: translateY(-2px);
        }
      }

      svg {
        width: 24px;
        height: 24px;
        stroke-width: 2;
        transition: all 0.2s ease;
        margin: 0;
      }
    }
  }
`;

const TabIcon = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;

  span {
    font-size: 0.75rem;
    font-weight: 500;
    opacity: 0.8;
    white-space: nowrap;
    color: inherit;
  }
`;

// First add a styled container for the tab layout
const TabContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  overflow: hidden;

  .ui.menu {
    flex-shrink: 0; /* Prevent menu from shrinking */
    margin-bottom: 0;
    padding: 0.5rem 0.5rem 0;
    border-bottom: 1px solid #e2e8f0;
  }

  .tab-content {
    flex: 1; /* Take remaining space */
    overflow: hidden; /* Create new stacking context */
    position: relative; /* For absolute children if any */
    display: flex;
    flex-direction: column;

    .ui.tab {
      height: 100%;
      overflow-y: auto;
    }
  }
`;

// Add these styled components near your other styled components
const DashboardContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
  padding: 0;
  max-width: 1200px;
  margin: 0 auto;
  justify-content: center;
`;

// TODO - need to drop this padding
const ContentWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  flex: 1;
  padding: ${({ theme }) =>
    theme.width <= MOBILE_VIEW_BREAKPOINT ? "2rem 1rem" : "0"};
  height: 100%;
`;

const ChatTransitionContainer = styled.div<{
  isExpanded: boolean;
  isSearchTransform?: boolean;
}>`
  display: flex;
  flex-direction: column;
  height: ${(props) =>
    props.isSearchTransform ? (props.isExpanded ? "100%" : "56px") : "100%"};
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  background: white;
  border-radius: ${(props) => (props.isExpanded ? "0" : "12px")};
  box-shadow: ${(props) =>
    props.isExpanded ? "none" : "0 4px 12px rgba(0,0,0,0.1)"};
  overflow: hidden;
  position: relative;
  z-index: ${(props) => (props.isExpanded ? "10" : "1")};
`;

const SearchToConversationInput = styled.div<{ isExpanded: boolean }>`
  display: flex;
  align-items: center;
  padding: ${(props) => (props.isExpanded ? "1rem" : "0.75rem 1rem")};
  border-bottom: ${(props) =>
    props.isExpanded ? "1px solid #e2e8f0" : "none"};
  background: ${(props) => (props.isExpanded ? "white" : "transparent")};

  input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 1rem;
    background: transparent;

    &::placeholder {
      color: #a0aec0;
    }
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .nav-button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #4a5568;
    font-weight: 500;
    background: transparent;
    border: none;
    padding: 0.5rem;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(0, 0, 0, 0.03);
    }

    .button-text {
      @media (max-width: 768px) {
        display: none;
      }
    }
  }
`;

const ConversationContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  flex: 1;
  overflow: hidden; /* Important: prevent double scrollbars */
  position: relative;

  /* This ensures the chat content scrolls but input stays fixed */
  .chat-messages-area {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    padding-bottom: 80px; /* Add padding to prevent content from being hidden behind input */
  }

  .chat-input-area {
    position: sticky;
    bottom: 0;
    left: 0;
    right: 0;
    background: white;
    padding: 1rem;
    border-top: 1px solid rgba(0, 0, 0, 0.1);
    z-index: 10;
  }
`;

const DashboardActionBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #e2e8f0;
`;

const ChatEntryPoint = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 8px;
  margin: 1rem;

  &:hover {
    background: #f7fafc;
  }

  h3 {
    margin-top: 1rem;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }

  p {
    color: #718096;
    max-width: 400px;
  }
`;

const RecentChatsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  padding: 1rem;
`;

const RecentChatCard = styled.div`
  flex: 1;
  min-width: 250px;
  max-width: 350px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: #4a90e2;
    box-shadow: 0 2px 8px rgba(74, 144, 226, 0.1);
  }

  h4 {
    margin-top: 0;
    margin-bottom: 0.5rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  p {
    color: #718096;
    font-size: 0.875rem;
    margin: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .timestamp {
    font-size: 0.75rem;
    color: #a0aec0;
    margin-top: 0.5rem;
  }
`;

// Create a component for the corpus query view with the new search-to-chat functionality
const CorpusQueryView = ({
  opened_corpus,
  opened_corpus_id,
  setShowDescriptionEditor,
}: {
  opened_corpus: CorpusType | null;
  opened_corpus_id: string | null;
  setShowDescriptionEditor: (show: boolean) => void;
}) => {
  const [chatExpanded, setChatExpanded] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearchMode, setIsSearchMode] = useState<boolean>(true);
  const show_query_view_state = useReactiveVar(showQueryViewState);
  const inputRef = useRef<HTMLInputElement>(null);
  const { width } = useWindowDimensions();
  const isDesktop = width > MOBILE_VIEW_BREAKPOINT;

  // Focus the input when component mounts or when returning to search mode
  useEffect(() => {
    if (isSearchMode && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isSearchMode]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setChatExpanded(true);
      setIsSearchMode(false);
      // Ensure we stay in ASK mode rather than switching to VIEW
      showQueryViewState("ASK");
    }
  };

  const resetToSearch = () => {
    setChatExpanded(false);
    setIsSearchMode(true);
    setSearchQuery("");
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 100);
  };

  const openHistoryView = () => {
    showQueryViewState("VIEW");
  };

  if (!opened_corpus) {
    return <div>No corpus selected</div>;
  }

  // Render the navigation header consistently across all states
  const renderNavigationHeader = () => {
    if (chatExpanded || show_query_view_state === "VIEW") {
      return (
        <SearchToConversationInput
          isExpanded={true}
          style={{ borderBottom: "1px solid #e2e8f0" }}
        >
          <Button
            as="div"
            className="nav-button"
            onClick={
              show_query_view_state === "VIEW"
                ? () => showQueryViewState("ASK")
                : resetToSearch
            }
          >
            <ArrowLeft size={16} />
            <span className="button-text">
              {show_query_view_state === "VIEW" ? "Back to Dashboard" : "Back"}
            </span>
          </Button>

          <div style={{ flex: 1, textAlign: "center", fontWeight: 500 }}>
            {show_query_view_state === "VIEW" ? "Conversation History" : "Chat"}
          </div>

          <div className="actions">
            {show_query_view_state !== "VIEW" && (
              <Button
                icon="list"
                basic
                circular
                size="small"
                onClick={openHistoryView}
                title="View conversation history"
              />
            )}
            <Button
              as="div"
              basic
              circular
              size="small"
              onClick={() => showQueryViewState("ASK")}
              title="Return to Dashboard"
            >
              <Home size={16} />
            </Button>
          </div>
        </SearchToConversationInput>
      );
    } else {
      // Search input for dashboard view
      return (
        <form onSubmit={handleSearchSubmit}>
          <SearchToConversationInput isExpanded={false}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Ask a question about this corpus..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchQuery.trim()) {
                  e.preventDefault();
                  setChatExpanded(true);
                  setIsSearchMode(false);
                }
              }}
            />
            <div className="actions">
              <Button
                icon="history"
                basic
                circular
                size="small"
                onClick={openHistoryView}
                title="View conversation history"
              />
              <Button
                icon="search"
                primary
                circular
                size="small"
                type="submit"
              />
            </div>
          </SearchToConversationInput>
        </form>
      );
    }
  };

  if (show_query_view_state === "ASK") {
    return (
      <DashboardContainer>
        <ContentWrapper id="corpus-dashboard-content-wrapper">
          {!chatExpanded && (
            <CorpusHome
              corpus={opened_corpus as CorpusType}
              onEditDescription={() => setShowDescriptionEditor(true)}
            />
          )}

          <ChatTransitionContainer
            isExpanded={chatExpanded}
            isSearchTransform={true}
            style={{
              position: chatExpanded ? "relative" : "relative",
              maxWidth: chatExpanded ? "100%" : "100%",
              width: chatExpanded ? "100%" : isDesktop ? "600px" : "100%",
              margin: "0 auto",
              marginTop: !chatExpanded ? "1.5rem" : "0",
              boxShadow: chatExpanded ? "none" : "0 4px 20px rgba(0,0,0,0.15)",
              transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
              height: chatExpanded ? "100%" : "auto",
              display: chatExpanded ? "flex" : "none",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {renderNavigationHeader()}

            {chatExpanded && !isSearchMode && (
              <ConversationContainer>
                <CorpusChat
                  corpusId={opened_corpus.id}
                  showLoad={false}
                  initialQuery={searchQuery}
                  setShowLoad={() => {}}
                  onMessageSelect={() => {}}
                  forceNewChat={true}
                />
              </ConversationContainer>
            )}
          </ChatTransitionContainer>
        </ContentWrapper>
      </DashboardContainer>
    );
  } else {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        {renderNavigationHeader()}

        <div style={{ flex: 1, overflow: "hidden" }}>
          <CorpusChat
            corpusId={opened_corpus.id}
            showLoad={true}
            setShowLoad={() => {}}
            onMessageSelect={() => {}}
          />
        </div>
      </div>
    );
  }
};

export const Corpuses = () => {
  const { width } = useWindowDimensions();
  const use_mobile_layout = width <= MOBILE_VIEW_BREAKPOINT;

  const show_remove_docs_from_corpus_modal = useReactiveVar(
    showRemoveDocsFromCorpusModal
  );
  const selected_metadata_id_to_filter_on = useReactiveVar(
    selectedMetaAnnotationId
  );

  const { setCorpus } = useCorpusState();
  const selected_document_ids = useReactiveVar(selectedDocumentIds);
  const document_search_term = useReactiveVar(documentSearchTerm);
  const corpus_search_term = useReactiveVar(corpusSearchTerm);
  const analysis_search_term = useReactiveVar(analysisSearchTerm);
  const deleting_corpus = useReactiveVar(deletingCorpus);
  const corpus_to_edit = useReactiveVar(editingCorpus);
  const corpus_to_view = useReactiveVar(viewingCorpus);
  const opened_corpus = useReactiveVar(openedCorpus);
  const exporting_corpus = useReactiveVar(exportingCorpus);
  const opened_document = useReactiveVar(openedDocument);
  const filter_to_label_id = useReactiveVar(filterToLabelId);

  const auth_token = useReactiveVar(authToken);
  const annotation_search_term = useReactiveVar(annotationContentSearchTerm);
  const show_query_view_state = useReactiveVar(showQueryViewState);
  const opened_query_obj = useReactiveVar(openedQueryObj);

  const location = useLocation();

  const corpusUploadRef = useRef() as React.MutableRefObject<HTMLInputElement>;

  const [show_multi_delete_confirm, setShowMultiDeleteConfirm] =
    useState<boolean>(false);
  const [show_new_corpus_modal, setShowNewCorpusModal] =
    useState<boolean>(false);
  const [active_tab, setActiveTab] = useState<number>(0);
  const [showDescriptionEditor, setShowDescriptionEditor] =
    useState<boolean>(false);

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
  let raw_permissions = opened_corpus?.myPermissions;
  if (opened_corpus && raw_permissions !== undefined) {
    raw_permissions = getPermissions(raw_permissions);
  }

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
    fetchPolicy: "network-only",
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
    showQueryViewState("ASK");
  }, [location]);

  useEffect(() => {
    console.log("Switched opened_corpus", opened_corpus);
    setCorpus({
      selectedCorpus: opened_corpus,
    });
    if (!opened_corpus || opened_corpus === null) {
      refetchCorpuses();
    } else {
      console.log("Fetch metdata for corpus id: ", opened_corpus_id);
      fetchMetadata({ variables: { metadataForCorpusId: opened_corpus.id } });
    }
  }, [opened_corpus]);

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
    .map((edge) => {
      if (!edge || !edge.node) return undefined;

      // Create a copy of the node
      const node = { ...edge.node };

      // Convert myPermissions from string[] to PermissionTypes[] if it exists
      if (node.myPermissions) {
        node.myPermissions = getPermissions(node.myPermissions);
      }

      return node;
    })
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
    tryMutateCorpus({ variables: corpus_obj });
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
    if (import.meta.env.REACT_APP_ALLOW_IMPORTS && auth_token) {
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
  if (
    auth_token &&
    raw_permissions?.includes(PermissionTypes.CAN_UPDATE) &&
    raw_permissions?.includes(PermissionTypes.CAN_READ)
  ) {
    corpus_actions.push({
      icon: "factory",
      title: "Start New Analysis",
      key: `Analysis_action_${corpus_actions.length}`,
      color: "blue",
      action_function: () => showSelectCorpusAnalyzerOrFieldsetModal(true),
    });
  }

  let panes = [
    {
      menuItem: {
        key: "home",
        content: use_mobile_layout ? (
          <TabIcon>
            <Brain />
            <span>Home</span>
          </TabIcon>
        ) : (
          "Home"
        ),
      },
      render: () => (
        <Tab.Pane
          style={{
            height: "100%",
            overflow: "hidden",
            padding: use_mobile_layout ? "0.25rem 0" : undefined,
          }}
        >
          <CorpusQueryView
            opened_corpus={opened_corpus}
            opened_corpus_id={opened_corpus_id}
            setShowDescriptionEditor={setShowDescriptionEditor}
          />
        </Tab.Pane>
      ),
    },
    {
      menuItem: {
        key: "documents",
        content: use_mobile_layout ? (
          <TabIcon>
            <FileText />
            <span>Docs</span>
          </TabIcon>
        ) : (
          "Documents"
        ),
      },
      render: () => (
        <Tab.Pane style={{ overflowY: "scroll" }} id="CorpusesTabDiv">
          <CorpusDocumentCards opened_corpus_id={opened_corpus_id} />
        </Tab.Pane>
      ),
    },
    {
      menuItem: {
        key: "annotations",
        content: use_mobile_layout ? (
          <TabIcon>
            <MessageSquare />
            <span>Notes</span>
          </TabIcon>
        ) : (
          "Annotations"
        ),
      },
      render: () => (
        <Tab.Pane style={{ overflowY: "scroll" }}>
          <CorpusAnnotationCards opened_corpus_id={opened_corpus_id} />
        </Tab.Pane>
      ),
    },
    {
      menuItem: {
        key: "analyses",
        content: use_mobile_layout ? (
          <TabIcon>
            <Factory />
            <span>Analyze</span>
          </TabIcon>
        ) : (
          "Analyses"
        ),
      },
      render: () => (
        <Tab.Pane style={{ overflowY: "scroll" }}>
          <CorpusAnalysesCards />
        </Tab.Pane>
      ),
    },
    {
      menuItem: {
        key: "extracts",
        content: use_mobile_layout ? (
          <TabIcon>
            <Table />
            <span>Extract</span>
          </TabIcon>
        ) : (
          "Extracts"
        ),
      },
      render: () => (
        <Tab.Pane style={{ overflowY: "scroll" }}>
          <CorpusExtractCards />
        </Tab.Pane>
      ),
    },
    ...(opened_corpus &&
    getPermissions(opened_corpus.myPermissions || []).includes(
      PermissionTypes.CAN_UPDATE
    )
      ? [
          {
            menuItem: {
              key: "settings",
              content: use_mobile_layout ? (
                <TabIcon>
                  <Settings />
                  <span>Settings</span>
                </TabIcon>
              ) : (
                "Settings"
              ),
            },
            render: () => (
              <Tab.Pane style={{ overflowY: "scroll" }}>
                {opened_corpus?.title && (
                  <CorpusSettings
                    corpus={{
                      id: opened_corpus.id,
                      title: opened_corpus.title,
                      description: opened_corpus.description || "",
                      allowComments: opened_corpus.allowComments || false,
                      preferredEmbedder: opened_corpus.preferredEmbedder,
                      creator: opened_corpus.creator,
                      created: opened_corpus.created,
                      modified: opened_corpus.modified,
                      isPublic: opened_corpus.isPublic,
                    }}
                  />
                )}
              </Tab.Pane>
            ),
          },
        ]
      : []),
  ];

  let content = <></>;
  // TODO - move <Annotator/> to root of <App>
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
        className="CorpusesTabDiv"
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
          height: "100%",
          flex: 1,
          overflow: "hidden",
        }}
      >
        <TabContainer>
          <Tab
            id="SelectedCorpusTabDiv"
            menu={{
              secondary: true,
              pointing: true,
              as: use_mobile_layout ? MobileTabMenu : undefined,
            }}
            attached={false}
            activeIndex={active_tab}
            onTabChange={(e, { activeIndex }) =>
              setActiveTab(activeIndex ? Number(activeIndex) : 0)
            }
            panes={panes}
            className="tab-content"
          />
        </TabContainer>
      </div>
    );
  } else if (
    opened_corpus !== null &&
    opened_corpus !== undefined &&
    opened_document !== null &&
    opened_document !== undefined
  ) {
    console.log("Show annotator");
    content = <></>;
  }

  return (
    <CardLayout
      Modals={
        <>
          {opened_corpus && showDescriptionEditor && (
            <CorpusDescriptionEditor
              corpusId={opened_corpus.id}
              isOpen={showDescriptionEditor}
              onClose={() => setShowDescriptionEditor(false)}
              onUpdate={() => {
                refetchMetadata();
                setShowDescriptionEditor(false);
              }}
            />
          )}
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
            oldInstance={corpus_to_edit ? corpus_to_edit : {}}
            modelName="corpus"
            uiSchema={editCorpusForm_Ui_Schema}
            dataSchema={editCorpusForm_Schema}
            onSubmit={handleUpdateCorpus}
            onClose={() => editingCorpus(null)}
            hasFile={true}
            fileField={"icon"}
            fileLabel="Corpus Icon"
            fileIsImage={true}
            acceptedFileTypes="image/*"
            propertyWidgets={{
              labelSet: <LabelSetSelector />,
              preferredEmbedder: <EmbedderSelector />,
            }}
          />
          {exporting_corpus ? (
            <SelectExportTypeModal visible={Boolean(exportingCorpus)} />
          ) : (
            <></>
          )}
          {opened_query_obj ? (
            <ViewQueryResultsModal
              query_id={opened_query_obj.id}
              open={true}
              onClose={() => openedQueryObj(null)}
            />
          ) : (
            <></>
          )}
          {corpus_to_view !== null ? (
            <CRUDModal
              open={corpus_to_view !== null}
              mode="VIEW"
              oldInstance={corpus_to_view ? corpus_to_view : {}}
              modelName="corpus"
              uiSchema={editCorpusForm_Ui_Schema}
              dataSchema={editCorpusForm_Schema}
              onClose={() => viewingCorpus(null)}
              hasFile={true}
              fileField={"icon"}
              fileLabel="Corpus Icon"
              fileIsImage={true}
              acceptedFileTypes="image/*"
              propertyWidgets={{
                labelSet: <LabelSetSelector read_only={true} />,
                preferredEmbedder: <EmbedderSelector read_only={true} />,
              }}
            />
          ) : (
            <></>
          )}

          {show_new_corpus_modal ? (
            <CRUDModal
              open={show_new_corpus_modal}
              mode="CREATE"
              oldInstance={{ shared_with: [], is_public: false }}
              modelName="corpus"
              uiSchema={newCorpusForm_Ui_Schema}
              dataSchema={newCorpusForm_Schema}
              onSubmit={handleCreateNewCorpus}
              onClose={() => setShowNewCorpusModal(!show_new_corpus_modal)}
              hasFile={true}
              fileField={"icon"}
              fileLabel="Corpus Icon"
              fileIsImage={true}
              acceptedFileTypes="image/*"
              propertyWidgets={{
                labelSet: <LabelSetSelector />,
                preferredEmbedder: <EmbedderSelector />,
              }}
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
                  {/* <FilterToMetadataSelector
                    selected_corpus_id={opened_corpus.id}
                  /> Temporarily disabled - not working and not really in-use*/}
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
            actions={corpus_actions}
            placeholder="Search for annotated text in corpus..."
            value={annotationSearchCache}
            filters={
              opened_corpus ? (
                <>
                  <FilterToCorpusActionOutputs />
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
            actions={corpus_actions}
            placeholder="Search for analyses..."
            value={analysesSearchCache}
            filters={
              <>
                <FilterToCorpusActionOutputs />
                <FilterToAnalysesSelector corpus={opened_corpus} />
              </>
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
      {content}
    </CardLayout>
  );
};
