import React from "react";
import {
  MockedProvider,
  MockedResponse,
  MockLink,
} from "@apollo/client/testing";
import { InMemoryCache, ApolloLink, Observable } from "@apollo/client";
import { Provider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { Corpuses } from "../src/views/Corpuses";
import { relayStylePagination } from "@apollo/client/utilities";
import { authStatusVar, openedCorpus } from "../src/graphql/cache";
import { OperationDefinitionNode } from "graphql";
import { mergeArrayByIdFieldPolicy } from "../src/graphql/cache";
import { GET_CORPUSES } from "../src/graphql/queries";
import { CorpusType } from "../src/types/graphql-api";

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
      ServerAnnotationType: {
        fields: {
          userFeedback: mergeArrayByIdFieldPolicy,
        },
      },
    },
  });

// Create wildcard link to respond to any GET_CORPUSES variables
const createWildcardLink = (mocks: ReadonlyArray<MockedResponse>) => {
  const mockLink = new MockLink(mocks);
  // Find canonical corpuses result once
  const corpusesResult = mocks.find(
    (m) => m.request.query === GET_CORPUSES
  )?.result;
  return new ApolloLink((operation) => {
    const isCorpusesQuery =
      operation.operationName === "GetCorpuses" ||
      operation.query === GET_CORPUSES;

    if (isCorpusesQuery && corpusesResult) {
      console.log("[MOCK] wildcard GetCorpuses", operation.variables);
      return Observable.of(corpusesResult as any);
    }

    return mockLink.request(operation) as any;
  });
};

interface WrapperProps {
  mocks: ReadonlyArray<MockedResponse>;
  initialEntries?: string[];
  initialCorpus?: CorpusType | null;
}

export const CorpusesTestWrapper: React.FC<WrapperProps> = ({
  mocks,
  initialEntries = ["/corpuses"],
  initialCorpus = null,
}) => {
  // Mark authentication as done immediately for tests
  React.useEffect(() => {
    authStatusVar("ANONYMOUS");
  }, []);

  // Ensure the openedCorpus reactive var is initialised **in the browser runtime**
  React.useEffect(() => {
    openedCorpus(initialCorpus);
  }, [initialCorpus]);

  const link = createWildcardLink(mocks);
  return (
    <Provider>
      <MemoryRouter initialEntries={initialEntries}>
        <MockedProvider link={link} cache={createTestCache()} addTypename>
          <Corpuses />
        </MockedProvider>
      </MemoryRouter>
    </Provider>
  );
};
