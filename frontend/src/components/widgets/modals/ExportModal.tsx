import { useEffect, useRef, useState } from "react";
import { Button, Modal, Icon, Header, Dimmer, Loader } from "semantic-ui-react";
import _ from "lodash";
import { CreateAndSearchBar } from "../../layout/CreateAndSearchBar";
import { ExportList } from "../../exports/ExportList";
import { LooseObject } from "../../types";
import { useLazyQuery, useReactiveVar } from "@apollo/client";
import {
  GetExportsInputs,
  GetExportsOutputs,
  GET_EXPORTS,
} from "../../../graphql/queries";
import { ExportObject } from "../../../graphql/types";
import { exportSearchTerm, showExportModal } from "../../../graphql/cache";
import { toast } from "react-toastify";

export function ExportModal({
  visible,
  toggleModal,
}: {
  visible: boolean;
  toggleModal: (args?: any) => void | any;
}) {
  const export_search_term = useReactiveVar(exportSearchTerm);
  const show_export_modal = useReactiveVar(showExportModal);

  const [exportSearchCache, setExportSearchCache] =
    useState<string>(export_search_term);
  const [orderByCreated, setOrderByCreated] = useState<
    "created" | "-created" | undefined
  >(); // TODO - implement input
  const [orderByFinished, setOrderByFinished] = useState<
    "finished" | "-finished" | undefined
  >(); // TODO - implement input
  const [orderByStarted, setOrderByStarted] = useState<
    "started" | "-started" | undefined
  >(); // TODO - implement input

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Debounched Search Handler
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const debouncedExportSearch = useRef(
    _.debounce((searchTerm) => {
      exportSearchTerm(searchTerm);
    }, 1000)
  );

  const handleCorpusSearchChange = (value: string) => {
    setExportSearchCache(value);
    debouncedExportSearch.current(value);
  };

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Setup query variables based on user inputs
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  let exports_variables: LooseObject = {};
  if (export_search_term) {
    exports_variables["name_Contains"] = export_search_term;
  }
  if (orderByCreated) {
    exports_variables["orderByCreated"] = orderByCreated;
  }
  if (orderByStarted) {
    exports_variables["orderByStarted"] = orderByStarted;
  }
  if (orderByFinished) {
    exports_variables["orderByFinished"] = orderByFinished;
  }

  const [
    fetchExports,
    {
      refetch: refetchExports,
      loading: exports_loading,
      error: exports_error,
      data: exports_response,
      fetchMore: fetchMoreExports,
    },
  ] = useLazyQuery<GetExportsOutputs, GetExportsInputs>(GET_EXPORTS, {
    variables: exports_variables,
    fetchPolicy: "network-only",
  });

  if (exports_error) {
    toast.error("ERROR!\nUnable to get export list.");
  }

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Effects to refetch on user input changes
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  useEffect(() => {
    fetchExports();
  }, []);

  // If visibility is toggled and modal is now visible, load the exports.
  useEffect(() => {
    if (show_export_modal) {
      fetchExports();
    }
  }, [show_export_modal]);

  useEffect(() => {
    refetchExports();
  }, [export_search_term]);

  useEffect(() => {
    refetchExports();
  }, [orderByCreated]);

  useEffect(() => {
    refetchExports();
  }, [orderByStarted]);

  useEffect(() => {
    refetchExports();
  }, [orderByFinished]);

  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Shape GraphQL Data
  ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  const export_data = exports_response?.userexports?.edges
    ? exports_response.userexports.edges
    : [];
  const export_items = export_data
    .map((edge) => (edge ? edge.node : undefined))
    .filter((item): item is ExportObject => !!item);

  return (
    <Modal closeIcon open={visible} onClose={() => toggleModal()}>
      <Modal.Header>
        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
          }}
        >
          <div>
            <Header as="h2" icon>
              <Icon name="zip" />
              Corpus Exports
              <Header.Subheader>
                WARNING - If you have a free account, your exports will be
                deleted within 24 hours of completion.
              </Header.Subheader>
            </Header>
          </div>
        </div>
      </Modal.Header>
      <Modal.Content>
        {exports_loading ? (
          <Dimmer active inverted>
            <Loader inverted>Loading...</Loader>
          </Dimmer>
        ) : (
          <></>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            flexDirection: "row",
            width: "100%",
            marginBottom: "1rem",
          }}
        >
          <CreateAndSearchBar
            onChange={(value) => handleCorpusSearchChange(value)}
            actions={[]}
            placeholder="Search for export by name..."
            value={exportSearchCache}
          />
        </div>
        <ExportList
          items={export_items}
          pageInfo={exports_response?.userexports?.pageInfo}
          loading={exports_loading}
          fetchMore={fetchMoreExports}
          onDelete={(id) => console.log("Delete", id)}
        />
      </Modal.Content>
      <Modal.Actions>
        <Button basic color="grey" onClick={() => toggleModal()}>
          <Icon name="remove" /> Close
        </Button>
      </Modal.Actions>
    </Modal>
  );
}
