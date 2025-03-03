import React from "react";
import { Modal, Form, Button, Dropdown, Message } from "semantic-ui-react";
import { useMutation, useQuery } from "@apollo/client";
import { toast } from "react-toastify";
import {
  CREATE_CORPUS_ACTION,
  CreateCorpusActionInput,
  CreateCorpusActionOutput,
} from "../../graphql/mutations";
import {
  GET_FIELDSETS,
  GET_ANALYZERS,
  GetFieldsetsInputs,
  GetFieldsetsOutputs,
  GetAnalyzersInputs,
  GetAnalyzersOutputs,
} from "../../graphql/queries";

interface CreateCorpusActionModalProps {
  corpusId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateCorpusActionModal: React.FC<
  CreateCorpusActionModalProps
> = ({ corpusId, open, onClose, onSuccess }) => {
  const [name, setName] = React.useState("");
  const [trigger, setTrigger] = React.useState<
    "add_document" | "edit_document"
  >("add_document");
  const [selectedFieldsetId, setSelectedFieldsetId] = React.useState<
    string | null
  >(null);
  const [selectedAnalyzerId, setSelectedAnalyzerId] = React.useState<
    string | null
  >(null);
  const [disabled, setDisabled] = React.useState(false);
  const [runOnAllCorpuses, setRunOnAllCorpuses] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const [createCorpusAction] = useMutation<
    CreateCorpusActionOutput,
    CreateCorpusActionInput
  >(CREATE_CORPUS_ACTION, {
    onCompleted: () => {
      toast.success("Action created successfully");
      setIsSubmitting(false);
      onSuccess();
      onClose();
    },
    onError: (error) => {
      toast.error("Failed to create action");
      console.error("Error creating corpus action:", error);
      setIsSubmitting(false);
    },
  });

  const { data: fieldsetsData } = useQuery<
    GetFieldsetsOutputs,
    GetFieldsetsInputs
  >(GET_FIELDSETS);

  const { data: analyzersData } = useQuery<
    GetAnalyzersOutputs,
    GetAnalyzersInputs
  >(GET_ANALYZERS);

  const handleSubmit = async () => {
    if (!name || (!selectedFieldsetId && !selectedAnalyzerId)) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);

    try {
      await createCorpusAction({
        variables: {
          corpusId,
          name,
          trigger,
          fieldsetId: selectedFieldsetId || undefined,
          analyzerId: selectedAnalyzerId || undefined,
          disabled,
          runOnAllCorpuses,
        },
      });
    } catch (error) {
      // Error is handled by the mutation's onError callback
    }
  };

  const triggerOptions = [
    { key: "add", text: "On Document Add", value: "add_document" },
    { key: "edit", text: "On Document Edit", value: "edit_document" },
  ];

  interface DropdownOption {
    key: string;
    text: string;
    value: string;
  }

  const fieldsetOptions: DropdownOption[] = React.useMemo(
    () =>
      fieldsetsData?.fieldsets.edges.map((fieldset) => ({
        key: fieldset.node.id,
        text: fieldset.node.name,
        value: fieldset.node.id,
      })) || [],
    [fieldsetsData]
  );

  const analyzerOptions: DropdownOption[] = React.useMemo(
    () =>
      analyzersData?.analyzers.edges.map((analyzer) => ({
        key: analyzer.node.id,
        text: analyzer.node.analyzerId || analyzer.node.id,
        value: analyzer.node.id,
      })) || [],
    [analyzersData]
  );

  return (
    <Modal open={open} onClose={onClose} size="small">
      <Modal.Header>Create New Corpus Action</Modal.Header>
      <Modal.Content>
        <Form loading={isSubmitting}>
          <Form.Field required>
            <label>Name</label>
            <Form.Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter action name"
            />
          </Form.Field>

          <Form.Field required>
            <label>Trigger</label>
            <Dropdown
              selection
              options={triggerOptions}
              value={trigger}
              onChange={(_, data) =>
                setTrigger(data.value as "add_document" | "edit_document")
              }
            />
          </Form.Field>

          <Message info>
            Select either a fieldset OR an analyzer to run when the trigger
            occurs.
          </Message>

          <Form.Field>
            <label>Fieldset</label>
            <Dropdown
              selection
              clearable
              options={fieldsetOptions}
              value={selectedFieldsetId || undefined}
              onChange={(_, data) => {
                setSelectedFieldsetId(data.value as string);
                setSelectedAnalyzerId(null);
              }}
              placeholder="Select fieldset"
              disabled={Boolean(selectedAnalyzerId)}
            />
          </Form.Field>

          <Form.Field>
            <label>Analyzer</label>
            <Dropdown
              selection
              clearable
              options={analyzerOptions}
              value={selectedAnalyzerId || undefined}
              onChange={(_, data) => {
                setSelectedAnalyzerId(data.value as string);
                setSelectedFieldsetId(null);
              }}
              placeholder="Select analyzer"
              disabled={Boolean(selectedFieldsetId)}
            />
          </Form.Field>

          <Form.Field>
            <Form.Checkbox
              label="Initially Disabled"
              checked={disabled}
              onChange={(_, data) => setDisabled(data.checked || false)}
            />
          </Form.Field>

          <Form.Field>
            <Form.Checkbox
              label="Run on All Corpuses"
              checked={runOnAllCorpuses}
              onChange={(_, data) => setRunOnAllCorpuses(data.checked || false)}
            />
          </Form.Field>
        </Form>
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={onClose}>Cancel</Button>
        <Button primary onClick={handleSubmit} loading={isSubmitting}>
          Create Action
        </Button>
      </Modal.Actions>
    </Modal>
  );
};
