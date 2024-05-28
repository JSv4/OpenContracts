import React, { ReactNode, useEffect, useState } from "react";
import { Button, Modal, Icon } from "semantic-ui-react";
import _ from "lodash";
import { CorpusType, FieldsetType } from "../../../graphql/types";

export interface CreateExtractModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  corpus?: CorpusType | undefined;
  fieldset?: FieldsetType | undefined;
  children?: React.ReactChild | React.ReactChild[];
}

export function CreateExtractModal({
  open,
  corpus,
  fieldset,
  children,
  onClose,
  onSubmit,
}: CreateExtractModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Modal closeIcon open={open} onClose={() => onClose()}>
      <Modal.Content></Modal.Content>
      <Modal.Actions>
        <Button basic color="grey" onClick={() => onClose()}>
          <Icon name="remove" /> Close
        </Button>
        <Button
          color="green"
          inverted
          onClick={() => console.log("Do the thing")}
        >
          <Icon name="checkmark" />
          Create
        </Button>
      </Modal.Actions>
    </Modal>
  );
}
