import {
  ModalHeader,
  ModalContent,
  ModalActions,
  Button,
  Modal,
  Icon,
  Dimmer,
  Loader,
} from "semantic-ui-react";
import {
  ColumnType,
  DatacellType,
  DocumentType,
  ExtractType,
} from "../../../graphql/types";
import { useMutation, useQuery, useReactiveVar } from "@apollo/client";
import {
  RequestGetExtractOutput,
  REQUEST_GET_EXTRACT,
  RequestGetExtractInput,
} from "../../../graphql/queries";
import { DataGrid } from "../../../extracts/datagrid/DataGrid";
import { useEffect, useState } from "react";
import {
  REQUEST_ADD_DOC_TO_EXTRACT,
  REQUEST_CREATE_COLUMN,
  REQUEST_DELETE_COLUMN,
  REQUEST_REMOVE_DOC_FROM_EXTRACT,
  REQUEST_START_EXTRACT,
  REQUEST_UPDATE_COLUMN,
  RequestAddDocToExtractInputType,
  RequestAddDocToExtractOutputType,
  RequestCreateColumnInputType,
  RequestCreateColumnOutputType,
  RequestDeleteColumnInputType,
  RequestDeleteColumnOutputType,
  RequestRemoveDocFromExtractInputType,
  RequestRemoveDocFromExtractOutputType,
  RequestStartExtractInputType,
  RequestStartExtractOutputType,
  RequestUpdateColumnInputType,
  RequestUpdateColumnOutputType,
} from "../../../graphql/mutations";
import { toast } from "react-toastify";
import { CreateColumnModal } from "./CreateColumnModal";
import {
  addingColumnToExtract,
  editingColumnForExtract,
} from "../../../graphql/cache";

interface EditExtractModalProps {
  ext: ExtractType | null;
  open: boolean;
  toggleModal: () => void;
}

