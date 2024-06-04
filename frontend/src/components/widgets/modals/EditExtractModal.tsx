import {
  ModalHeader,
  ModalContent,
  ModalActions,
  Button,
  Modal,
} from "semantic-ui-react";
import {
  ColumnType,
  DatacellType,
  DocumentType,
  ExtractType,
} from "../../../graphql/types";
import { useMutation, useQuery } from "@apollo/client";
import {
  RequestGetExtractOutput,
  REQUEST_GET_EXTRACT,
  RequestGetExtractInput,
} from "../../../graphql/queries";
import { DataGrid } from "../../../extracts/datagrid/DataGrid";
import { useEffect, useState } from "react";
import {
  REQUEST_ADD_DOC_TO_EXTRACT,
  REQUEST_REMOVE_DOC_FROM_EXTRACT,
  RequestAddDocToExtractInputType,
  RequestAddDocToExtractOutputType,
  RequestRemoveDocFromExtractInputType,
  RequestRemoveDocFromExtractOutputType,
} from "../../../graphql/mutations";
import { toast } from "react-toastify";

interface EditExtractModalProps {
  extract: ExtractType | null;
  open: boolean;
  toggleModal: () => void;
}

export const EditExtractModal = ({
  open,
  extract,
  toggleModal,
}: EditExtractModalProps) => {
  const [cells, setCells] = useState<DatacellType[]>([]);
  const [rows, setRows] = useState<DocumentType[]>([]);
  const [columns, setColumns] = useState<ColumnType[]>([]);

  const [addDocsToExtract, { loading: add_docs_loading, data: add_docs_data }] =
    useMutation<
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

  const [
    removeDocsFromExtract,
    { loading: remove_docs_loading, data: remove_docs_data },
  ] = useMutation<
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
    }
  );

  useEffect(() => {
    if (extract) {
      refetch();
    }
  }, [extract]);

  useEffect(() => {
    if (extract_data) {
      const { fullDatacellList, fullDocumentList, fieldset } =
        extract_data.extract;
      setCells(fullDatacellList ? fullDatacellList : []);
      setRows(fullDocumentList ? fullDocumentList : []);
      setColumns(fieldset?.fullColumnList ? fieldset.fullColumnList : []);
    }
  }, [extract_data]);

  if (!extract || !extract.id) {
    return <></>;
  }

  return (
    <Modal
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
      <ModalHeader>Editing Extract {extract.name}</ModalHeader>
      <ModalContent style={{ flex: 1 }}>
        <DataGrid
          onAddDocIds={handleAddDocIdsToExtract}
          onRemoveDocIds={handleRemoveDocIdsFromExtract}
          extract={extract}
          cells={cells}
          rows={rows}
          columns={columns}
        />
      </ModalContent>
      <ModalActions>
        <Button negative onClick={() => toggleModal()}>
          No
        </Button>
        <Button positive onClick={() => toggleModal()}>
          Yes
        </Button>
      </ModalActions>
    </Modal>
  );
};
