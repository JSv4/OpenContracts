import React, { useState } from "react";
import { Modal, Form, Button, Message } from "semantic-ui-react";
import { useMutation } from "@apollo/client";
import { toast } from "react-toastify";
import { CREATE_NOTE } from "../../../graphql/mutations/noteMutations";
import {
  CreateNoteMutation,
  CreateNoteMutationVariables,
} from "../../../graphql/types/NoteTypes";

interface NewNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  corpusId?: string;
  onCreated?: () => void;
}

export const NewNoteModal: React.FC<NewNoteModalProps> = ({
  isOpen,
  onClose,
  documentId,
  corpusId,
  onCreated,
}) => {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const [createNote, { loading }] = useMutation<
    CreateNoteMutation,
    CreateNoteMutationVariables
  >(CREATE_NOTE);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Please provide both title and content");
      return;
    }

    try {
      const result = await createNote({
        variables: {
          documentId,
          corpusId,
          title: title.trim(),
          content: content.trim(),
        },
      });

      if (result.data?.createNote.ok) {
        toast.success("Note created successfully!");
        setTitle("");
        setContent("");
        onClose();
        onCreated?.();
      } else {
        toast.error(result.data?.createNote.message || "Failed to create note");
      }
    } catch (error) {
      console.error("Error creating note:", error);
      toast.error("Failed to create note");
    }
  };

  const handleClose = () => {
    setTitle("");
    setContent("");
    onClose();
  };

  return (
    <Modal open={isOpen} onClose={handleClose} size="large">
      <Modal.Header>Create New Note</Modal.Header>
      <Modal.Content>
        <Form>
          <Form.Field required>
            <label>Title</label>
            <Form.Input
              placeholder="Enter note title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
            />
          </Form.Field>
          <Form.Field required>
            <label>Content (Markdown supported)</label>
            <Form.TextArea
              placeholder="Write your note here..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={10}
              disabled={loading}
              style={{ fontFamily: "monospace" }}
            />
          </Form.Field>
          <Message info>
            <Message.Header>Markdown Support</Message.Header>
            <Message.Content>
              You can use Markdown formatting in your notes. For example:
              <ul>
                <li>**bold text**</li>
                <li>*italic text*</li>
                <li># Heading</li>
                <li>- List item</li>
                <li>`code`</li>
              </ul>
            </Message.Content>
          </Message>
        </Form>
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          primary
          onClick={handleSubmit}
          loading={loading}
          disabled={loading || !title.trim() || !content.trim()}
        >
          Create Note
        </Button>
      </Modal.Actions>
    </Modal>
  );
};
