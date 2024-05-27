import React from "react";
import { render, screen } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import { REQUEST_GET_EXTRACT } from "../graphql/queries";
import { ExtractDataGrid } from "../extracts/ExtractDataGrid";
import { generateMockLanguageModel } from "./utils/factories";

const mockExtractId = "1";

const mockExtract = {
  id: "1",
  corpus: {
    id: "1",
    title: "Test Corpus",
  },
  name: "Test Extract",
  fieldset: {
    id: "1",
    name: "Test Fieldset",
    columns: [
      {
        id: "1",
        query: "Test Query 1",
        languageModel: {
          id: "12324",
          model: "GPT4",
        },
      },
      {
        id: "2",
        query: "Test Query 2",
        languageModel: {
          id: "12324",
          model: "GPT4",
        },
      },
    ],
  },
  owner: {
    id: "1",
    username: "testuser",
  },
  created: "2023-06-12T10:00:00",
  started: null,
  finished: null,
  rows: [
    {
      id: "1",
      data: {
        data: "Test Data 1",
      },
      dataDefinition: "str",
      stacktrace: "",
      failed: null,
      finished: null,
      completed: null,
      started: null,
      column: {
        id: "1",
        languageModel: {
          id: "12312",
        },
      },
    },
  ],
};

const mockGetExtractQuery = {
  request: {
    query: REQUEST_GET_EXTRACT,
    variables: { id: mockExtractId },
  },
  result: {
    data: {
      extract: {
        id: mockExtractId,
      },
    },
  },
};

describe("ExtractDataGrid", () => {
  it("renders the data grid with correct data", async () => {
    render(
      <MockedProvider mocks={[mockGetExtractQuery]}>
        <ExtractDataGrid extractId={mockExtractId} />
      </MockedProvider>
    );

    expect(await screen.findByText("Test Query 1")).toBeInTheDocument();
    expect(screen.getByText("Test Query 2")).toBeInTheDocument();
    expect(screen.getByText("Test Data 1")).toBeInTheDocument();
    expect(screen.getByText("Test Data 2")).toBeInTheDocument();
  });

  it("renders the start extract button when the extract has not started", async () => {
    const mockExtractNotStarted = {
      ...mockExtract,
      started: null,
    };

    const mockGetExtractQueryNotStarted = {
      request: {
        query: REQUEST_GET_EXTRACT,
        variables: { id: mockExtractId },
      },
      result: {
        data: {
          extract: mockExtractNotStarted,
        },
      },
    };

    render(
      <MockedProvider mocks={[mockGetExtractQueryNotStarted]}>
        <ExtractDataGrid extractId={mockExtractId} />
      </MockedProvider>
    );

    expect(await screen.findByText("Start Extract")).toBeInTheDocument();
  });
});
