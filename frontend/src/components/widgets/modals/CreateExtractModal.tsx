import React, { useState, useEffect } from "react";
import {
  Modal,
  Form,
  FormInput,
  FormGroup,
  FormButton,
  FormField,
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
        const { data } = await createExtract({
          variables: {
            corpusId: selected_corpus?.id || corpusId || "",
            name,
            fieldsetId: selected_fieldset?.id || fieldsetId || "",
          },
        });
        if (data?.createExtract.ok) {
          onClose();
        } else {
          console.error("Failed to create extract:", data?.createExtract.msg);
        }
      } catch (error) {
        console.error("Error creating extract:", error);
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
            <FormInput
              placeholder="Name"
              name="name"
              value={name}
              onChange={(e, { value }) => setName(value)}
              style={{ minWidth: "50vw important!" }}
            />
          </FormGroup>
          {!corpusId && (
            <FormGroup>
              <FormField>
                <label>Corpus</label>
                <CorpusDropdown />
              </FormField>
            </FormGroup>
          )}

          {!fieldsetId && (
            <FormGroup>
              <FormField>
                <label>Fieldset</label>
                <FieldsetDropdown />
              </FormField>
            </FormGroup>
          )}
          <FormButton
            content="Submit"
            style={{ marginTop: "1vh" }}
            disabled={loading}
            loading={loading}
          />
        </Form>
      </Modal.Content>
    </Modal>
  );
};
