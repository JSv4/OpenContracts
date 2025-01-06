import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useReactiveVar } from "@apollo/client";
import { useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import _ from "lodash";

import {
  RequestDeleteExtractOutputType,
  RequestDeleteExtractInputType,
  REQUEST_DELETE_EXTRACT,
} from "../graphql/mutations";
import {
  GetExtractsOutput,
  GetExtractsInput,
  GET_EXTRACTS,
} from "../graphql/queries";
import {
  authToken,
  openedExtract,
  selectedExtractIds,
  showDeleteExtractModal,
  showCreateExtractModal,
  extractSearchTerm,
} from "../graphql/cache";

import { ActionDropdownItem } from "../components/types";
import { CardLayout } from "../components/layout/CardLayout";
import { ExtractType } from "../types/graphql-api";
import { ConfirmModal } from "../components/widgets/modals/ConfirmModal";
import { ExtractList } from "../components/extracts/list/ExtractList";
import { CreateAndSearchBar } from "../components/layout/CreateAndSearchBar";
import { CreateExtractModal } from "../components/widgets/modals/CreateExtractModal";

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    gap: "1rem",
    padding: "1rem",
    backgroundColor: "#f8fafc",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.5rem 0",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 600,
    color: "#1a202c",
  },
  content: {
    flex: 1,
    borderRadius: "12px",
    backgroundColor: "#ffffff",
    boxShadow:
      "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)",
    overflow: "hidden",
  },
};

export const Extracts = () => {
  const auth_token = useReactiveVar(authToken);
  const extract_search_term = useReactiveVar(extractSearchTerm);
  const selected_extract_ids = useReactiveVar(selectedExtractIds);
  const show_create_extract_modal = useReactiveVar(showCreateExtractModal);
  const show_delete_extract_modal = useReactiveVar(showDeleteExtractModal);

  const [extractSearchCache, setExtractSearchCache] =
    useState<string>(extract_search_term);

  const location = useLocation();

  const debouncedExportSearch = useRef(
    _.debounce((searchTerm) => {
      extractSearchTerm(searchTerm);
    }, 1000)
  );

  const handleExtractSearchChange = (value: string) => {
    setExtractSearchCache(value);
    debouncedExportSearch.current(value);
  };

  const {
    refetch: refetchExtracts,
    loading: extracts_loading,
    error: extracts_error,
    data: extracts_data,
    fetchMore: fetchMoreExtracts,
  } = useQuery<GetExtractsOutput, GetExtractsInput>(GET_EXTRACTS, {
    variables: {
      searchText: extract_search_term,
    },
    nextFetchPolicy: "network-only",
    notifyOnNetworkStatusChange: true,
  });

  useEffect(() => {
    refetchExtracts({ searchText: extract_search_term });
  }, [extract_search_term]);

  // If we just logged in, refetch extracts in case there are extracts that are not public and are only visible to current user
  useEffect(() => {
    if (auth_token) {
      refetchExtracts();
    }
  }, [auth_token]);

  // If we navigated here, refetch documents to ensure we have fresh docs
  useEffect(() => {
    refetchExtracts();
  }, [location]);

  const [tryDeleteExtract] = useMutation<
    RequestDeleteExtractOutputType,
    RequestDeleteExtractInputType
  >(REQUEST_DELETE_EXTRACT, {
    onCompleted: () => {
      selectedExtractIds([]);
      refetchExtracts();
    },
  });

  const handleDeleteExtract = (
    id: string,
    callback?: (args?: any) => void | any
  ) => {
    tryDeleteExtract({ variables: { id } })
      .then(() => {
        toast.success("Extract deleted successfully");
        if (callback) {
          callback();
        }
      })
      .catch((err) => {
        toast.error("Failed to delete extract");
        if (callback) {
          callback();
        }
      });
  };

  // Build the actions for the search / context bar dropdown menu
  let extract_actions: ActionDropdownItem[] = [];

  if (auth_token) {
    extract_actions.push({
      key: "extracts_action_dropdown_0",
      title: "Create Extract",
      icon: "plus",
      color: "blue",
      action_function: () => showCreateExtractModal(!show_create_extract_modal),
    });
  }

  const extract_nodes = extracts_data?.extracts?.edges
    ? extracts_data.extracts.edges
    : [];
  const extract_items = extract_nodes
    .map((edge) => (edge?.node ? edge.node : undefined))
    .filter((item): item is ExtractType => !!item);

  if (extracts_error) {
    toast.error("Failed to load extracts");
  }

  return (
    <CardLayout
      Modals={
        <>
          <ConfirmModal
            message={`Are you sure you want to delete this extract?`}
            yesAction={
              selected_extract_ids.length > 0
                ? async () => {
                    for (const id of selected_extract_ids) {
                      handleDeleteExtract(id);
                    }
                    showDeleteExtractModal(false);
                    selectedExtractIds([]);
                  }
                : () => {}
            }
            noAction={() => showDeleteExtractModal(false)}
            toggleModal={() => showDeleteExtractModal(false)}
            visible={show_delete_extract_modal}
          />
          <CreateExtractModal
            open={show_create_extract_modal}
            onClose={() => {
              showCreateExtractModal(false);
              refetchExtracts();
            }}
          />
        </>
      }
      SearchBar={
        <CreateAndSearchBar
          value={extractSearchCache}
          onChange={(search_string: string) =>
            handleExtractSearchChange(search_string)
          }
          actions={extract_actions}
          placeholder="Search for extract by name..."
        />
      }
    >
      <ExtractList
        selectedId={selected_extract_ids[0]}
        items={extract_items}
        pageInfo={extracts_data?.extracts?.pageInfo}
        loading={extracts_loading}
        fetchMore={fetchMoreExtracts}
        onDelete={handleDeleteExtract}
        onSelectRow={(it: ExtractType) => openedExtract(it)}
      />
    </CardLayout>
  );
};
