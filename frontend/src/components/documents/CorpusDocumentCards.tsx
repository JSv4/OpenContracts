import { useEffect, useCallback, useState } from "react";
import _ from "lodash";
import { toast } from "react-toastify";
import { useMutation, useQuery, useReactiveVar } from "@apollo/client";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Icon, Popup, Segment } from "semantic-ui-react";
import styled from "styled-components";
import { navigateToDocument } from "../../utils/navigationUtils";

import { DocumentCards } from "../../components/documents/DocumentCards";
import { DocumentMetadataGrid } from "../../components/documents/DocumentMetadataGrid";

import {
  selectedDocumentIds,
  documentSearchTerm,
  authToken,
  filterToLabelId,
  selectedMetaAnnotationId,
  showUploadNewDocumentsModal,
  uploadModalPreloadedFiles,
  openedCorpus,
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
import { DocumentType } from "../../types/graphql-api";
import { FileUploadPackageProps } from "../widgets/modals/DocumentUploadModal";
import { openedDocument } from "../../graphql/cache";

const ViewToggleContainer = styled.div`
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 10;
`;

const ViewToggleButton = styled(Button)`
  &&& {
    background: white;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

    &:hover {
      background: #f8fafc;
    }
  }
`;

export const CorpusDocumentCards = ({
  opened_corpus_id,
}: {
  opened_corpus_id: string | null;
}) => {
  const [viewMode, setViewMode] = useState<"cards" | "grid">("cards");
  /**
   * Similar to AnnotationCorpusCards, this component wraps the DocumentCards component
   * (which is a pure rendering component) with some query logic for a given corpus_id.
   * If the corpus_id is passed in, it will query and display the documents for
   * that corpus and let you browse them.
   */

  const selected_document_ids = useReactiveVar(selectedDocumentIds);
  const document_search_term = useReactiveVar(documentSearchTerm);
  const selected_metadata_id_to_filter_on = useReactiveVar(
    selectedMetaAnnotationId
  );

  const auth_token = useReactiveVar(authToken);
  const filter_to_label_id = useReactiveVar(filterToLabelId);

  const location = useLocation();
  const navigate = useNavigate();

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
    // Use smart navigation utility to prefer slugs and prevent redirects
    const corpusData = opened_corpus_id ? openedCorpus() : null;
    navigateToDocument(
      document as any,
      corpusData as any,
      navigate,
      window.location.pathname
    );
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const filePackages: FileUploadPackageProps[] = acceptedFiles.map(
      (file) => ({
        file,
        formData: {
          title: file.name,
          description: `Content summary for ${file.name}`,
        },
      })
    );
    showUploadNewDocumentsModal(true);
    uploadModalPreloadedFiles(filePackages);
  }, []);

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
      <ViewToggleContainer>
        <Button.Group>
          <Popup
            content="Card View"
            trigger={
              <ViewToggleButton
                icon="grid layout"
                active={viewMode === "cards"}
                onClick={() => setViewMode("cards")}
                data-testid="card-view-button"
              />
            }
          />
          <Popup
            content="Metadata Grid View"
            trigger={
              <ViewToggleButton
                icon="table"
                active={viewMode === "grid"}
                onClick={() => setViewMode("grid")}
                data-testid="grid-view-button"
              />
            }
          />
        </Button.Group>
      </ViewToggleContainer>

      {viewMode === "cards" ? (
        <DocumentCards
          items={document_items}
          loading={documents_loading}
          loading_message="Documents Loading..."
          pageInfo={documents_response?.documents.pageInfo}
          style={{ minHeight: "70vh", overflowY: "" }}
          fetchMore={fetchMoreDocuments}
          onShiftClick={onSelect}
          onClick={onOpen}
          removeFromCorpus={
            opened_corpus_id ? handleRemoveContracts : undefined
          }
          onDrop={onDrop}
          corpusId={opened_corpus_id}
        />
      ) : (
        <DocumentMetadataGrid
          corpusId={opened_corpus_id || ""}
          documents={document_items}
          loading={documents_loading}
          onDocumentClick={onOpen}
          pageInfo={documents_response?.documents.pageInfo}
          fetchMore={fetchMoreDocuments}
          hasMore={documents_response?.documents.pageInfo?.hasNextPage ?? false}
        />
      )}
    </div>
  );
};
