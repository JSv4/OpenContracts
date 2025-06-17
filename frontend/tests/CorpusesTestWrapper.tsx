import React from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { Provider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { Corpuses } from "../src/views/Corpuses";
import { relayStylePagination } from "@apollo/client/utilities";

// Create minimal cache similar to DocumentKnowledgeBaseTestWrapper
const createTestCache = () =>
  new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          corpuses: relayStylePagination(),
        },
      },
      CorpusType: { keyFields: ["id"] },
    },
  });

interface WrapperProps {
  mocks: ReadonlyArray<MockedResponse>;
  initialEntries?: string[];
}

export const CorpusesTestWrapper: React.FC<WrapperProps> = ({
  mocks,
  initialEntries = ["/corpuses"],
}) => {
  return (
    <Provider>
      <MemoryRouter initialEntries={initialEntries}>
        <MockedProvider mocks={mocks} cache={createTestCache()} addTypename>
          <Corpuses />
        </MockedProvider>
      </MemoryRouter>
    </Provider>
  );
};
