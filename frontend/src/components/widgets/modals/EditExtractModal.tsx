import {
  ModalHeader,
  ModalContent,
  ModalActions,
  Button,
  Modal,
} from "semantic-ui-react";
import { ExtractType } from "../../../graphql/types";
import { useQuery } from "@apollo/client";
import {
  RequestGetExtractOutput,
  GetExtractsInput,
  REQUEST_GET_EXTRACT,
  RequestGetExtractInput,
} from "../../../graphql/queries";
import { DataGrid } from "../../../extracts/datagrid/DataGrid";

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
  const { loading, error, data, refetch } = useQuery<
    RequestGetExtractOutput,
    RequestGetExtractInput
  >(REQUEST_GET_EXTRACT, {
    variables: {
      id: extract ? extract.id : "",
    },
  });

  if (!extract || !extract.id) {
    return <></>;
  }

  console.log("Extract", data);

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
        <DataGrid extract={extract} />
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
