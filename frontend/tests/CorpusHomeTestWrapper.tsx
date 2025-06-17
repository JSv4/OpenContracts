import React, { ReactNode } from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { Provider } from "jotai";
import { CorpusHome } from "../src/components/corpuses/CorpusHome";
import { CorpusType } from "../src/types/graphql-api";
import { relayStylePagination } from "@apollo/client/utilities";
import { mergeArrayByIdFieldPolicy } from "../src/graphql/cache";

// Minimal cache identical to DocumentKnowledgeBaseTestWrapper
const createTestCache = () =>
  new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          corpuses: relayStylePagination(),
          documents: relayStylePagination(),
        },
      },
      CorpusType: { keyFields: ["id"] },
    },
  });

interface Props {
  mocks: ReadonlyArray<MockedResponse>;
  corpus: CorpusType;
}

export const CorpusHomeTestWrapper: React.FC<Props> = ({ mocks, corpus }) => {
  return (
    <Provider>
      <MockedProvider mocks={mocks} cache={createTestCache()} addTypename>
        <CorpusHome corpus={corpus} onEditDescription={() => {}} />
      </MockedProvider>
    </Provider>
  );
};
