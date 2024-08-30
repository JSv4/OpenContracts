import React, { useState, useEffect } from "react";
import { useMutation, useQuery } from "@apollo/client";
import {
  Modal,
  Button,
  Dimmer,
  Loader,
  Tab,
  Form,
  Message,
} from "semantic-ui-react";
import { toast } from "react-toastify";
import {
  GET_ANALYZERS,
  GET_FIELDSETS,
  GetAnalyzersInputs,
  GetAnalyzersOutputs,
  GetFieldsetsInputs,
  GetFieldsetsOutputs,
} from "../../../graphql/queries";
import {
  START_ANALYSIS_FOR_CORPUS,
  REQUEST_CREATE_EXTRACT,
  REQUEST_START_EXTRACT,
  StartAnalysisInputType,
  StartAnalysisOutputType,
  RequestCreateExtractInputType,
  RequestCreateExtractOutputType,
  RequestStartExtractInputType,
  RequestStartExtractOutputType,
} from "../../../graphql/mutations";
import { AnalyzerType, FieldsetType, CorpusType } from "../../../graphql/types";

interface SelectCorpusAnalyzerOrFieldsetModalProps {
  corpus: CorpusType;
  open: boolean;
  onClose: () => void;
}

export const SelectCorpusAnalyzerOrFieldsetModal: React.FC<
  SelectCorpusAnalyzerOrFieldsetModalProps
> = ({ corpus, open, onClose }) => {
  const [activeTab, setActiveTab] = useState<"analyzer" | "fieldset">(
    "analyzer"
  );
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [extractName, setExtractName] = useState<string>("");

  const { loading: loadingAnalyzers, data: analyzersData } = useQuery<
    GetAnalyzersOutputs,
    GetAnalyzersInputs
  >(GET_ANALYZERS);
  const { loading: loadingFieldsets, data: fieldsetsData } = useQuery<
    GetFieldsetsOutputs,
    GetFieldsetsInputs
  >(GET_FIELDSETS);

  const [startAnalysis, { loading: startingAnalysis }] = useMutation<
    StartAnalysisOutputType,
    StartAnalysisInputType
  >(START_ANALYSIS_FOR_CORPUS);
  const [createExtract, { loading: creatingExtract }] = useMutation<
    RequestCreateExtractOutputType,
    RequestCreateExtractInputType
  >(REQUEST_CREATE_EXTRACT);
  const [startExtract, { loading: startingExtract }] = useMutation<
    RequestStartExtractOutputType,
    RequestStartExtractInputType
  >(REQUEST_START_EXTRACT);

  useEffect(() => {
    console.log("Active tab changed", activeTab);
  }, [activeTab]);

  const handleRun = async () => {
    if (activeTab === "analyzer" && selectedItem) {
      try {
        console.log("Try to run analyzer");
        const result = await startAnalysis({
          variables: { analyzerId: selectedItem, corpusId: corpus.id },
        });
        if (result.data?.startAnalysisOnCorpus.ok) {
          toast.success("Analysis started successfully");
          onClose();
        } else {
          toast.error("Failed to start analysis");
        }
      } catch (error) {
        toast.error("Error starting analysis");
      }
    } else if (activeTab === "fieldset" && selectedItem) {
      try {
        const createResult = await createExtract({
          variables: {
            corpusId: corpus.id,
            name: extractName,
            fieldsetId: selectedItem,
          },
        });
        if (createResult.data?.createExtract.ok) {
          const startResult = await startExtract({
            variables: { extractId: createResult.data.createExtract.obj.id },
          });
          if (startResult.data?.startExtract.ok) {
            toast.success("Extract created and started successfully");
            onClose();
          } else {
            toast.error("Failed to start extract");
          }
        } else {
          toast.error("Failed to create extract");
        }
      } catch (error) {
        toast.error("Error creating or starting extract");
      }
    }
  };

  const panes = [
    {
      menuItem: "Analyzer",
      render: () => (
        <Tab.Pane>
          <Form>
            <Form.Select
              fluid
              label="Select Analyzer"
              options={
                analyzersData?.analyzers.edges.map((edge) => ({
                  key: edge.node.id,
                  text: edge.node.description,
                  value: edge.node.id,
                })) || []
              }
              onChange={(_, { value }) => setSelectedItem(value as string)}
            />
          </Form>
        </Tab.Pane>
      ),
    },
    {
      menuItem: "Fieldset",
      render: () => (
        <Tab.Pane>
          <Form>
            <Form.Input
              fluid
              label="Extract Name"
              placeholder="Enter extract name"
              value={extractName}
              onChange={(e, { value }) => setExtractName(value)}
            />
            <Form.Select
              fluid
              label="Select Fieldset"
              options={
                fieldsetsData?.fieldsets.edges.map((edge) => ({
                  key: edge.node.id,
                  text: edge.node.name,
                  value: edge.node.id,
                })) || []
              }
              onChange={(_, { value }) => setSelectedItem(value as string)}
            />
          </Form>
        </Tab.Pane>
      ),
    },
  ];

  return (
    <Modal open={open} onClose={onClose}>
      <Modal.Header>
        Select {activeTab === "analyzer" ? "Analyzer" : "Fieldset"} for{" "}
        {corpus.title}
      </Modal.Header>
      <Modal.Content>
        {(loadingAnalyzers ||
          loadingFieldsets ||
          startingAnalysis ||
          creatingExtract ||
          startingExtract) && (
          <Dimmer active>
            <Loader>Loading...</Loader>
          </Dimmer>
        )}
        <Tab
          panes={panes}
          onTabChange={(_, data) => {
            setActiveTab(data.activeIndex === 0 ? "analyzer" : "fieldset");
            setSelectedItem(null);
          }}
        />
        {selectedItem && (
          <Message positive>
            <Message.Header>
              {activeTab === "analyzer" ? "Analyzer" : "Fieldset"} selected
            </Message.Header>
            <p>
              {activeTab === "analyzer"
                ? analyzersData?.analyzers.edges.find(
                    (edge) => edge.node.id === selectedItem
                  )?.node.description
                : fieldsetsData?.fieldsets.edges.find(
                    (edge) => edge.node.id === selectedItem
                  )?.node.name}
            </p>
          </Message>
        )}
      </Modal.Content>
      <Modal.Actions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          positive
          onClick={handleRun}
          disabled={!selectedItem || (activeTab === "fieldset" && !extractName)}
        >
          Run
        </Button>
      </Modal.Actions>
    </Modal>
  );
};
