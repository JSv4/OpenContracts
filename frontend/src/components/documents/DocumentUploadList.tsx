import React, { useCallback, useRef } from "react";
import { Icon, Button, List, Segment, Header } from "semantic-ui-react";
import { DropEvent, FileRejection, useDropzone } from "react-dropzone";
import { ContractListItem } from "./DocumentListItem";
import { FileUploadPackageProps } from "./DocumentUploadModal";

interface DocumentUploadListProps {
  documents: FileUploadPackageProps[];
  statuses: string[];
  selected_file_num: number;
  onSelect: (args?: any) => void | any;
  onRemove: (args?: any) => void | any;
  onAddFile: (args?: any) => void | any;
}

export function DocumentUploadList(props: DocumentUploadListProps) {
  const {
    documents,
    statuses,
    onSelect,
    onRemove,
    onAddFile,
    selected_file_num,
  } = props;

  const onDrop = useCallback(
    <T extends File>(
      acceptedFiles: T[],
      fileRejections: FileRejection[],
      event: DropEvent
    ) => {
      Array.from(acceptedFiles).forEach((file) => {
        onAddFile({
          file,
          formData: {
            title: file.name,
            description: `Content summary for ${file.name}`,
          },
        });
      });
    },
    [props]
  );

  const { getRootProps, getInputProps } = useDropzone({
    disabled: documents && Object.keys(documents).length > 0,
    onDrop,
  });

  const fileInputRef = useRef() as React.MutableRefObject<HTMLInputElement>;

  const grid =
    documents && documents.length > 0
      ? documents.map((document, index) => {
          // console.log("Document index", index);
          // console.log("Status", statuses[index]);
          return (
            <ContractListItem
              key={document?.file.name ? document.file.name : index}
              onRemove={() => onRemove(index)}
              onSelect={() => onSelect(index)}
              selected={index === selected_file_num}
              document={document.formData}
              status={statuses[index]}
            />
          );
        })
      : [<></>];

  function filesChanged(event: React.ChangeEvent<HTMLInputElement>) {
    let files: File[] = [];
    if (event?.target?.files) {
      for (var file of event.target.files) {
        if (file) {
          files.push(file as File);
        }
      }
      onDrop(files, [], event);
    }
  }

  return (
    <div style={{ height: "100%" }}>
      <div
        {...getRootProps()}
        style={{
          height: "40vh",
          width: "100%",
          padding: "1rem",
        }}
      >
        {documents && documents.length > 0 ? (
          <Segment
            style={{ height: "100%", width: "100%", overflowY: "scroll" }}
          >
            <List celled>{grid}</List>
          </Segment>
        ) : (
          <Segment
            placeholder
            style={{ height: "100%", width: "100%", overflowY: "scroll" }}
          >
            <Header icon>
              <Icon name="file pdf outline" />
              Drag Documents Here or Click "Add Document(s)" to Upload
              <br />
              <em>(Only *.pdf files supported for now)</em>
            </Header>
            <Button primary onClick={() => fileInputRef.current.click()}>
              Add Document(s)
            </Button>
          </Segment>
        )}
        <input
          accept="application/pdf"
          {...getInputProps()}
          ref={fileInputRef}
          type="file"
          hidden
          multiple
          onChange={filesChanged}
        />
      </div>
    </div>
  );
}
