import { useEffect, useState } from "react";
import {
  Button,
  Modal,
  Grid,
  Divider,
  Segment,
  Header,
  Icon,
  Message,
} from "semantic-ui-react";
import _ from "lodash";

import Form from "@rjsf/semantic-ui";
import { DocumentUploadList } from "./DocumentUploadList";
import {
  HorizontallyCenteredDiv,
  VerticallyCenteredDiv,
} from "../layout/Wrappers";
import { newDocForm_Schema, newDocForm_Ui_Schema } from "../forms/schemas";
import { ApolloError, useApolloClient, useMutation } from "@apollo/client";
import {
  UploadDocumentInputProps,
  UploadDocumentOutputProps,
  UPLOAD_DOCUMENT,
} from "../../graphql/mutations";
import { toBase64 } from "../../utils/files";
import { toast } from "react-toastify";

export const NOT_STARTED = "NOT_STARTED";
export const SUCCESS = "SUCCESS";
export const FAILED = "FAILED";
export const UPLOADING = "UPLOADING";

export interface FileDetailsProps {
  title?: string;
  description?: string;
}

export interface FileUploadPackageProps {
  file: File;
  formData: FileDetailsProps;
}

interface RightColProps {
  files: FileUploadPackageProps[];
  selected_file_num: number;
  selected_doc: number;
  handleChange: (a: any) => void;
}

export function RightCol({
  files,
  selected_file_num,
  handleChange,
}: RightColProps) {
  if (files && files.length > 0 && selected_file_num >= 0) {
    return (
      <Segment style={{ height: "100%", width: "100%", padding: "2rem" }}>
        <Form
          schema={newDocForm_Schema}
          uiSchema={newDocForm_Ui_Schema}
          onChange={handleChange}
          formData={files[selected_file_num].formData}
        >
          <></>
        </Form>
      </Segment>
    );
  }
  return (
    <Segment
      placeholder
      style={{ height: "100%", width: "100%", padding: "2rem" }}
    >
      <Header icon>
        <Icon name="settings" />
        Once you've uploaded one or more documents, click on a document to
        update default title and descriptions.
      </Header>
    </Segment>
  );
}

interface DocumentUploadModalProps {
  open: boolean;
  onClose: () => void;
  refetch?: (args?: any) => any | void;
}

