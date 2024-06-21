import { useEffect, useState } from "react";
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
  REQUEST_GET_EXTRACTS,
} from "../graphql/queries";
import {
  authToken,
  openedExtract,
  selectedExtractId,
  showDeleteExtractModal,
  showCreateExtractModal,
} from "../graphql/cache";

import { ActionDropdownItem, LooseObject } from "../components/types";
import { CardLayout } from "../components/layout/CardLayout";
import { ExtractType } from "../graphql/types";
import { ConfirmModal } from "../components/widgets/modals/ConfirmModal";
import { ExtractList } from "../extracts/list/ExtractList";
import { CreateAndSearchBar } from "../components/layout/CreateAndSearchBar";
import { CreateExtractModal } from "../components/widgets/modals/CreateExtractModal";
import { EditExtractModal } from "../components/widgets/modals/EditExtractModal";

export const Extracts = () => {
  const auth_token = useReactiveVar(authToken);
  const opened_extract = useReactiveVar(openedExtract);
  const selected_extract_id = useReactiveVar(selectedExtractId);
  const show_create_extract_modal = useReactiveVar(showCreateExtractModal);
  const show_delete_extract_modal = useReactiveVar(showDeleteExtractModal);

  const location = useLocation();

  let extract_variables: LooseObject = {
    includeMetadata: true,
  };

  const shouldPoll = (extracts: GetExtractsOutput) => {
    return extracts?.extracts?.edges.reduce(
      (accum, edge) =>
        (edge.node.started && !edge.node.finished && !edge.node.error) || accum,
      false
    );
  };

  const {
    refetch: refetchExtracts,
    loading: extracts_loading,
    error: extracts_error,
    data: extracts_data,
    fetchMore: fetchMoreExtracts,
  } = useQuery<GetExtractsOutput, GetExtractsInput>(REQUEST_GET_EXTRACTS, {
    variables: extract_variables,
    nextFetchPolicy: "network-only",
  });

  useEffect(() => {
    if (extracts_data && shouldPoll(extracts_data)) {
      const pollInterval = setInterval(() => {
        refetchExtracts();
      }, 30000);

      return () => {
        clearInterval(pollInterval);
      };
    }
  }, [extracts_data, refetchExtracts]);

  const extract_nodes = extracts_data?.extracts?.edges
    ? extracts_data.extracts.edges
    : [];
  const extract_items = extract_nodes
    .map((edge) => (edge?.node ? edge.node : undefined))
    .filter((item): item is ExtractType => !!item);

  // If we just logged in, refetch extracts in case there are extracts that are not public and are only visible to current user
  useEffect(() => {
    if (auth_token) {
      console.log("DocumentItem - refetchExtracts due to auth_token");
      refetchExtracts();
    }
  }, [auth_token]);

  // If we navigated here, refetch documents to ensure we have fresh docs
  useEffect(() => {
    console.log("DocumentItem - refetchExtracts due to location change");
    refetchExtracts();
  }, [location]);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Implementing various resolvers / mutations to create action methods
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const [tryDeleteExtract] = useMutation<
    RequestDeleteExtractOutputType,
    RequestDeleteExtractInputType
  >(REQUEST_DELETE_EXTRACT, {
    onCompleted: () => {
      selectedExtractId(null);
      refetchExtracts();
    },
  });

  const handleDeleteExtract = (
    id: string,
    callback?: (args?: any) => void | any
  ) => {
    tryDeleteExtract({ variables: { id } })
      .then((data) => {
        toast.success("SUCCESS - Deleted Extract");
        if (callback) {
          callback();
        }
      })
      .catch((err) => {
        toast.error("ERROR - Could Not Delete Extract");
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
      title: "Create",
      icon: "plus",
      color: "blue",
      action_function: () => showCreateExtractModal(!show_create_extract_modal),
    });
  }

  return (
    <CardLayout
      Modals={
        <>
          <ConfirmModal
            message={`Are you sure you want to delete this extract?`}
            yesAction={
              selected_extract_id
                ? () =>
                    handleDeleteExtract(selected_extract_id, () =>
                      showDeleteExtractModal(false)
                    )
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
          <EditExtractModal
            ext={opened_extract}
            open={opened_extract !== null}
            toggleModal={() => openedExtract(null)}
          />
        </>
      }
      SearchBar={<CreateAndSearchBar actions={extract_actions} />}
    >
      <ExtractList
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
