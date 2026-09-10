import React from "react";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { MemoryRouter } from "react-router-dom";
import { LabelSetDetailPage } from "../src/components/labelsets/LabelSetDetailPage";
import { openedLabelset } from "../src/graphql/cache";
import { InMemoryCache } from "@apollo/client";
import { ToastContainer } from "react-toastify";

interface LabelSetDetailPageTestWrapperProps {
  mocks: MockedResponse[];
  labelsetId: string;
  permissions?: string[];
}

// Create cache outside component like CorpusesTestWrapper does
const createTestCache = () => new InMemoryCache();

export const LabelSetDetailPageTestWrapper: React.FC<
  LabelSetDetailPageTestWrapperProps
> = ({
  mocks,
  labelsetId,
  permissions = ["read_labelset", "update_labelset", "remove_labelset"],
}) => {
  const [ready, setReady] = React.useState(false);

  // Set the reactive var in useEffect - same pattern as CorpusesTestWrapper
  React.useEffect(() => {
    openedLabelset({
      id: labelsetId,
      myPermissions: permissions,
    } as any);
    setReady(true);
  }, [labelsetId, permissions]);

  // Render component - wait for ready before rendering LabelSetDetailPage
  // Note: JotaiProvider and ApolloProvider are provided by playwright/index.tsx
  // We use MockedProvider to override the Apollo client with our mocks
  return (
    <MockedProvider mocks={mocks} cache={createTestCache()} addTypename>
      <MemoryRouter initialEntries={["/label_sets"]}>
        <ToastContainer />
        {ready ? (
          <LabelSetDetailPage />
        ) : (
          <div data-testid="setting-up">Setting up...</div>
        )}
      </MemoryRouter>
    </MockedProvider>
  );
};
