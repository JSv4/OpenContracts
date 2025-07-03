import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import {
  openedCorpus,
  openedDocument,
  selectedAnnotationIds,
} from "../graphql/cache";
import { useRouteStateSync } from "../hooks/RouteStateSync";

// A helper component that installs the sync hook
const SyncHelper = () => {
  useRouteStateSync();
  return null;
};

const renderWithRoute = (initialPath: string) =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SyncHelper />
    </MemoryRouter>
  );

const resetVars = () => {
  openedCorpus(null);
  openedDocument(null);
  selectedAnnotationIds([]);
};

// Basic test to check that
describe("RouteStateSync", () => {
  beforeEach(resetVars);
  afterEach(resetVars);

  it("initialises corpus-only route", async () => {
    const corpusId = "corpus123";
    renderWithRoute(`/corpus/${corpusId}`);
    expect(openedCorpus()).toEqual({ id: corpusId });
    expect(openedDocument()).toBeNull();
  });

  it("initialises corpus+document route", async () => {
    const corpusId = "c1";
    const docId = "d1";
    renderWithRoute(`/corpus/${corpusId}/document/${docId}`);
    expect(openedCorpus()).toEqual({ id: corpusId });
    expect(openedDocument()).toEqual({ id: docId });
  });

  it("parses annotation ids query param", async () => {
    const corpusId = "c2";
    const docId = "d2";
    const annIds = ["a1", "a2"];
    renderWithRoute(
      `/corpus/${corpusId}/document/${docId}?ann=${annIds.join(",")}`
    );
    expect(selectedAnnotationIds()).toEqual(annIds);
  });
});
