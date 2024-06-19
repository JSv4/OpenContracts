import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import { CorpusDropdown } from "./CorpusDropdown";
import { GET_CORPUSES } from "../../../graphql/queries";
import { selectedCorpus } from "../../../graphql/cache";

const mocks = [
  {
    request: {
      query: GET_CORPUSES,
      variables: {
        textSearch: "",
      },
    },
    result: {
      data: {
        corpuses: {
          edges: [
            {
              node: {
                id: "1",
                title: "Corpus 1",
                description: "Description 1",
              },
            },
            {
              node: {
                id: "2",
                title: "Corpus 2",
                description: "Description 2",
              },
            },
          ],
        },
      },
    },
  },
];

describe("CorpusDropdown", () => {
  it("renders corpus options and allows selection", async () => {
    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <CorpusDropdown />
      </MockedProvider>
    );

    // Wait for the loading state to finish
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    // Open the dropdown
    fireEvent.click(screen.getByText("Select Corpus"));

    // Verify the corpus options are rendered
    expect(screen.getByText("Corpus 1")).toBeInTheDocument();
    expect(screen.getByText("Corpus 2")).toBeInTheDocument();

    // Select a corpus option
    fireEvent.click(screen.getByText("Corpus 1"));

    // Verify the selected corpus is updated in the cache
    expect(selectedCorpus()).toEqual({
      id: "1",
      title: "Corpus 1",
      description: "Description 1",
    });
  });

  it("fetches corpuses based on search query", async () => {
    const searchMocks = [
      {
        request: {
          query: GET_CORPUSES,
          variables: {
            textSearch: "Corpus 1",
          },
        },
        result: {
          data: {
            corpuses: {
              edges: [
                {
                  node: {
                    id: "1",
                    title: "Corpus 1",
                    description: "Description 1",
                  },
                },
              ],
            },
          },
        },
      },
    ];

    render(
      <MockedProvider mocks={searchMocks} addTypename={false}>
        <CorpusDropdown />
      </MockedProvider>
    );

    // Wait for the loading state to finish
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    // Enter a search query
    fireEvent.change(screen.getByPlaceholderText("Select Corpus"), {
      target: { value: "Corpus 1" },
    });

    // Wait for the search results to update
    await waitFor(() => {
      expect(screen.getByText("Corpus 1")).toBeInTheDocument();
      expect(screen.queryByText("Corpus 2")).not.toBeInTheDocument();
    });
  });
});
