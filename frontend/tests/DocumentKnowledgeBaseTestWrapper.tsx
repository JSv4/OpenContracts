import React, { useEffect } from "react";
import { MockedProvider, type MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { relayStylePagination } from "@apollo/client/utilities";
import { mergeArrayByIdFieldPolicy } from "../src/graphql/cache"; // Assuming this is exported correctly
import { Provider } from "jotai"; // Import Jotai Provider
import { useAtom } from "jotai";
import { corpusStateAtom } from "../src/components/annotator/context/CorpusAtom";

import DocumentKnowledgeBase from "../src/components/knowledge_base/document/DocumentKnowledgeBase";

// --- Minimal Test Cache Definition (copied from previous step) ---
// Create a minimal cache configuration for testing based on the real cache.
// This includes essential type policies for annotations but avoids problematic
// read functions that rely on external reactive variables.
const testCache = new InMemoryCache({
  typePolicies: {
    Query: {
      fields: {
        // Use simple pagination for annotations in tests
        annotations: relayStylePagination(),
        // Include other paginated fields if needed by the component, using simple pagination
        userFeedback: relayStylePagination(),
        pageAnnotations: { keyArgs: false, merge: true }, // Simplest merge strategy
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
    // Define keyFields for core types, but NO read functions
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
      // Assuming AnnotationType is the primary type for annotations
      keyFields: ["id"],
    },
    ServerAnnotationType: {
      // Include if used distinctly
      keyFields: ["id"],
      fields: {
        // Keep simple merge policies if necessary
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
// --- End Cache Definition ---

interface WrapperProps {
  mocks: ReadonlyArray<MockedResponse>;
  documentId: string;
  corpusId: string;
}

// Create a diagnostic component to monitor atom state
const CorpusStateDebugger = () => {
  const [corpusState] = useAtom(corpusStateAtom);

  // Log whenever the atom state changes
  useEffect(() => {
    console.log("[CorpusStateDebugger] Current atom state:", corpusState);
  }, [corpusState]);

  return null; // Render nothing
};

export const DocumentKnowledgeBaseTestWrapper: React.FC<WrapperProps> = ({
  mocks,
  documentId,
  corpusId,
}) => {
  return (
    <Provider>
      <CorpusStateDebugger /> {/* Add the debugger */}
      <MockedProvider
        mocks={mocks}
        cache={testCache} // Use the test cache defined *within* this file
        addTypename={true}
        // No resolvers needed here as cache has type policies
        defaultOptions={{
          watchQuery: { errorPolicy: "all" },
          query: { errorPolicy: "all" },
          mutate: { errorPolicy: "all" },
        }}
      >
        <DocumentKnowledgeBase documentId={documentId} corpusId={corpusId} />
      </MockedProvider>
    </Provider>
  );
};
