import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MockedProvider } from "@apollo/client/testing";
import { ColumnDetails } from "../extracts/ColumnDetails";
import { ColumnType } from "../graphql/types";
import { generateMockUser } from "./utils/factories";

const mockFieldsetId = "1";
const mockOnSave = jest.fn();

const mockColumn: ColumnType = {
  id: "1",
  query: "test query",
  matchText: "test match",
  outputType: "string",
  limitToLabel: "test label",
  instructions: "test instructions",
  languageModel: {
    id: "1",
    model: "test model",
  },
  agentic: false,
  fieldset: {
    id: "213214",
    owner: generateMockUser(),
    name: "The set to be",
    description: "Everyone's favorite hang",
    columns: [],
  },
};

describe("ColumnDetails", () => {
  it("renders the form with correct values", () => {
    render(
      <MockedProvider>
        <ColumnDetails
          column={mockColumn}
          fieldsetId={mockFieldsetId}
          onSave={mockOnSave}
        />
      </MockedProvider>
    );

    expect(screen.getByLabelText("Query")).toHaveValue(mockColumn.query);
    expect(screen.getByLabelText("Match Text")).toHaveValue(
      mockColumn.matchText
    );
    expect(screen.getByLabelText("Output Type")).toHaveValue(
      mockColumn.outputType
    );
    expect(screen.getByLabelText("Limit to Label")).toHaveValue(
      mockColumn.limitToLabel
    );
    expect(screen.getByLabelText("Instructions")).toHaveValue(
      mockColumn.instructions
    );
    expect(screen.getByLabelText("Language Model")).toHaveValue(
      mockColumn.languageModel.id
    );
    expect(screen.getByLabelText("Agentic")).not.toBeChecked();
  });

  it("calls onSave when the save button is clicked", () => {
    render(
      <MockedProvider>
        <ColumnDetails
          column={mockColumn}
          fieldsetId={mockFieldsetId}
          onSave={mockOnSave}
        />
      </MockedProvider>
    );

    fireEvent.click(screen.getByText("Save"));
    expect(mockOnSave).toHaveBeenCalled();
  });
});
