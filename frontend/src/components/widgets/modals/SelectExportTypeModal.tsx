/**
 * SelectExportTypeModal
 *
 * This modal allows the user to:
 * 1) Choose an export type from a dropdown, e.g. OpenContracts, FUNSD, etc.
 * 2) Fetch available post-processors from the API.
 * 3) Select one or more post-processors to run on the exported data.
 * 4) For each selected post-processor that defines an inputSchema,
 *    present a dynamically generated JSON schema form to collect user input.
 * 5) Submit these postProcessors and their corresponding user inputKwargs to the export mutation.
 *
 * The result of the export is a file that is post-processed according to the user's selections here.
 */

import {
  SyntheticEvent,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  ApolloError,
  useLazyQuery,
  useMutation,
  useReactiveVar,
} from "@apollo/client";
import { toast } from "react-toastify";
import {
  Button,
  Dropdown,
  DropdownProps,
  Modal,
  Message,
  Header,
  Loader,
  DropdownItemProps,
} from "semantic-ui-react";
import { exportingCorpus } from "../../../graphql/cache";
import {
  StartExportCorpusInputs,
  StartExportCorpusOutputs,
  START_EXPORT_CORPUS,
} from "../../../graphql/mutations";
import {
  GET_POST_PROCESSORS,
  GetPostprocessorsInput,
  GetPostprocessorsOutput,
} from "../../../graphql/queries";

// For JSON schema forms:
import { SemanticUIForm } from "@rjsf/semantic-ui";
import { RJSFSchema } from "@rjsf/utils";
import validator from "@rjsf/validator-ajv8";

import funsd_icon from "../../../assets/icons/FUNSD.png";
import open_contracts_icon from "../../../assets/icons/oc_45_dark.png";
import { ExportTypes } from "../../types";
import { PipelineComponentType } from "../../../types/graphql-api";

// Inside the component, update/add these styles
const styles = {
  modalContent: {
    maxHeight: "70vh",
    overflowY: "auto" as const,
    padding: "1.5rem",
  },
  section: {
    marginBottom: "2.5rem",
    "&:last-child": {
      marginBottom: "1rem",
    },
  },
  processorForm: {
    padding: "1.5rem",
    border: "1px solid #e8e8e8",
    borderRadius: "8px",
    backgroundColor: "#fafafa",
    marginTop: "1.2rem",
    boxShadow: "0 2px 4px rgba(0,0,0,0.03)",
    transition: "all 0.2s ease",
    "&:hover": {
      boxShadow: "0 4px 8px rgba(0,0,0,0.06)",
      borderColor: "#e0e0e0",
    },
  },
  processorHeader: {
    display: "flex" as const,
    alignItems: "center",
    gap: "0.75rem",
    marginBottom: "1.5rem",
    borderBottom: "1px solid #f0f0f0",
    paddingBottom: "0.75rem",
  },
  processorDescription: {
    color: "#666",
    fontSize: "0.9em",
    fontStyle: "italic",
  },
  loadingWrapper: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "300px",
  },
  formatIcon: {
    width: "24px",
    height: "24px",
    marginRight: "0.5rem",
    opacity: 0.85,
  },
  messageList: {
    "& .item": {
      padding: "0.5rem 0",
      borderBottom: "1px solid #f5f5f5",
      "&:last-child": {
        borderBottom: "none",
      },
    },
  },
};

// Add these custom base styles
const customFormStyles = {
  field: {
    marginBottom: "1.5rem",
  },
  description: {
    color: "#666",
    fontSize: "0.9em",
    marginBottom: "0.5rem",
    fontStyle: "italic",
  },
  arrayField: {
    backgroundColor: "#fff",
    padding: "1rem",
    borderRadius: "6px",
    border: "1px solid #e0e0e0",
  },
  arrayItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.5rem",
  },
};