export const EditExtractModal = ({
  open,
  ext,
  toggleModal,
}: EditExtractModalProps) => {
  const [extract, setExtract] = useState<ExtractType | null>(ext);
  const [cells, setCells] = useState<DatacellType[]>([]);
  const [rows, setRows] = useState<DocumentType[]>([]);
  const [columns, setColumns] = useState<ColumnType[]>([]);
  const adding_column_to_extract = useReactiveVar(addingColumnToExtract);
  const editing_column_for_extract = useReactiveVar(editingColumnForExtract);

  useEffect(() => {
    console.log("adding_column_to_extract", adding_column_to_extract);
  }, [adding_column_to_extract]);

  useEffect(() => {
    if (ext) {
      setExtract(ext);
    }
  }, [ext]);

  const [addDocsToExtract, { loading: add_docs_loading }] = useMutation<
    RequestAddDocToExtractOutputType,
    RequestAddDocToExtractInputType
  >(REQUEST_ADD_DOC_TO_EXTRACT, {
    onCompleted: (data) => {
      console.log("Add data to ", data);
      setRows((old_rows) => [
        ...old_rows,
        ...(data.addDocsToExtract.objs as DocumentType[]),
      ]);
      toast.success("SUCCESS! Added docs to extract.");
    },
    onError: (err) => {
      toast.error("ERROR! Could not add docs to extract.");
    },
  });

  const handleAddDocIdsToExtract = (
    extractId: string,
    documentIds: string[]
  ) => {
    addDocsToExtract({
      variables: {
        extractId,
        documentIds,
      },
    });
  };

  const [removeDocsFromExtract, { loading: remove_docs_loading }] = useMutation<
    RequestRemoveDocFromExtractOutputType,
    RequestRemoveDocFromExtractInputType
  >(REQUEST_REMOVE_DOC_FROM_EXTRACT, {
    onCompleted: (data) => {
      toast.success("SUCCESS! Removed docs from extract.");
      console.log("Removed docs and return data", data);
      setRows((old_rows) =>
        old_rows.filter(
          (item) => !data.removeDocsFromExtract.idsRemoved.includes(item.id)
        )
      );
    },
    onError: (err) => {
      toast.error("ERROR! Could not remove docs from extract.");
    },
  });

  const handleRemoveDocIdsFromExtract = (
    extractId: string,
    documentIds: string[]
  ) => {
    removeDocsFromExtract({
      variables: {
        extractId,
        documentIdsToRemove: documentIds,
      },
    });
  };

  const [deleteColumn] = useMutation<
    RequestDeleteColumnOutputType,
    RequestDeleteColumnInputType
  >(REQUEST_DELETE_COLUMN, {
    onCompleted: (data) => {
      toast.success("SUCCESS! Removed column from Extract.");
      setColumns((columns) =>
        columns.filter((item) => item.id !== data.deleteColumn.deletedId)
      );
    },
    onError: (err) => {
      toast.error("ERROR! Could not remove column.");
    },
  });

  const handleDeleteColumnIdFromExtract = (columnId: string) => {
    deleteColumn({
      variables: {
        id: columnId,
      },
    });
  };

  const [createColumn, { loading: create_column_loading }] = useMutation<
    RequestCreateColumnOutputType,
    RequestCreateColumnInputType
  >(REQUEST_CREATE_COLUMN, {
    onCompleted: (data) => {
      toast.success("SUCCESS! Created column.");
      setColumns((columns) => [...columns, data.createColumn.obj]);
      addingColumnToExtract(null);
    },
    onError: (err) => {
      toast.error("ERROR! Could not create column.");
      addingColumnToExtract(null);
    },
  });

  const handleCreateColumn = (data: any, fieldsetId: string) => {
    createColumn({
      variables: {
        fieldsetId,
        ...data,
      },
    });
  };

  const {
    loading,
    error,
    data: extract_data,
    refetch,
  } = useQuery<RequestGetExtractOutput, RequestGetExtractInput>(
    REQUEST_GET_EXTRACT,
    {
      variables: {
        id: extract ? extract.id : "",
      },
      nextFetchPolicy: "network-only",
      notifyOnNetworkStatusChange: true,
    }
  );

  const [updateColumn, { loading: update_column_loading }] = useMutation<
    RequestUpdateColumnOutputType,
    RequestUpdateColumnInputType
  >(REQUEST_UPDATE_COLUMN, {
    onCompleted: (data) => {
      toast.success("SUCCESS! Updated column.");
      setColumns((oldCols) => {
        // Find the index of the object to be updated
        const index = oldCols.findIndex(
          (item) => item.id === data.updateColumn.obj.id
        );

        // If the object exists, replace it with the new object
        if (index !== -1) {
          // Create a new array with the updated object
          return [
            ...oldCols.slice(0, index),
            data.updateColumn.obj,
            ...oldCols.slice(index + 1),
          ];
        } else {
          // If the object doesn't exist, just add it to the end of the list
          return [...oldCols, data.updateColumn.obj];
        }
      });
      editingColumnForExtract(null);
    },
    onError: (err) => {
      toast.error("ERROR! Could not update column.");
      editingColumnForExtract(null);
    },
  });

  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    if (
      extract &&
      extract.started &&
      !extract.finished &&
      !extract.stacktrace
    ) {
      // Start polling every 5 seconds
      pollInterval = setInterval(() => {
        refetch({ id: extract.id });
      }, 5000);

      // Set up a timeout to stop polling after 10 minutes
      const timeoutId = setTimeout(() => {
        clearInterval(pollInterval);
        toast.info(
          "Job is taking too long... polling paused after 10 minutes."
        );
      }, 600000);

      // Clean up the interval and timeout when the component unmounts or the extract changes
      return () => {
        clearInterval(pollInterval);
        clearTimeout(timeoutId);
      };
    }
  }, [extract, refetch]);

  useEffect(() => {
    if (extract_data) {
      const { fullDatacellList, fullDocumentList, fieldset } =
        extract_data.extract;
      setCells(fullDatacellList ? fullDatacellList : []);
      setRows(fullDocumentList ? fullDocumentList : []);
      setColumns(fieldset?.fullColumnList ? fieldset.fullColumnList : []);
      setExtract(extract_data.extract);
    }
  }, [extract_data]);

  const [startExtract, { loading: start_extract_loading }] = useMutation<
    RequestStartExtractOutputType,
    RequestStartExtractInputType
  >(REQUEST_START_EXTRACT, {
    onCompleted: (data) => {
      toast.success("SUCCESS! Started extract.");
      setExtract((old_extract) => {
        return { ...old_extract, ...data.startExtract.obj };
      });
    },
    onError: (err) => {
      toast.error("ERROR! Could not start extract.");
    },
  });

  if (!extract || !extract.id) {
    return <></>;
  }

  console.log("Extract details", extract);

  return (
    <>
      <CreateColumnModal
        open={adding_column_to_extract !== null}
        onSubmit={
          adding_column_to_extract
            ? (data) =>
                handleCreateColumn(data, adding_column_to_extract.fieldset.id)
            : () => {}
        }
        onClose={() => addingColumnToExtract(null)}
      />
      {editing_column_for_extract === null ? (
        <></>
      ) : (
        <CreateColumnModal
          open={editing_column_for_extract !== null}
          existing_column={editing_column_for_extract}
          onSubmit={(data: ColumnType) => updateColumn({ variables: data })}
          onClose={() => editingColumnForExtract(null)}
        />
      )}
      <Modal
        closeIcon
        size="fullscreen"
        open={open}
        onClose={() => toggleModal()}
        style={{
          height: "90vh",
          display: "flex !important",
          flexDirection: "column",
          alignContent: "flex-start",
          justifyContent: "center",
        }}
      >
        {loading ||
        adding_column_to_extract ||
        update_column_loading ||
        add_docs_loading ||
        remove_docs_loading ? (
          <Dimmer>
            <Loader>Loading...</Loader>
          </Dimmer>
        ) : (
          <></>
        )}
        <ModalHeader>Editing Extract {extract.name}</ModalHeader>
        <ModalContent style={{ flex: 1 }}>
          <div
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "row",
              justifyContent: "flex-end",
              padding: "1rem",
            }}
          >
            <div>
              {extract.started ? (
                <Button
                  positive
                  icon
                  {...(!extract.finished
                    ? { disabled: true, loading: true }
                    : {})}
                  labelPosition="right"
                >
                  Download
                  <Icon name="download" />
                </Button>
              ) : (
                <Button
                  icon
                  labelPosition="left"
                  onClick={() =>
                    startExtract({ variables: { extractId: extract.id } })
                  }
                >
                  <Icon name="play" />
                  Run
                </Button>
              )}
            </div>
          </div>
          <DataGrid
            onAddDocIds={handleAddDocIdsToExtract}
            onRemoveDocIds={handleRemoveDocIdsFromExtract}
            onRemoveColumnId={handleDeleteColumnIdFromExtract}
            refetch={ext ? () => refetch({ id: ext.id }) : () => {}}
            extract={extract}
            cells={cells}
            rows={rows}
            columns={columns}
          />
        </ModalContent>
        <ModalActions>
          <Button onClick={() => toggleModal()}>Close</Button>
        </ModalActions>
      </Modal>
    </>
  );
};
