import { useEffect } from "react";
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
  GET_DOCUMENTS,
  GetExtractsOutput,
  GetExtractsInput,
} from "../graphql/queries";
import {
  authToken,
  openedExtract,
  selectedExtractId,
  showDeleteExtractModal,
  showEditExtractModal,
} from "../graphql/cache";

import { ActionDropdownItem, LooseObject } from "../components/types";
import { CardLayout } from "../components/layout/CardLayout";
import { ExtractType } from "../graphql/types";
import { ConfirmModal } from "../components/widgets/modals/ConfirmModal";
import { ExtractList } from "../extracts/list/ExtractList";

export const Documents = () => {
  const auth_token = useReactiveVar(authToken);
  const opened_extract = useReactiveVar(openedExtract);
  const selected_extract_id = useReactiveVar(selectedExtractId);
  const show_edit_extract_modal = useReactiveVar(showEditExtractModal);
  const show_delete_extract_modal = useReactiveVar(showDeleteExtractModal);

  const location = useLocation();

  let extract_variables: LooseObject = {
    includeMetadata: true,
  };

  const {
    refetch: refetchExtracts,
    loading: extracts_loading,
    error: extracts_error,
    data: extracts_data,
    fetchMore: fetchMoreExtracts,
  } = useQuery<GetExtractsOutput, GetExtractsInput>(GET_DOCUMENTS, {
    variables: extract_variables,
    nextFetchPolicy: "network-only",
    notifyOnNetworkStatusChange: true, // required to get loading signal on fetchMore
  });

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
    // document_actions.push({
    //   key: "documents_action_dropdown_0",
    //   title: "Import",
    //   icon: "cloud upload",
    //   color: "blue",
    //   action_function: () =>
    //     showUploadNewDocumentsModal(!show_upload_new_documents_modal),
    // });
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
        </>
      }
      SearchBar={<span>Hold For Stuff</span>}
    >
      <ExtractList
        items={extract_items}
        pageInfo={extracts_data?.extracts?.pageInfo}
        loading={extracts_loading}
        fetchMore={fetchMoreExtracts}
        onDelete={handleDeleteExtract}
      />
    </CardLayout>
  );
};
