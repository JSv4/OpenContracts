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

const styles = {
  modal: {
    height: "90vh",
    display: "flex",
    flexDirection: "column",
    background: "#ffffff",
    overflow: "hidden",
    borderRadius: "16px",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.15)",
  } as React.CSSProperties,
  header: {
    background: "white",
    padding: "24px 32px",
    fontSize: "1.25rem",
    color: "#1a202c",
    fontWeight: 600,
    borderBottom: "1px solid #e2e8f0",
    position: "sticky",
    top: 0,
    zIndex: 10,
    flex: "0 0 auto",
  } as React.CSSProperties,
  content: {
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0,
  } as React.CSSProperties,
  scrollableContent: {
    flex: "1 1 auto",
    overflow: "auto",
    padding: "32px",
    minHeight: 0,
  } as React.CSSProperties,
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "24px",
    height: "100%",
  } as React.CSSProperties,
  field: {
    marginBottom: "24px",
  },
  label: {
    display: "block",
    marginBottom: "8px",
    color: "#4a5568",
    fontSize: "0.9rem",
    fontWeight: 500,
  },
  input: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "12px",
    border: "1px solid #e2e8f0",
    transition: "all 0.2s ease",
    fontSize: "0.95rem",
    "&:focus": {
      borderColor: "#3b82f6",
      boxShadow: "0 0 0 3px rgba(59, 130, 246, 0.1)",
    },
  },
  submitButton: {
    marginTop: "auto",
    padding: "12px 24px",
    borderRadius: "12px",
    backgroundColor: "#3b82f6",
    color: "white",
    border: "none",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s ease",
    position: "sticky" as const,
    bottom: 0,
    zIndex: 10,
    boxShadow: "0 -4px 12px rgba(0,0,0,0.05)",
    background: "linear-gradient(to bottom, #3b82f6, #2563eb)",
    "&:hover": {
      backgroundColor: "#2563eb",
      transform: "translateY(-1px)",
    },
    "&:disabled": {
      backgroundColor: "#94a3b8",
      cursor: "not-allowed",
      transform: "none",
    },
  } as React.CSSProperties,
  helperText: {
    fontSize: "0.85rem",
    color: "#64748b",
    marginTop: "6px",
  },
  dimmer: {
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    backdropFilter: "blur(4px)",
  },
  loader: {
    "&:before": {
      borderColor: "rgba(59, 130, 246, 0.2)",
    },
    "&:after": {
      borderColor: "#3b82f6 transparent transparent",
    },
  },
};

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
    <Modal open={open} onClose={onClose} style={styles.modal}>
      <Modal.Header style={styles.header}>
        {extractId ? "Edit Extract" : "Create New Extract"}
      </Modal.Header>
      <Modal.Content style={styles.content}>
        <div style={styles.scrollableContent}>
          <Form onSubmit={handleSubmit} style={styles.form}>
            <FormGroup>
              <FormField required style={styles.field}>
                <label style={styles.label}>Extract Name</label>
                <FormInput
                  placeholder="Enter a descriptive name for your extract"
                  name="name"
                  value={name}
                  onChange={(e, { value }) => setName(value)}
                  style={styles.input}
                />
              </FormField>
            </FormGroup>
            {!corpusId && (
              <FormGroup>
                <FormField style={styles.field}>
                  <label style={styles.label}>Select Corpus</label>
                  <CorpusDropdown />
                  <div style={styles.helperText}>
                    <b>Optional:</b> Choose a corpus to load documents from
                  </div>
                </FormField>
              </FormGroup>
            )}
            {!fieldsetId && (
              <FormGroup>
                <FormField style={styles.field}>
                  <label style={styles.label}>Select Fieldset</label>
                  <FieldsetDropdown />
                  <div style={styles.helperText}>
                    <b>Optional:</b> Use an existing fieldset or create a new
                    one
                  </div>
                </FormField>
              </FormGroup>
            )}
            <FormButton
              primary
              content={isSubmitting ? "Creating..." : "Create Extract"}
              style={styles.submitButton}
              disabled={isSubmitting || createExtractLoading || !name.trim()}
              loading={isSubmitting || createExtractLoading}
            />
          </Form>
        </div>
      </Modal.Content>
      {(isSubmitting || createExtractLoading) && (
        <Dimmer active inverted style={styles.dimmer}>
          <Loader inverted style={styles.loader}>
            Creating your extract...
          </Loader>
        </Dimmer>
      )}
    </Modal>
  );
};
