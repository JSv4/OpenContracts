import React, { useState, useEffect } from "react";
import {
  Modal,
  Form,
  FormInput,
  FormGroup,
  FormButton,
  FormField,
  Dimmer,
  Loader,
} from "semantic-ui-react";

import { useReactiveVar, useQuery, useMutation } from "@apollo/client";
import { selectedCorpus, selectedFieldset } from "../../../graphql/cache";
import {
  REQUEST_GET_EXTRACT,
  RequestGetExtractInput,
  RequestGetExtractOutput,
} from "../../../graphql/queries";
import { CorpusDropdown } from "../selectors/CorpusDropdown";
import { FieldsetDropdown } from "../selectors/FieldsetDropdown";
import {
  REQUEST_CREATE_EXTRACT,
  RequestCreateExtractInputType,
  RequestCreateExtractOutputType,
} from "../../../graphql/mutations";
import { toast } from "react-toastify";

interface ExtractModalProps {
  open: boolean;
  onClose: () => void;
  extractId?: string;
  fieldsetId?: string;
  corpusId?: string;
}

export const CreateExtractModal: React.FC<ExtractModalProps> = ({
  open,
  onClose,
  extractId,
  fieldsetId,
  corpusId,
}) => {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selected_corpus = useReactiveVar(selectedCorpus);
  const selected_fieldset = useReactiveVar(selectedFieldset);

  const { loading, error, data } = useQuery<
    RequestGetExtractOutput,
    RequestGetExtractInput
  >(REQUEST_GET_EXTRACT, {
    variables: { id: extractId || "" },
    skip: !extractId,
  });

  const [
    createExtract,
    { loading: createExtractLoading, error: createExtractError },
  ] = useMutation<
    RequestCreateExtractOutputType,
    RequestCreateExtractInputType
  >(REQUEST_CREATE_EXTRACT);

  useEffect(() => {
    if (data?.extract) {
      setName(data.extract.name);
    }
  }, [data]);

  const handleSubmit = async () => {
    if (!extractId) {
      try {
        setIsSubmitting(true);
        const { data } = await createExtract({
          variables: {
            ...(selected_corpus?.id ? { corpusId: selected_corpus?.id } : {}),
            ...(selected_fieldset?.id
              ? { fieldsetId: selected_fieldset?.id }
              : {}),
            name,
          },
        });
        if (data?.createExtract.ok) {
          selectedCorpus(null);
          selectedFieldset(null);
          onClose();
        } else {
          toast.error(`Failed to create extract: ${data?.createExtract.msg}`);
        }
      } catch (error) {
        console.error("Error creating extract:", error);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <Modal open={open} onClose={onClose}>
      <Modal.Header>
        {extractId ? "Edit Extract" : "Create Extract"}
      </Modal.Header>
      <Modal.Content>
        <Form onSubmit={handleSubmit}>
          <FormGroup>
            <FormField required>
              <label>Name</label>
              <FormInput
                placeholder="Enter the extract name"
                name="name"
                value={name}
                onChange={(e, { value }) => setName(value)}
              />
            </FormField>
          </FormGroup>
          {!corpusId && (
            <FormGroup>
              <FormField>
                <label>Corpus</label>
                <CorpusDropdown />
                <small>
                  <b>(Optional)</b> If provided, load documents from this corpus
                  for the extract
                </small>
              </FormField>
            </FormGroup>
          )}
          {!fieldsetId && (
            <FormGroup>
              <FormField>
                <label>Fieldset</label>
                <FieldsetDropdown />
                <small>
                  <b>(Optional)</b> Re-use an existing fieldset (search by
                  name). If not provided, a new fieldset is created for the
                  extract.
                </small>
              </FormField>
            </FormGroup>
          )}
          <FormButton
            primary
            content="Submit"
            style={{ marginTop: "1vh" }}
            disabled={isSubmitting || createExtractLoading}
            loading={isSubmitting || createExtractLoading}
          />
        </Form>
      </Modal.Content>
      {(isSubmitting || createExtractLoading) && (
        <Dimmer active inverted>
          <Loader inverted>Submitting...</Loader>
        </Dimmer>
      )}
    </Modal>
  );
};