export function SelectExportTypeModal({ visible }: { visible: boolean }) {
  const exporting_corpus = useReactiveVar(exportingCorpus);

  /* State for main export format selection. */
  const [exportFormat, setExportFormat] = useState<ExportTypes>(
    ExportTypes.OPEN_CONTRACTS
  );

  /**
   * State: available post processors (fetched from server).
   */
  const [availablePostProcessors, setAvailablePostProcessors] = useState<
    PipelineComponentType[]
  >([]);

  /**
   * State: which post processors user selected from dropdown.
   */
  const [selectedPostProcessors, setSelectedPostProcessors] = useState<
    string[]
  >([]);

  /**
   * Each post-processor might have a JSON schema for user input (input_schema).
   * We store the user's input in an object keyed by post processor name,
   * so that we can pass it all into inputKwargs.
   */
  const [postProcessorKwargs, setPostProcessorKwargs] = useState<{
    [processorName: string]: any;
  }>({});

  /**
   * GraphQL: to fetch post processors via GET_POST_PROCESSORS
   */
  const [fetchPostProcessors, { loading: loadingProcessors }] = useLazyQuery<
    GetPostprocessorsOutput, // For brevity; ideally we'd have a typed interface for the full possible data shape.
    GetPostprocessorsInput
  >(GET_POST_PROCESSORS, {
    onCompleted: (data) => {
      // data.pipelineComponents.postProcessors is the array
      if (
        data?.pipelineComponents?.postProcessors &&
        Array.isArray(data.pipelineComponents.postProcessors)
      ) {
        setAvailablePostProcessors(data.pipelineComponents.postProcessors);
      }
    },
    onError: (err) => {
      toast.error(`Failed to load post-processors: ${err.message}`);
    },
    fetchPolicy: "network-only",
  });

  /**
   * GraphQL: start export mutation
   */
  const [startExportCorpus] = useMutation<
    StartExportCorpusOutputs,
    StartExportCorpusInputs
  >(START_EXPORT_CORPUS, {
    onCompleted: () => {
      toast.success(
        "SUCCESS! Export started. Check export status under the user menu dropdown in the top right."
      );
      exportingCorpus(null);
    },
    onError: (err: ApolloError) => {
      toast.error(`Could Not Start Export: ${err.message}`);
    },
  });

  /**
   * When the modal becomes visible, fetch the list of post-processors if not yet loaded.
   */
  useEffect(() => {
    if (visible) {
      fetchPostProcessors();
    }
  }, [visible, fetchPostProcessors]);

  /**
   * Handler for user selecting an export format (ENUM).
   */
  const handleExportFormatChange = useCallback(
    (_event: SyntheticEvent<HTMLElement, Event>, data: DropdownProps): void => {
      if (Object.values<string>(ExportTypes).includes(`${data.value}`)) {
        setExportFormat(
          ExportTypes[`${data.value}` as keyof typeof ExportTypes]
        );
      }
    },
    []
  );

  /**
   * Handler for user selecting multiple post processors from the dropdown.
   */
  const handleSelectedProcessorsChange = useCallback(
    (_event: SyntheticEvent<HTMLElement, Event>, data: DropdownProps): void => {
      // data.value should be an array of strings
      if (Array.isArray(data.value)) {
        // Clear out any old postProcessorKwargs that are no longer selected
        const newSelected = data.value as string[];
        const newKwargs: { [key: string]: any } = {};
        newSelected.forEach((procName) => {
          // Keep existing data if we had it
          newKwargs[procName] = postProcessorKwargs[procName] ?? {};
        });
        setPostProcessorKwargs(newKwargs);
        setSelectedPostProcessors(newSelected);
      }
    },
    [postProcessorKwargs]
  );

  /**
   * Dynamically build the multi-select options for post-processors, e.g. { key, text, value } objects.
   */
  const postProcessorDropdownOptions = useMemo<DropdownItemProps[]>(() => {
    return availablePostProcessors.map((pproc) => ({
      key: pproc.name || "unknownPostProcessor",
      text: pproc.name,
      value: pproc.moduleName,
    }));
  }, [availablePostProcessors]);

  /**
   * If the user is changing data in the JSON schema form, update in local state.
   */
  const onPostProcessorFormChange = useCallback(
    (processorName: string, formData: any) => {
      setPostProcessorKwargs((prev) => ({
        ...prev,
        [processorName]: formData,
      }));
    },
    []
  );

  /**
   * Trigger the mutation that starts the corpus export.
   * This includes the selected export format, selected post-processors,
   * and the user-provided inputKwargs from those processors' JSON forms.
   */
  const triggerCorpusExport = useCallback(() => {
    if (exporting_corpus) {
      startExportCorpus({
        variables: {
          corpusId: exporting_corpus?.id,
          exportFormat,
          postProcessors: selectedPostProcessors,
          inputKwargs: postProcessorKwargs,
        },
      });
    }
  }, [
    exporting_corpus,
    exportFormat,
    postProcessorKwargs,
    selectedPostProcessors,
    startExportCorpus,
  ]);

  /**
   * Renders the JSON schema form for each selected post-processor, if it has a not-empty input_schema.
   */
  const renderPostProcessorForms = useMemo(() => {
    return selectedPostProcessors.map((procName) => {
      const procObj = availablePostProcessors.find(
        (p) => p.moduleName === procName
      );
      if (!procObj?.inputSchema || typeof procObj.inputSchema !== "object") {
        return null;
      }

      return (
        <div key={procName} style={styles.processorForm}>
          <div style={styles.processorHeader}>
            <Header as="h4" style={{ margin: 0 }}>
              <u>{procObj.title || procName} Inputs</u>:
            </Header>
          </div>
          <SemanticUIForm
            schema={{
              type: "object",
              properties: procObj.inputSchema as RJSFSchema,
            }}
            validator={validator}
            formData={postProcessorKwargs[procName] || {}}
            onChange={(e: { formData: any }) =>
              onPostProcessorFormChange(procName, e.formData)
            }
            uiSchema={{
              "ui:submitButtonOptions": { norender: true },
            }}
          >
            <></>
          </SemanticUIForm>
        </div>
      );
    });
  }, [
    selectedPostProcessors,
    availablePostProcessors,
    postProcessorKwargs,
    onPostProcessorFormChange,
  ]);

  /**
   * The dropdown options for the export type (we still allow 3 classic ones here).
   */
  const dropdown_options = useMemo(
    () => [
      {
        key: ExportTypes.OPEN_CONTRACTS,
        text: "Open Contracts",
        value: ExportTypes.OPEN_CONTRACTS,
        image: { avatar: true, src: open_contracts_icon },
      },
      {
        key: ExportTypes.FUNSD,
        text: "FUNSD",
        value: ExportTypes.FUNSD,
        image: { avatar: true, src: funsd_icon },
      },
    ],
    []
  );

  return (
    <Modal
      size="small"
      open={visible}
      onClose={() => exportingCorpus(null)}
      closeOnDimmerClick={false}
    >
      <Modal.Header>
        <Header as="h2" style={{ margin: 0 }}>
          Export Corpus
          {loadingProcessors && (
            <Loader active inline size="tiny" style={{ marginLeft: "1rem" }} />
          )}
        </Header>
      </Modal.Header>

      <Modal.Content style={styles.modalContent}>
        {loadingProcessors ? (
          <div style={styles.loadingWrapper}>
            <Loader active size="large">
              Loading Export Options...
            </Loader>
          </div>
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
          >
            <div style={styles.section}>
              <Message
                info
                style={{
                  boxShadow: "none",
                  border: "1px solid #b8daff",
                  borderRadius: "6px",
                }}
              >
                <Message.Header style={{ marginBottom: "1rem" }}>
                  Available Export Formats
                </Message.Header>
                <Message.List style={styles.messageList}>
                  <Message.Item>
                    <img
                      src={open_contracts_icon}
                      style={styles.formatIcon}
                      alt=""
                    />
                    <strong>OpenContracts:</strong> Complete archive with
                    annotated PDFs and metadata
                  </Message.Item>
                  <Message.Item>
                    <img src={funsd_icon} style={styles.formatIcon} alt="" />
                    <strong>FUNSD:</strong> Standard format for form
                    understanding tasks
                  </Message.Item>
                </Message.List>
              </Message>

              <Header size="small" style={{ marginTop: "1rem" }}>
                Export Format
              </Header>
              <Dropdown
                fluid
                selection
                placeholder="Select Export Type"
                options={dropdown_options}
                onChange={handleExportFormatChange}
                value={exportFormat}
              />
            </div>

            <div style={styles.section}>
              <Header size="small">Post-Processing Options</Header>
              <Message info size="tiny">
                Select optional post-processors to transform your export data
              </Message>

              <Dropdown
                fluid
                multiple
                search
                selection
                placeholder="Select Post-Processors"
                options={postProcessorDropdownOptions}
                onChange={handleSelectedProcessorsChange}
                value={selectedPostProcessors}
                style={{ marginTop: "0.5rem" }}
              />

              {selectedPostProcessors.length > 0 && (
                <div style={{ marginTop: "1rem" }}>
                  {renderPostProcessorForms}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal.Content>

      <Modal.Actions
        style={{
          background: "#f8f9fa",
          padding: "1rem",
          borderTop: "1px solid #dee2e6",
        }}
      >
        <Button
          negative
          onClick={() => exportingCorpus(null)}
          disabled={loadingProcessors}
          basic
        >
          Cancel
        </Button>
        <Button
          positive
          onClick={triggerCorpusExport}
          disabled={loadingProcessors || !exportFormat}
          loading={loadingProcessors}
          style={{
            background: "#28a745",
            boxShadow: "0 2px 4px rgba(40,167,69,0.1)",
          }}
        >
          Start Export
        </Button>
      </Modal.Actions>
    </Modal>
  );
}
