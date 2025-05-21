import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import { FieldsetDropdown } from "./FieldsetDropdown";
import { GET_FIELDSETS } from "../../../graphql/queries";
import { selectedFieldset } from "../../../graphql/cache";

const mocks = [
  {
    request: {
      query: GET_FIELDSETS,
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
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    // Open the dropdown
    const dropdownElement = screen.getByRole("combobox");
    fireEvent.click(dropdownElement);

    // Verify the fieldset options are rendered within the listbox
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText("Fieldset 1")).toBeInTheDocument();
    expect(within(listbox).getByText("Fieldset 2")).toBeInTheDocument();

    // Select a fieldset option from the listbox
    fireEvent.click(within(listbox).getByText("Fieldset 1"));

    // Verify the selected fieldset is updated in the cache
    await waitFor(() => {
      expect(selectedFieldset()).toEqual({
        id: "1",
        name: "Fieldset 1",
        description: "Description 1",
      });
      expect(screen.getByRole("combobox")).toHaveTextContent("Fieldset 1");
    });
  });

  it("displays an error message if the query fails", async () => {
    const errorMocks = [
      {
        request: {
          query: GET_FIELDSETS,
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
