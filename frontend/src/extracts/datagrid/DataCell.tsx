import React, { useState, useEffect } from "react";
import {
  Table,
  Icon,
  Popup,
  Modal,
  Button,
  Dimmer,
  Loader,
} from "semantic-ui-react";

import { DatacellType, ServerAnnotationType } from "../../graphql/types";
import { JSONTree } from "react-json-tree";
import {
  displayAnnotationOnAnnotatorLoad,
  onlyDisplayTheseAnnotations,
  openedDocument,
  selectedAnnotation,
} from "../../graphql/cache";
import { Server } from "http";

interface ExtractDatacellProps {
  cellData: DatacellType;
  readOnly?: boolean;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onEdit?: (id: string, new_data: Record<any, any>) => void;
}

/**
 * ExtractDatacell Component
 *
 * This component is designed to display and interact with a single data cell in a table.
 * It uses Semantic UI React components for styling and layout.
 *
 * Features:
 * - Displays JSON data in a preview format, showing the first three lines with the ability to view the full content on hover.
 * - Includes a popup menu with three actions: thumbs up (approve), thumbs down (reject), and edit.
 * - Thumbs up button calls the onApprove handler with the cell's ID.
 * - Thumbs down button calls the onReject handler with the cell's ID.
 * - Edit button opens a modal allowing the user to edit the JSON data.
 * - The modal uses react-json-tree for an interactive JSON editing experience.
 * - The edit data is initialized with `correctedData` if available, otherwise with `data`.
 * - The component updates its state to reflect changes in the provided extract data.
 * - Upon saving changes in the modal, the onEdit handler is called with the new data.
 *
 * Props:
 * - cellData: The data cell object containing the data to be displayed and edited.
 * - readOnly: A flag indicating whether the cell is in view-only mode (disables actions).
 * - onApprove: Callback function to handle approval action.
 * - onReject: Callback function to handle rejection action.
 * - onEdit: Callback function to handle editing action.
 *
 * @param {ExtractDatacellProps} props - The properties object.
 * @returns {JSX.Element} The rendered component.
 */

export const ExtractDatacell = ({
  cellData,
  readOnly,
  onApprove,
  onReject,
  onEdit,
}: ExtractDatacellProps): JSX.Element => {
  console.log("Celldata", cellData);

  const [modalOpen, setModalOpen] = useState(false);
  const [editData, setEditData] = useState<Record<string, any> | null>(null);
  const [viewSourceAnnotations, setViewSourceAnnotations] = useState<
    ServerAnnotationType[] | null
  >(null);

  useEffect(() => {
    console.log("viewSourceAnnotations changed", viewSourceAnnotations);
    if (viewSourceAnnotations !== null) {
      let open_doc = viewSourceAnnotations[0].document;
      console.log("Open doc", open_doc);
      let source_annotations = viewSourceAnnotations;
      console.log("Source annotations", source_annotations);
      displayAnnotationOnAnnotatorLoad(viewSourceAnnotations[0]);
      selectedAnnotation(viewSourceAnnotations[0]); // Not sure which one to zoom in on... picking first
      openedDocument(viewSourceAnnotations[0].document); // All sources for doc should share same document
      onlyDisplayTheseAnnotations(viewSourceAnnotations);
      setViewSourceAnnotations(null);
    }
  }, [viewSourceAnnotations]);

  const viewOnly =
    readOnly || (cellData.started && !(cellData.failed || cellData.completed));

  useEffect(() => {
    setEditData(cellData.correctedData ?? cellData.data ?? {});
  }, [cellData]);

  const handleEditClick = () => {
    setModalOpen(true);
  };

  const handleSave = () => {
    if (editData && onEdit) {
      onEdit(cellData.id, editData);
    }
    setModalOpen(false);
  };

  const handleCancel = () => {
    setEditData(null);
    setModalOpen(false);
  };

  let color = "light gray";
  if (cellData.failed) {
    color = "red";
  } else if (cellData.started && cellData.completed) {
    if (cellData.correctedData) {
      color = "yellow";
    } else if (cellData.rejectedBy) {
      color = "light red";
    } else if (cellData.approvedBy) {
      color = "green";
    } else {
      color = "light green";
    }
  }

  const renderJsonPreview = (data: Record<string, any>) => {
    const jsonString = JSON.stringify(data, null, 2);
    const preview = jsonString.split("\n").slice(0, 3).join("\n") + "\n...";
    return (
      <Popup
        trigger={<span>{preview}</span>}
        content={<pre>{jsonString}</pre>}
        wide="very"
      />
    );
  };

  const handleJsonChange = (newData: Record<string, any>) => {
    setEditData(newData);
  };

  return (
    <>
      <Table.Cell key={cellData.id} style={{ color }}>
        {cellData.started && !cellData.completed ? (
          <Dimmer active>
            <Loader />
          </Dimmer>
        ) : (
          <></>
        )}
        <div style={{ position: "relative" }}>
          {renderJsonPreview(cellData?.data ?? {})}
          {!readOnly && (
            <div style={{ position: "absolute", top: "5px", right: "5px" }}>
              <Popup
                trigger={<Icon name="ellipsis vertical" />}
                content={
                  <Button.Group vertical>
                    <Button
                      icon="eye"
                      primary
                      onClick={
                        cellData?.fullSourceList &&
                        cellData.fullSourceList !== undefined
                          ? () =>
                              setViewSourceAnnotations(
                                cellData.fullSourceList as ServerAnnotationType[]
                              )
                          : () => {}
                      }
                    />
                    <Button
                      icon="thumbs down"
                      color="red"
                      onClick={() => onReject && onReject(cellData.id)}
                    />
                    <Button
                      icon="thumbs up"
                      color="green"
                      onClick={() => onApprove && onApprove(cellData.id)}
                    />
                    <Button
                      icon="edit"
                      color="grey"
                      onClick={() => setModalOpen(true)}
                    />
                  </Button.Group>
                }
                on="click"
                position="top right"
              />
            </div>
          )}
        </div>
      </Table.Cell>
      <Modal open={modalOpen} onClose={handleCancel}>
        <Modal.Header>Edit Data</Modal.Header>
        <Modal.Content>
          {/**TODO - get data editor setup here*/}
          <JSONTree data={editData} hideRoot />
        </Modal.Content>
        <Modal.Actions>
          <Button onClick={handleCancel}>Cancel</Button>
          <Button
            disabled={Boolean(editData)}
            primary
            onClick={
              onEdit && editData
                ? () => onEdit(cellData.id, editData)
                : () => {}
            }
          >
            Save
          </Button>
        </Modal.Actions>
      </Modal>
    </>
  );
};
