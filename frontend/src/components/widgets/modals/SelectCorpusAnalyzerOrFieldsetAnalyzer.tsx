import React, { useState, useEffect } from "react";
import {
  gql,
  Reference,
  StoreObject,
  useMutation,
  useQuery,
} from "@apollo/client";
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
  REQUEST_CREATE_EXTRACT,
  REQUEST_START_EXTRACT,
  START_ANALYSIS,
  START_DOCUMENT_EXTRACT,
  RequestCreateExtractInputType,
  RequestCreateExtractOutputType,
  RequestStartExtractInputType,
  RequestStartExtractOutputType,
  StartAnalysisInput,
  StartAnalysisOutput,
  StartDocumentExtractInput,
  StartDocumentExtractOutput,
} from "../../../graphql/mutations";
import { CorpusType, DocumentType } from "../../../graphql/types";

interface SelectAnalyzerOrFieldsetModalProps {
  corpus?: CorpusType;
  document?: DocumentType;
  open: boolean;
  onClose: () => void;
}

export const SelectAnalyzerOrFieldsetModal: React.FC<
  SelectAnalyzerOrFieldsetModalProps
> = ({ corpus, document, open, onClose }) => {
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

  const [createExtract, { loading: creatingExtract }] = useMutation<
    RequestCreateExtractOutputType,
    RequestCreateExtractInputType
  >(REQUEST_CREATE_EXTRACT, {
    update(cache, { data }) {
      if (data?.createExtract.ok && data.createExtract.obj) {
        const newExtract = data.createExtract.obj;
        cache.modify({
          fields: {
            extracts(existingExtracts = { edges: [] }) {
              const newExtractRef = cache.writeFragment({
                data: newExtract,
                fragment: gql`
                  fragment NewExtract on ExtractType {
                    id
                    name
                    started
                    corpus {
                      id
                      title
                    }
                  }
                `,
              });
              return {
                ...existingExtracts,
                edges: [
                  ...existingExtracts.edges,
                  { __typename: "ExtractTypeEdge", node: newExtractRef },
                ],
              };
            },
          },
        });
      }
    },
  });

  const [startExtract, { loading: startingExtract }] = useMutation<
    RequestStartExtractOutputType,
    RequestStartExtractInputType
  >(REQUEST_START_EXTRACT);

  const [startDocumentAnalysis, { loading: startingDocumentAnalysis }] =
    useMutation<StartAnalysisOutput, StartAnalysisInput>(START_ANALYSIS, {
      update(cache, { data }) {
        if (data?.startAnalysisOnDoc.ok && data.startAnalysisOnDoc.obj) {
          const newAnalysis = data.startAnalysisOnDoc.obj;
          cache.modify({
            fields: {
              analyses(existingAnalyses = { edges: [] }, { readField }) {
                const newAnalysisRef = cache.writeFragment({
                  data: newAnalysis,
                  fragment: gql`
                    fragment NewAnalysis on AnalysisType {
                      id
                      analysisStarted
                      analysisCompleted
                      analyzedDocuments {
                        edges {
                          node {
                            id
                          }
                        }
                      }
                      receivedCallbackFile
                      annotations {
                        totalCount
                      }
                      analyzer {
                        id
                        analyzerId
                        description
                        manifest
                        labelsetSet {
                          totalCount
                        }
                        hostGremlin {
                          id
                        }
                      }
                    }
                  `,
                });

                // Filter out any existing analysis with the same ID
                const filteredEdges = existingAnalyses.edges.filter(
                  (edge: { node: Reference | StoreObject | undefined }) =>
                    readField("id", edge.node) !== newAnalysis.id
                );

                return {
                  ...existingAnalyses,
                  edges: [
                    ...filteredEdges,
                    { __typename: "AnalysisTypeEdge", node: newAnalysisRef },
                  ],
                };
              },
            },
          });
        }
      },
    });

  const [startDocumentExtract, { loading: startingDocumentExtract }] =
    useMutation<StartDocumentExtractOutput, StartDocumentExtractInput>(
      START_DOCUMENT_EXTRACT,
      {
        update(cache, { data }) {
          if (data?.startDocumentExtract.ok && data.startDocumentExtract.obj) {
            const newExtract = data.startDocumentExtract.obj;
            cache.modify({
              fields: {
                extracts(existingExtracts = { edges: [] }, { readField }) {
                  const newExtractRef = cache.writeFragment({
                    data: newExtract,
                    fragment: gql`
                      fragment NewExtract on ExtractType {
                        id
                        name
                        started
                        corpus {
                          id
                          title
                        }
                      }
                    `,
                  });

                  // Filter out any existing extract with the same ID
                  const filteredEdges = existingExtracts.edges.filter(
                    (edge: { node: Reference | StoreObject | undefined }) =>
                      readField("id", edge.node) !== newExtract.id
                  );

                  return {
                    ...existingExtracts,
                    edges: [
                      ...filteredEdges,
                      { __typename: "ExtractTypeEdge", node: newExtractRef },
                    ],
                  };
                },
              },
            });
          }
        },
      }
    );

  useEffect(() => {
    console.log("Active tab changed", activeTab);
  }, [activeTab]);

  const handleRun = async () => {
    if (activeTab === "analyzer" && selectedItem) {
      console.log("Handle Run - for analyzer");
      try {
        const result = await startDocumentAnalysis({
          variables: {
            ...(document ? { documentId: document.id } : {}),
            analyzerId: selectedItem,
            ...(corpus ? { corpusId: corpus.id } : {}),
          },
        });
        if (result.data?.startAnalysisOnDoc.ok) {
          toast.success("Document analysis started successfully");
          onClose();
        } else {
          toast.error("Failed to start document analysis");
        }
      } catch (error) {
        toast.error("Error starting document analysis");
      }
    } else if (activeTab === "fieldset" && selectedItem) {
      if (document) {
        try {
          const result = await startDocumentExtract({
            variables: {
              documentId: document.id,
              fieldsetId: selectedItem,
              corpusId: corpus?.id,
            },
          });
          if (result.data?.startDocumentExtract.ok) {
            toast.success("Document extract started successfully");
            onClose();
          } else {
            toast.error("Failed to start document extract");
          }
        } catch (error) {
          toast.error("Error starting document extract");
        }
      } else if (corpus) {
        console.log("Create extract for corpus", corpus);
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
              toast.success("Corpus extract created and started successfully");
              onClose();
            } else {
              toast.error("Failed to start corpus extract");
            }
          } else {
            toast.error("Failed to create corpus extract");
          }
        } catch (error) {
          toast.error("Error creating or starting corpus extract");
        }
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
            {!document && (
              <Form.Input
                fluid
                label="Extract Name"
                placeholder="Enter extract name"
                value={extractName}
                onChange={(e, { value }) => setExtractName(value)}
              />
            )}
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
    <Modal
      open={open}
      onClose={onClose}
      style={{ zIndex: 999999 }}
      className="high-z-index-modal"
    >
      <Modal.Header>
        Select {activeTab === "analyzer" ? "Analyzer" : "Fieldset"} for{" "}
        {document ? document.title : corpus?.title}
      </Modal.Header>
      <Modal.Content>
        {(loadingAnalyzers ||
          loadingFieldsets ||
          creatingExtract ||
          startingExtract ||
          startingDocumentAnalysis ||
          startingDocumentExtract) && (
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
          disabled={
            !selectedItem ||
            (activeTab === "fieldset" && !document && !extractName)
          }
        >
          Run
        </Button>
      </Modal.Actions>
    </Modal>
  );
};
