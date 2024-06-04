import { useEffect } from "react";
import { useMutation, useQuery, useReactiveVar } from "@apollo/client";
import { useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import _ from "lodash";

import {
  RequestDeleteExtractOutputType,
  RequestDeleteExtractInputType,
  REQUEST_DELETE_EXTRACT,
  RequestCreateColumnInputType,
  REQUEST_CREATE_COLUMN,
  RequestCreateColumnOutputType,
} from "../graphql/mutations";
import {
  GET_DOCUMENTS,
  GetExtractsOutput,
  GetExtractsInput,
  REQUEST_GET_EXTRACTS,
} from "../graphql/queries";
import {
  authToken,
  openedExtract,
  selectedExtractId,
  showDeleteExtractModal,
  showEditExtractModal,
  showCreateExtractModal,
  addingColumnToExtract,
} from "../graphql/cache";

import { ActionDropdownItem, LooseObject } from "../components/types";
import { CardLayout } from "../components/layout/CardLayout";
import { ExtractType } from "../graphql/types";
import { ConfirmModal } from "../components/widgets/modals/ConfirmModal";
import { ExtractList } from "../extracts/list/ExtractList";
import { CreateAndSearchBar } from "../components/layout/CreateAndSearchBar";
import { CreateExtractModal } from "../components/widgets/modals/CreateExtractModal";
import { EditExtractModal } from "../components/widgets/modals/EditExtractModal";
import { CRUDModal } from "../components/widgets/CRUD/CRUDModal";
import {
  editColumnForm_Schema,
  editColumnForm_Ui_Schema,
} from "../components/forms/schemas";
import { LanguageModelDropdown } from "../components/widgets/selectors/LanguageModelDropdown";
import { CreateColumnModal } from "../components/widgets/modals/CreateColumnModal";

export const Extracts = () => {
  const auth_token = useReactiveVar(authToken);
  const opened_extract = useReactiveVar(openedExtract);
  const selected_extract_id = useReactiveVar(selectedExtractId);
  const show_create_extract_modal = useReactiveVar(showCreateExtractModal);
  const show_edit_extract_modal = useReactiveVar(showEditExtractModal);
  const show_delete_extract_modal = useReactiveVar(showDeleteExtractModal);
  const adding_column_to_extract = useReactiveVar(addingColumnToExtract);

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
  } = useQuery<GetExtractsOutput, GetExtractsInput>(REQUEST_GET_EXTRACTS, {
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
  const [
    createColumn,
    {
      loading: create_column_loading,
      error: create_column_error,
      data: create_column_data,
    },
  ] = useMutation<RequestCreateColumnOutputType, RequestCreateColumnInputType>(
    REQUEST_CREATE_COLUMN,
    {
      onCompleted: (data) => {
        toast.success("SUCCESS! Created column.");
      },
      onError: (err) => {
        toast.error("ERROR! Could not create column.");
      },
    }
  );

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
            onClose={() => showCreateExtractModal(false)}
          />
          <EditExtractModal
            extract={opened_extract}
            open={opened_extract !== null}
            toggleModal={() => openedExtract(null)}
          />
          {adding_column_to_extract ? (
            <CreateColumnModal
              open={adding_column_to_extract !== null}
              onSubmit={(data) => {
                console.log("Create col with data", data);
                createColumn({
                  variables: {
                    fieldsetId: adding_column_to_extract.fieldset.id,
                    ...data,
                  },
                });
              }}
              onClose={() => addingColumnToExtract(null)}
            />
          ) : (
            <></>
          )}
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
