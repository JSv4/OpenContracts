import {
  ModalHeader,
  ModalContent,
  ModalActions,
  Button,
  Modal,
  Icon,
  Dimmer,
  Loader,
  Statistic,
  Segment,
  Message,
} from "semantic-ui-react";
import {
  ColumnType,
  DatacellType,
  DocumentType,
  ExtractType,
} from "../../../types/graphql-api";
import { useMutation, useQuery, useReactiveVar } from "@apollo/client";
import {
  RequestGetExtractOutput,
  REQUEST_GET_EXTRACT,
  RequestGetExtractInput,
} from "../../../graphql/queries";
import { useEffect, useState, useCallback } from "react";
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
  REQUEST_CREATE_FIELDSET,
  RequestCreateFieldsetInputType,
  RequestCreateFieldsetOutputType,
  REQUEST_UPDATE_EXTRACT,
  RequestUpdateExtractInputType,
  RequestUpdateExtractOutputType,
} from "../../../graphql/mutations";
import { toast } from "react-toastify";
import { CreateColumnModal } from "./CreateColumnModal";
import {
  addingColumnToExtract,
  editingColumnForExtract,
} from "../../../graphql/cache";
import { ExtractDataGrid } from "../../extracts/datagrid/DataGrid";

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

  const [createFieldset] = useMutation<
    RequestCreateFieldsetOutputType,
    RequestCreateFieldsetInputType
  >(REQUEST_CREATE_FIELDSET);

  const [updateExtract] = useMutation<
    RequestUpdateExtractOutputType,
    RequestUpdateExtractInputType
  >(REQUEST_UPDATE_EXTRACT, {
    onCompleted: () => {
      toast.success("Extract updated with new fieldset.");
      refetch();
    },
    onError: () => {
      toast.error("Failed to update extract with new fieldset.");
    },
  });

  /**
   * Handles the deletion of a column from the extract.
   * If the fieldset is not in use, deletes the column directly.
   * If the fieldset is in use, creates a new fieldset without the column and updates the extract.
   *
   * @param {string} columnId - The ID of the column to delete.
   */
  const handleDeleteColumnIdFromExtract = async (columnId: string) => {
    if (!extract?.fieldset?.id) return;

    if (!extract.fieldset.inUse) {
      // Fieldset is not in use; delete the column directly
      try {
        await deleteColumn({
          variables: {
            id: columnId,
          },
        });
        // Remove the column from local state
        setColumns((prevColumns) =>
          prevColumns.filter((column) => column.id !== columnId)
        );
        // Refetch data to get updated columns
        refetch();
        toast.success("SUCCESS! Removed column from Extract.");
      } catch (error) {
        console.error(error);
        toast.error("Error while deleting column from extract.");
      }
    } else {
      // Fieldset is in use; proceed with existing logic
      try {
        // Step 1: Create a new fieldset
        const { data: fieldsetData } = await createFieldset({
          variables: {
            name: `${extract.fieldset.name} (edited)`,
            description: extract.fieldset.description || "",
          },
        });

        const newFieldsetId = fieldsetData?.createFieldset.obj.id;

        if (!newFieldsetId) throw new Error("Fieldset creation failed.");

        // Step 2: Copy existing columns except the deleted one
        const columnsToCopy = columns.filter((col) => col.id !== columnId);
        await Promise.all(
          columnsToCopy.map((column) =>
            createColumn({
              variables: {
                fieldsetId: newFieldsetId,
                name: column.name,
                query: column.query || "",
                matchText: column.matchText,
                outputType: column.outputType,
                limitToLabel: column.limitToLabel,
                instructions: column.instructions,
                taskName: column.taskName,
                agentic: Boolean(column.agentic),
              },
            })
          )
        );

        // Step 3: Update the extract to use the new fieldset
        console.log("Updating extract to use new fieldset", newFieldsetId);
        await updateExtract({
          variables: {
            id: extract.id,
            fieldsetId: newFieldsetId,
          },
        });

        // Update local state
        setExtract((prevExtract) =>
          prevExtract
            ? { ...prevExtract, fieldset: fieldsetData.createFieldset.obj }
            : prevExtract
        );

        // Refetch data to get updated columns
        refetch();
      } catch (error) {
        console.error(error);
        toast.error("Error while deleting column from extract.");
      }
    }
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

  const handleCreateColumn = useCallback(
    (data: any) => {
      if (!extract?.fieldset?.id) return;
      createColumn({
        variables: {
          fieldsetId: extract.fieldset.id,
          ...data,
        },
      });
    },
    [createColumn, extract?.fieldset?.id]
  );

  // Define the handler for adding a column
  const handleAddColumn = useCallback(() => {
    if (!extract?.fieldset) return;
    addingColumnToExtract(extract);
  }, [extract?.fieldset]);

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
    refetchQueries: [
      {
        query: REQUEST_GET_EXTRACT,
        variables: { id: extract ? extract.id : "" },
      },
    ],
    onCompleted: () => {
      toast.success("SUCCESS! Updated column.");
      editingColumnForExtract(null);
    },
    onError: (err) => {
      toast.error("ERROR! Could not update column.");
      editingColumnForExtract(null);
    },
  });

  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    if (extract && extract.started && !extract.finished && !extract.error) {
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
    if (open && extract) {
      refetch();
    }
  }, [open]);

  useEffect(() => {
    console.log("XOXO - Extract Data", extract_data);
    if (extract_data) {
      const { fullDatacellList, fullDocumentList, fieldset } =
        extract_data.extract;
      console.log("XOXO - Full Datacell List", fullDatacellList);
      console.log("XOXO - Full Document List", fullDocumentList);
      console.log("XOXO - Fieldset", fieldset);
      setCells(fullDatacellList ? fullDatacellList : []);
      setRows(fullDocumentList ? fullDocumentList : []);
      // Add debug logging here
      console.log("Setting columns to:", fieldset?.fullColumnList);
      setColumns(fieldset?.fullColumnList ? fieldset.fullColumnList : []);
      // Update the extract state with the latest data
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

  // Add handler for row updates
  const handleRowUpdate = useCallback((updatedRow: DocumentType) => {
    setRows((prevRows) =>
      prevRows.map((row) => (row.id === updatedRow.id ? updatedRow : row))
    );
  }, []);

  const isLoading =
    loading ||
    create_column_loading ||
    update_column_loading ||
    add_docs_loading ||
    remove_docs_loading;

  if (!extract || !extract.id) {
    return null;
  }

  return (
    <>
      <CreateColumnModal
        open={adding_column_to_extract !== null}
        existing_column={null}
        onSubmit={
          adding_column_to_extract
            ? (data) => handleCreateColumn(data)
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
        {isLoading && (
          <Dimmer active>
            <Loader>Loading...</Loader>
          </Dimmer>
        )}
        <ModalHeader>Editing Extract {extract.name}</ModalHeader>
        <ModalContent style={{ flex: 1 }}>
          <Segment.Group horizontal>
            <Segment textAlign="center">
              <Statistic size="mini">
                <Statistic.Label>Status</Statistic.Label>
                <Statistic.Value>
                  {extract.started && !extract.finished && !extract.error ? (
                    <Icon name="spinner" loading />
                  ) : extract.finished ? (
                    <Icon name="check circle" color="green" />
                  ) : extract.error ? (
                    <Icon name="exclamation circle" color="red" />
                  ) : (
                    <Icon name="pause circle" color="grey" />
                  )}
                </Statistic.Value>
              </Statistic>
            </Segment>
            {extract.started && (
              <Segment textAlign="center">
                <Statistic size="mini">
                  <Statistic.Label>Started</Statistic.Label>
                  <Statistic.Value>
                    {new Date(extract.started).toLocaleString()}
                  </Statistic.Value>
                </Statistic>
              </Segment>
            )}
            {extract.finished && (
              <Segment textAlign="center">
                <Statistic size="mini">
                  <Statistic.Label>Completed</Statistic.Label>
                  <Statistic.Value>
                    {new Date(extract.finished).toLocaleString()}
                  </Statistic.Value>
                </Statistic>
              </Segment>
            )}
            {extract.error && extract.finished && (
              <Segment textAlign="center" color="red">
                <Statistic size="mini">
                  <Statistic.Label>Failed</Statistic.Label>
                  <Statistic.Value>
                    {new Date(extract.finished).toLocaleString()}
                  </Statistic.Value>
                </Statistic>
              </Segment>
            )}
          </Segment.Group>
          {extract.error && (
            <Message negative>
              <Message.Header>Error</Message.Header>
              <pre>{extract.error}</pre>
            </Message>
          )}
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
                  onClick={() => window.alert("Not implemented yet")}
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
          <ExtractDataGrid
            onAddDocIds={handleAddDocIdsToExtract}
            onRemoveDocIds={handleRemoveDocIdsFromExtract}
            onRemoveColumnId={handleDeleteColumnIdFromExtract}
            onUpdateRow={handleRowUpdate}
            onAddColumn={handleAddColumn}
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
