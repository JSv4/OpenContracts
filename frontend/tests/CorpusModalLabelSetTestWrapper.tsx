import React, { useState } from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import {
  CorpusModal,
  CorpusFormData,
} from "../src/components/corpuses/CorpusModal";
import {
  GET_CORPUS_CREATE_DEFAULTS,
  GET_EMBEDDERS,
  GET_LABELSETS,
} from "../src/graphql/queries";
import { GET_CORPUS_CATEGORIES } from "../src/graphql/landing-queries";
import { labelsetNodes } from "./LabelSetSelectorTestWrapper";

const defaultLabelset = {
  ...labelsetNodes[0],
  title: "Default Labels",
  isDefault: true,
};
const mocks: MockedResponse[] = [
  {
    request: { query: GET_CORPUS_CREATE_DEFAULTS },
    result: {
      data: { pipelineSettings: { defaultEmbedder: null }, defaultLabelset },
    },
  },
  {
    request: { query: GET_LABELSETS },
    variableMatcher: () => true,
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: {
      data: {
        labelsets: {
          edges: [defaultLabelset, labelsetNodes[1]].map((node) => ({ node })),
          pageInfo: {
            hasNextPage: false,
            hasPreviousPage: false,
            startCursor: null,
            endCursor: null,
          },
        },
      },
    },
  },
  {
    request: { query: GET_EMBEDDERS },
    result: { data: { pipelineComponents: { embedders: [] } } },
  },
  {
    request: { query: GET_CORPUS_CATEGORIES },
    result: { data: { corpusCategories: { edges: [] } } },
  },
];

export const CorpusModalLabelSetTestWrapper = () => {
  const [submitted, setSubmitted] = useState<CorpusFormData>();
  return (
    <MockedProvider mocks={mocks} addTypename={false}>
      <div>
        <CorpusModal
          open
          mode="CREATE"
          onClose={() => {}}
          onSubmit={setSubmitted}
        />
        <output data-testid="submitted-corpus">
          {JSON.stringify(submitted)}
        </output>
      </div>
    </MockedProvider>
  );
};
