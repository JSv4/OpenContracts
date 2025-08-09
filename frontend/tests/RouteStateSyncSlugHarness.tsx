import React, { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { MockedProvider, MockedResponse } from "@apollo/client/testing";
import { useReactiveVar } from "@apollo/client";

import { useRouteStateSync } from "../src/hooks/RouteStateSync";
import { openedCorpus, openedDocument } from "../src/graphql/cache";

export interface RouteStateSyncSlugHarnessProps {
  initialPath: string;
  mocks: ReadonlyArray<MockedResponse>;
}

const StateProbe: React.FC = () => {
  // Ensure clean slate
  useEffect(() => {
    openedCorpus(null);
    openedDocument(null);
    return () => {
      openedCorpus(null);
      openedDocument(null);
    };
  }, []);

  useRouteStateSync();
  const corpus = useReactiveVar(openedCorpus);
  const document = useReactiveVar(openedDocument);

  return (
    <div data-testid="slug-sync-state">
      <span data-testid="corpus-id">{corpus?.id ?? ""}</span>
      <span data-testid="document-id">{document?.id ?? ""}</span>
    </div>
  );
};

export const RouteStateSyncSlugHarness: React.FC<
  RouteStateSyncSlugHarnessProps
> = ({ initialPath, mocks }) => {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <MockedProvider mocks={mocks} addTypename>
        <StateProbe />
      </MockedProvider>
    </MemoryRouter>
  );
};

export default RouteStateSyncSlugHarness;
