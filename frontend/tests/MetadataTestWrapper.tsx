import React from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { InMemoryCache } from "@apollo/client";
import { Provider as JotaiProvider } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { relayStylePagination } from "@apollo/client/utilities";
import { authStatusVar } from "../src/graphql/cache";
import "semantic-ui-css/semantic.min.css";
import "react-toastify/dist/ReactToastify.css";

interface MetadataTestWrapperProps {
  children: React.ReactNode;
  mocks: ReadonlyArray<MockedResponse>;
  initialEntries?: string[];
  corpusId?: string;
}

// Create cache with metadata-specific type policies
const createMetadataTestCache = () =>
  new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          corpuses: relayStylePagination(),
          columns: relayStylePagination(),
        },
      },
      CorpusType: { keyFields: ["id"] },
      ColumnType: {
        keyFields: ["id"],
        fields: {
          // Allow these fields even if they're not in the schema
          helpText: {
            read(existing) {
              return existing || "";
            },
          },
          defaultValue: {
            read(existing) {
              return existing || null;
            },
          },
          dataType: {
            read(existing) {
              return existing || "STRING";
            },
          },
          validationConfig: {
            read(existing) {
              return existing || {};
            },
          },
          isManualEntry: {
            read(existing) {
              return existing !== undefined ? existing : true;
            },
          },
          displayOrder: {
            read(existing) {
              return existing || 0;
            },
          },
        },
      },
      DatacellType: { keyFields: ["id"] },
      FieldsetType: { keyFields: ["id"] },
    },
  });

export const MetadataTestWrapper: React.FC<MetadataTestWrapperProps> = ({
  children,
  mocks,
  initialEntries = ["/"],
  corpusId,
}) => {
  // Mark authentication as done immediately for tests
  React.useEffect(() => {
    authStatusVar("ANONYMOUS");
  }, []);

  return (
    <JotaiProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <MockedProvider
          mocks={mocks}
          cache={createMetadataTestCache()}
          addTypename
        >
          {children}
        </MockedProvider>
      </MemoryRouter>
    </JotaiProvider>
  );
};