export function DocumentUploadModal(props: DocumentUploadModalProps) {
  const client = useApolloClient();

  const { open, onClose, refetch } = props;
  const [files, setFiles] = useState<FileUploadPackageProps[]>([]);
  const [upload_state, setUploadState] = useState<
    ("NOT_STARTED" | "SUCCESS" | "FAILED" | "UPLOADING")[]
  >([]);
  const [selected_file_num, selectFileNum] = useState<number>(-1);

  useEffect(() => {
    if (!open) {
      setUploadState([]);
      setFiles([]);
      selectFileNum(-1);
    }
  }, [open]);

  const [uploadDocument, {}] = useMutation<
    UploadDocumentOutputProps,
    UploadDocumentInputProps
  >(UPLOAD_DOCUMENT, {
    onCompleted: refetch ? () => refetch() : () => undefined,
  });

  const toggleSelectedDoc = (new_index: number) => {
    selectFileNum(new_index === selected_file_num ? -1 : new_index);
  };

  const addFile = (file_package: FileUploadPackageProps) => {
    setFiles((files) => [
      ...(files ? files : []),
      { ...file_package, status: NOT_STARTED },
    ]);
    setUploadState((statuses) => [...statuses, NOT_STARTED]);
  };

  // TODO... improve type handling
  const uploadFiles = async () => {
    let uploads: any = [];
    if (files) {
      files.forEach(async (file_package, file_index) => {
        setFileStatus(UPLOADING, file_index);
        var base_64_str = await toBase64(file_package.file);
        if (typeof base_64_str === "string" || base_64_str instanceof String) {
          uploads.push(
            uploadDocument({
              variables: {
                base64FileString: base_64_str.split(",")[1],
                filename: file_package.file.name,
                customMeta: {},
                description: file_package.formData.description,
                title: file_package.formData.title,
              },
            })
              .then((upload_data: any) => {
                // console.log(`Upload data for ${file_index}`, upload_data);
                setFileStatus(SUCCESS, file_index);
              })
              .catch((upload_error: ApolloError) => {
                toast.error(upload_error.message);
                setFileStatus(FAILED, file_index);
              })
          );
        }
      });
    }
    await Promise.all(uploads);
  };

  const removeFile = (file_index: number) => {
    setFiles((files) =>
      files?.filter((file_package, index) => index !== file_index)
    );
  };

  let selected_doc = null;
  try {
    selected_doc = files[selected_file_num];
  } catch {}

  const handleChange = ({ formData }: { formData: FileDetailsProps }) => {
    // console.log("handleChange", formData);
    setFiles((files) =>
      files.map((file_package, index) =>
        index === selected_file_num
          ? { ...file_package, formData }
          : file_package
      )
    );
  };

  const setFileStatus = (
    doc_status: "NOT_STARTED" | "SUCCESS" | "FAILED" | "UPLOADING",
    doc_index: number
  ) => {
    setUploadState((states) =>
      states.map((state, state_index) =>
        state_index === doc_index ? doc_status : state
      )
    );
  };

  const clearAndReloadOnClose = () => {
    // Clear files
    setFiles([]);
    setUploadState([]);
    onClose();
  };

  const upload_status = upload_state.reduce((previousValue, currentValue) => {
    return previousValue === FAILED || currentValue === FAILED
      ? FAILED
      : previousValue === UPLOADING || currentValue === UPLOADING
      ? UPLOADING
      : previousValue === SUCCESS && currentValue === SUCCESS
      ? SUCCESS
      : NOT_STARTED;
  }, NOT_STARTED);

  return (
    <Modal open={open} onClose={() => clearAndReloadOnClose()}>
      <HorizontallyCenteredDiv>
        <div style={{ marginTop: "1rem", textAlign: "left" }}>
          <Header as="h2">
            <Icon name="file pdf outline" />
            <Header.Content>
              Upload Your Contracts
              <Header.Subheader>
                Select New Contract Files to Upload
              </Header.Subheader>
            </Header.Content>
          </Header>
        </div>
      </HorizontallyCenteredDiv>
      <Modal.Content>
        <Segment>
          <Grid columns={2} stackable textAlign="center">
            <Divider vertical>Details:</Divider>
            <Grid.Row verticalAlign="middle">
              <Grid.Column style={{ paddingRight: "2rem" }}>
                <DocumentUploadList
                  selected_file_num={selected_file_num}
                  documents={files}
                  statuses={upload_state}
                  onAddFile={addFile}
                  onRemove={removeFile}
                  onSelect={toggleSelectedDoc}
                />
              </Grid.Column>
              <Grid.Column style={{ paddingLeft: "2rem" }}>
                <div style={{ height: "100%", width: "100%" }}>
                  <div
                    style={{
                      height: "40vh",
                      width: "100%",
                      padding: "1rem",
                    }}
                  >
                    {upload_status === FAILED ? (
                      <VerticallyCenteredDiv>
                        <Message negative style={{ width: "100%" }}>
                          <Message.Header>
                            There was an error uploading your documents. See
                            which document icons are red to see which documents
                            failed.
                          </Message.Header>
                        </Message>
                      </VerticallyCenteredDiv>
                    ) : (
                      <></>
                    )}
                    {upload_status === SUCCESS ? (
                      <Message
                        positive
                        style={{ width: "100%", height: "100%" }}
                      >
                        <Message.Header>
                          Your documents were uploaded successfully!
                        </Message.Header>
                      </Message>
                    ) : (
                      <></>
                    )}
                    {upload_status === UPLOADING ? (
                      <Message style={{ width: "100%", height: "100%" }}>
                        <Message.Header>
                          Your documents are being uploaded. Please do not close
                          this window.
                        </Message.Header>
                      </Message>
                    ) : (
                      <></>
                    )}
                    {upload_status === NOT_STARTED ? (
                      <RightCol
                        files={files}
                        selected_file_num={selected_file_num}
                        selected_doc={selected_file_num}
                        handleChange={handleChange}
                      />
                    ) : (
                      <></>
                    )}
                  </div>
                </div>
              </Grid.Column>
            </Grid.Row>
          </Grid>
        </Segment>
      </Modal.Content>
      <Modal.Actions>
        <Button basic color="grey" onClick={() => clearAndReloadOnClose()}>
          <Icon name="remove" /> Close
        </Button>
        {files &&
        Object.keys(files).length > 0 &&
        upload_status === NOT_STARTED ? (
          <Button color="green" inverted onClick={() => uploadFiles()}>
            <Icon name="checkmark" /> Upload
          </Button>
        ) : (
          <></>
        )}
      </Modal.Actions>
    </Modal>
  );
}
