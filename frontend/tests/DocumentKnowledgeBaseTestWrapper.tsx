import React, { useEffect } from "react";
import {
  MockedProvider,
  MockLink,
  type MockedResponse,
} from "@apollo/client/testing";
import { InMemoryCache, ApolloLink, Observable } from "@apollo/client";
import { relayStylePagination } from "@apollo/client/utilities";
import { mergeArrayByIdFieldPolicy } from "../src/graphql/cache"; // Assuming this is exported correctly
import { Provider } from "jotai"; // Import Jotai Provider
import { useAtom } from "jotai";
import { corpusStateAtom } from "../src/components/annotator/context/CorpusAtom";
import { PermissionTypes } from "../src/components/types";
import { LabelType } from "../src/components/annotator/types/enums";
import { OperationDefinitionNode } from "graphql";

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

// Build a link that handles addAnnotation mutations wildcard and falls back to the MockLink for other operations
const createWildcardLink = (mocks: ReadonlyArray<MockedResponse>) => {
  const defaultMockLink = new MockLink(mocks);
  return new ApolloLink((operation) => {
    // Look for the addAnnotation mutation by checking both operation name and query document
    const opDocument = operation.query.definitions.find(
      (def) =>
        def.kind === "OperationDefinition" && def.operation === "mutation"
    ) as OperationDefinitionNode | undefined;

    // Print operations being processed to help with debugging
    console.log(
      `[LINK DEBUG] Processing operation: ${operation.operationName}`
    );

    // Check if it's our mutation either by operationName or by query inspection
    const isAddAnnotationMutation =
      operation.operationName === "AddAnnotation" ||
      (opDocument?.selectionSet?.selections.some(
        (selection) =>
          selection.kind === "Field" && selection.name.value === "addAnnotation"
      ) ??
        false);

    if (isAddAnnotationMutation) {
      console.log(`[LINK HIT] Intercepted addAnnotation mutation`);
      const vars = operation.variables;
      console.log(
        "[MOCK HIT] REQUEST_ADD_ANNOTATION with variables:",
        JSON.stringify(vars, null, 2)
      );
      console.log("--- MUTATION MOCK EXECUTED ---");
      return Observable.of({
        data: {
          addAnnotation: {
            __typename: "AddAnnotationPayload",
            ok: true,
            annotation: {
              __typename: "AnnotationType",
              id: "new-annot-1",
              page: vars.page,
              rawText: (vars.rawText?.substring(0, 50) ?? "") + "...",
              bounds: {
                __typename: "BoundingBoxType",
                left: 100,
                top: 100,
                right: 200,
                bottom: 200,
                page: vars.page,
              },
              json: vars.json,
              isPublic: false,
              approved: false,
              rejected: false,
              structural: false,
              annotation_created: new Date().toISOString(),
              annotationType: vars.annotationType,
              myPermissions: [
                PermissionTypes.CAN_UPDATE,
                PermissionTypes.CAN_READ,
              ],
              annotationLabel: {
                __typename: "AnnotationLabelType",
                id: vars.annotationLabelId,
                icon: null,
                description: "A person entity",
                color: "#FF0000",
                text: "Person",
                labelType: LabelType.TokenLabel,
              },
              sourceNodeInRelationships: {
                __typename: "RelationshipTypeConnection",
                edges: [],
              },
              creator: {
                __typename: "UserType",
                id: "user-1",
                email: "test@test.com",
              },
            },
          },
        },
      });
    }
    // Delegate other operations to the default MockLink
    return defaultMockLink.request(operation) as any;
  });
};

export const DocumentKnowledgeBaseTestWrapper: React.FC<WrapperProps> = ({
  mocks,
  documentId,
  corpusId,
}) => {
  // Create a link that handles wildcard mutation and other mocks
  const link = createWildcardLink(mocks);
  return (
    <Provider>
      <CorpusStateDebugger />
      <MockedProvider
        // Use our custom link instead of relying on default mocks matching
        link={link}
        cache={testCache}
        addTypename={true}
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
