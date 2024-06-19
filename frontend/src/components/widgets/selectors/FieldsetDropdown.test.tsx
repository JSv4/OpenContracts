import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import { FieldsetDropdown } from "./FieldsetDropdown";
import { REQUEST_GET_FIELDSETS } from "../../../graphql/queries";
import { selectedFieldset } from "../../../graphql/cache";

const mocks = [
  {
    request: {
      query: REQUEST_GET_FIELDSETS,
    },
    result: {
      data: {
        fieldsets: {
          edges: [
            {
              node: {
                id: "1",
                name: "Fieldset 1",
                description: "Description 1",
              },
            },
            {
              node: {
                id: "2",
                name: "Fieldset 2",
                description: "Description 2",
              },
            },
          ],
        },
      },
    },
  },
];

describe("FieldsetDropdown", () => {
  it("renders fieldset options and allows selection", async () => {
    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <FieldsetDropdown />
      </MockedProvider>
    );

    // Wait for the loading state to finish
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });

    // Open the dropdown
    fireEvent.click(screen.getByText("Select Fieldset"));

    // Verify the fieldset options are rendered
    expect(screen.getByText("Fieldset 1")).toBeInTheDocument();
    expect(screen.getByText("Fieldset 2")).toBeInTheDocument();

    // Select a fieldset option
    fireEvent.click(screen.getByText("Fieldset 1"));

    // Verify the selected fieldset is updated in the cache
    expect(selectedFieldset()).toEqual({
      id: "1",
      name: "Fieldset 1",
      description: "Description 1",
    });
  });

  it("displays an error message if the query fails", async () => {
    const errorMocks = [
      {
        request: {
          query: REQUEST_GET_FIELDSETS,
        },
        error: new Error("An error occurred"),
      },
    ];

    render(
      <MockedProvider mocks={errorMocks} addTypename={false}>
        <FieldsetDropdown />
      </MockedProvider>
    );

    // Wait for the error state to appear
    await waitFor(() => {
      expect(screen.getByText("Error: An error occurred")).toBeInTheDocument();
    });
  });
});
