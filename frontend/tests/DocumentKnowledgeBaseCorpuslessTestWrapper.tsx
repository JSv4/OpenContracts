import React from "react";
import {
  MockedProvider,
  MockLink,
  type MockedResponse,
} from "@apollo/client/testing";
import { InMemoryCache, ApolloLink, Observable } from "@apollo/client";
import { relayStylePagination } from "@apollo/client/utilities";
import { mergeArrayByIdFieldPolicy } from "../src/graphql/cache";
import { Provider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import DocumentKnowledgeBase from "../src/components/knowledge_base/document/DocumentKnowledgeBase";
import { authStatusVar, authToken, userObj } from "../src/graphql/cache";
import "../src/assets/styles/semantic.css";

// Create test cache
const createTestCache = () =>
  new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          annotations: relayStylePagination(),
          userFeedback: relayStylePagination(),
          pageAnnotations: { keyArgs: false, merge: true },
          documents: relayStylePagination(),
          corpuses: relayStylePagination(),
          userexports: relayStylePagination(),
          labelsets: relayStylePagination(),
          annotationLabels: relayStylePagination(),
          relationshipLabels: relayStylePagination(),
          extracts: relayStylePagination(),
          columns: relayStylePagination(),
        },
      },
      DocumentType: {
        keyFields: ["id"],
      },
      CorpusType: {
        keyFields: ["id"],
      },
      LabelSetType: {
        keyFields: ["id"],
      },
      AnnotationType: {
        keyFields: ["id"],
      },
      ServerAnnotationType: {
        keyFields: ["id"],
        fields: {
          userFeedback: mergeArrayByIdFieldPolicy,
        },
      },
      UserFeedbackType: {
        keyFields: ["id"],
      },
      DatacellType: {
        keyFields: ["id"],
      },
      PageAwareAnnotationType: {
        fields: {
          pageAnnotations: { keyArgs: false, merge: true },
        },
      },
    },
  });

interface WrapperProps {
  mocks: ReadonlyArray<MockedResponse>;
  documentId: string;
  corpusId?: string; // Optional for corpus-less testing
  readOnly?: boolean;
  showSuccessMessage?: string;
  showCorpusInfo?: boolean;
}

export const DocumentKnowledgeBaseCorpuslessTestWrapper: React.FC<
  WrapperProps
> = ({
  mocks,
  documentId,
  corpusId,
  readOnly = false,
  showSuccessMessage,
  showCorpusInfo,
}) => {
  // Set up auth state
  authStatusVar("authenticated");
  authToken("mock-token");
  userObj({
    id: "user-123",
    email: "test@example.com",
    permissions: ["read", "write"],
  });

  // Create custom link that handles requests
  const link = new ApolloLink((operation, forward) => {
    return new Observable((observer) => {
      const { operationName } = operation;
      console.log(`[GraphQL Request] ${operationName}`, operation.variables);

      // Find matching mock
      const mock = mocks.find((m) => {
        const mockDef = m.request.query.definitions[0] as any;
        return mockDef.name?.value === operationName;
      });

      if (mock) {
        setTimeout(() => {
          console.log(`[GraphQL Response] ${operationName}`, mock.result);
          observer.next(mock.result as any);
          observer.complete();
        }, 10);
      } else {
        console.error(`[GraphQL] No mock found for ${operationName}`);
        observer.error(new Error(`No mock for ${operationName}`));
      }
    });
  });

  return (
    <MemoryRouter>
      <MockedProvider
        mocks={mocks}
        cache={createTestCache()}
        link={link}
        addTypename={false}
      >
        <Provider>
          <DocumentKnowledgeBase
            documentId={documentId}
            corpusId={corpusId}
            readOnly={readOnly}
            showSuccessMessage={showSuccessMessage}
            showCorpusInfo={showCorpusInfo}
          />
        </Provider>
      </MockedProvider>
    </MemoryRouter>
  );
};
