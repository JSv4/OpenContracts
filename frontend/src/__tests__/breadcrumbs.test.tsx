import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { openedCorpus, openedDocument } from "../graphql/cache";
import { CorpusBreadcrumbs } from "../components/corpuses/CorpusBreadcrumbs";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom"
  );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  } as any;
});

const mockNavigate = vi.fn();

beforeEach(() => {
  mockNavigate.mockReset();
  openedCorpus({ id: "c1", title: "Test" } as any);
  openedDocument({ id: "d1", description: "Doc" } as any);
});

describe("CorpusBreadcrumbs", () => {
  it("clears selection and navigates on root click", () => {
    const { getByText } = render(
      <MemoryRouter>
        <CorpusBreadcrumbs />
      </MemoryRouter>
    );

    const corpusesLink = getByText("Corpuses");
    fireEvent.click(corpusesLink);

    expect(openedCorpus()).toBeNull();
    expect(openedDocument()).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith("/corpuses");
  });
});
