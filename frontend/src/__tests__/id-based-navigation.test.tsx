import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MockedProvider } from "@apollo/client/testing";
import { DocumentLandingRoute } from "../components/routes/DocumentLandingRoute";
import { CorpusLandingRouteV2 } from "../components/routes/CorpusLandingRouteV2";
import {
  GET_CORPUS_BY_ID_FOR_REDIRECT,
  GET_DOCUMENT_BY_ID_FOR_REDIRECT,
  RESOLVE_CORPUS_BY_SLUGS_FULL,
  RESOLVE_DOCUMENT_BY_SLUGS_FULL,
  RESOLVE_DOCUMENT_IN_CORPUS_BY_SLUGS_FULL,
} from "../graphql/queries";
import { openedCorpus, openedDocument } from "../graphql/cache";
import { isValidGraphQLId, getIdentifierType } from "../utils/idValidation";

// Mock data
const mockCorpus = {
  id: "123",
  slug: "test-corpus",
  title: "Test Corpus",
  description: "A test corpus",
  creator: {
    id: "456",
    slug: "john-doe",
    username: "john",
  },
};

const mockDocument = {
  id: "789",
  slug: "test-document",
  title: "Test Document",
  description: "A test document",
  creator: {
    id: "456",
    slug: "john-doe",
    username: "john",
  },
  corpus: mockCorpus,
};

describe("ID-based Navigation", () => {
  beforeEach(() => {
    // Reset reactive vars
    openedCorpus(null);
    openedDocument(null);
  });

  describe("ID Validation", () => {
    it("should correctly identify numeric IDs", () => {
      expect(isValidGraphQLId("123")).toBe(true);
      expect(isValidGraphQLId("456789")).toBe(true);
      expect(getIdentifierType("123")).toBe("id");
    });

    it("should correctly identify base64 encoded IDs", () => {
      const base64Id = btoa("Corpus:123");
      expect(isValidGraphQLId(base64Id)).toBe(true);
      expect(getIdentifierType(base64Id)).toBe("id");
    });

    it("should correctly identify gid: prefixed IDs", () => {
      expect(isValidGraphQLId("gid://app/Corpus/123")).toBe(true);
      expect(getIdentifierType("gid://app/Corpus/123")).toBe("id");
    });

    it("should correctly identify slugs", () => {
      expect(isValidGraphQLId("my-corpus")).toBe(false);
      expect(getIdentifierType("my-corpus")).toBe("slug");
      expect(getIdentifierType("test-document-2024")).toBe("slug");
    });
  });

  describe("Corpus ID Navigation", () => {
    it("should redirect from corpus ID to slug-based URL", async () => {
      const mocks = [
        {
          request: {
            query: GET_CORPUS_BY_ID_FOR_REDIRECT,
            variables: { id: "123" },
          },
          result: {
            data: {
              corpus: mockCorpus,
            },
          },
        },
      ];

      const navigateMock = jest.fn();

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter initialEntries={["/c/john/123"]}>
            <Routes>
              <Route
                path="/c/:userIdent/:corpusIdent"
                element={<CorpusLandingRouteV2 />}
              />
            </Routes>
          </MemoryRouter>
        </MockedProvider>
      );

      await waitFor(() => {
        // Should redirect to /c/john-doe/test-corpus
        expect(navigateMock).toHaveBeenCalledWith("/c/john-doe/test-corpus", {
          replace: true,
        });
      });
    });
  });

  describe("Document ID Navigation", () => {
    it("should redirect from document ID to slug-based URL", async () => {
      const mocks = [
        {
          request: {
            query: GET_DOCUMENT_BY_ID_FOR_REDIRECT,
            variables: { id: "789" },
          },
          result: {
            data: {
              document: mockDocument,
            },
          },
        },
      ];

      const navigateMock = jest.fn();

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter initialEntries={["/d/john/789"]}>
            <Routes>
              <Route
                path="/d/:userIdent/:docIdent"
                element={<DocumentLandingRoute />}
              />
            </Routes>
          </MemoryRouter>
        </MockedProvider>
      );

      await waitFor(() => {
        // Should redirect to /d/john-doe/test-document
        expect(navigateMock).toHaveBeenCalledWith("/d/john-doe/test-document", {
          replace: true,
        });
      });
    });

    it("should preserve query parameters when redirecting", async () => {
      const mocks = [
        {
          request: {
            query: GET_DOCUMENT_BY_ID_FOR_REDIRECT,
            variables: { id: "789" },
          },
          result: {
            data: {
              document: mockDocument,
            },
          },
        },
      ];

      const navigateMock = jest.fn();

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter initialEntries={["/d/john/789?ann=123,456"]}>
            <Routes>
              <Route
                path="/d/:userIdent/:docIdent"
                element={<DocumentLandingRoute />}
              />
            </Routes>
          </MemoryRouter>
        </MockedProvider>
      );

      await waitFor(() => {
        // Should redirect with query params preserved
        expect(navigateMock).toHaveBeenCalledWith(
          "/d/john-doe/test-document?ann=123,456",
          { replace: true }
        );
      });
    });
  });

  describe("Mixed ID and Slug Navigation", () => {
    it("should handle document ID within corpus slug context", async () => {
      const mocks = [
        {
          request: {
            query: GET_DOCUMENT_BY_ID_FOR_REDIRECT,
            variables: { id: "789" },
          },
          result: {
            data: {
              document: mockDocument,
            },
          },
        },
      ];

      const navigateMock = jest.fn();

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter initialEntries={["/d/john/test-corpus/789"]}>
            <Routes>
              <Route
                path="/d/:userIdent/:corpusIdent/:docIdent"
                element={<DocumentLandingRoute />}
              />
            </Routes>
          </MemoryRouter>
        </MockedProvider>
      );

      await waitFor(() => {
        // Should redirect to canonical URL with corpus context
        expect(navigateMock).toHaveBeenCalledWith(
          "/d/john-doe/test-corpus/test-document",
          { replace: true }
        );
      });
    });
  });

  describe("Fallback Behavior", () => {
    it("should show 404 when ID cannot be resolved", async () => {
      const mocks = [
        {
          request: {
            query: GET_DOCUMENT_BY_ID_FOR_REDIRECT,
            variables: { id: "999" },
          },
          result: {
            data: {
              document: null,
            },
          },
        },
        {
          request: {
            query: GET_CORPUS_BY_ID_FOR_REDIRECT,
            variables: { id: "999" },
          },
          result: {
            data: {
              corpus: null,
            },
          },
        },
      ];

      const navigateMock = jest.fn();

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter initialEntries={["/d/john/999"]}>
            <Routes>
              <Route
                path="/d/:userIdent/:docIdent"
                element={<DocumentLandingRoute />}
              />
              <Route path="/404" element={<div>404 Not Found</div>} />
            </Routes>
          </MemoryRouter>
        </MockedProvider>
      );

      await waitFor(() => {
        expect(navigateMock).toHaveBeenCalledWith("/404", { replace: true });
      });
    });

    it("should try slug resolution if ID resolution fails", async () => {
      const mocks = [
        {
          request: {
            query: GET_DOCUMENT_BY_ID_FOR_REDIRECT,
            variables: { id: "my-document" },
          },
          error: new Error("Not an ID"),
        },
        {
          request: {
            query: RESOLVE_DOCUMENT_BY_SLUGS_FULL,
            variables: {
              userSlug: "john",
              documentSlug: "my-document",
            },
          },
          result: {
            data: {
              documentBySlugs: {
                ...mockDocument,
                slug: "my-document",
              },
            },
          },
        },
      ];

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter initialEntries={["/d/john/my-document"]}>
            <Routes>
              <Route
                path="/d/:userIdent/:docIdent"
                element={<DocumentLandingRoute />}
              />
            </Routes>
          </MemoryRouter>
        </MockedProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("Test Document")).toBeInTheDocument();
      });
    });
  });

  describe("Single ID Navigation", () => {
    it("should handle navigation with just an ID", async () => {
      const mocks = [
        {
          request: {
            query: GET_DOCUMENT_BY_ID_FOR_REDIRECT,
            variables: { id: "789" },
          },
          result: {
            data: {
              document: mockDocument,
            },
          },
        },
      ];

      const navigateMock = jest.fn();

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter initialEntries={["/d/789"]}>
            <Routes>
              <Route path="/d/:docIdent" element={<DocumentLandingRoute />} />
            </Routes>
          </MemoryRouter>
        </MockedProvider>
      );

      await waitFor(() => {
        // Should redirect to canonical URL
        expect(navigateMock).toHaveBeenCalledWith("/d/john-doe/test-document", {
          replace: true,
        });
      });
    });
  });
});

describe("Component Close Navigation", () => {
  beforeEach(() => {
    openedCorpus(null);
    openedDocument(null);
  });

  it("should not cause full page reload when closing document", async () => {
    const originalLocation = window.location.href;

    render(
      <MockedProvider mocks={[]} addTypename={false}>
        <MemoryRouter initialEntries={["/d/john/test-doc"]}>
          <Routes>
            <Route
              path="/d/:userIdent/:docIdent"
              element={<DocumentLandingRoute />}
            />
            <Route path="/documents" element={<div>Documents List</div>} />
          </Routes>
        </MemoryRouter>
      </MockedProvider>
    );

    // Simulate closing the document
    const closeButton = screen.getByRole("button", { name: /close/i });
    closeButton.click();

    await waitFor(() => {
      // Should use React Router navigation, not window.location.href
      expect(window.location.href).toBe(originalLocation);
      expect(screen.getByText("Documents List")).toBeInTheDocument();
    });
  });

  it("should clear openedDocument reactive var on component unmount", () => {
    const { unmount } = render(
      <MockedProvider mocks={[]} addTypename={false}>
        <MemoryRouter>
          <DocumentLandingRoute />
        </MemoryRouter>
      </MockedProvider>
    );

    // Set a document as opened
    openedDocument(mockDocument as any);
    expect(openedDocument()).toBeTruthy();

    // Unmount the component
    unmount();

    // Document should be cleared
    expect(openedDocument()).toBeNull();
  });

  it("should navigate to corpus when closing document within corpus context", async () => {
    const mocks = [
      {
        request: {
          query: RESOLVE_DOCUMENT_IN_CORPUS_BY_SLUGS_FULL,
          variables: {
            userSlug: "john",
            corpusSlug: "test-corpus",
            documentSlug: "test-doc",
          },
        },
        result: {
          data: {
            corpusBySlugs: mockCorpus,
            documentInCorpusBySlugs: mockDocument,
          },
        },
      },
    ];

    render(
      <MockedProvider mocks={mocks} addTypename={false}>
        <MemoryRouter initialEntries={["/d/john/test-corpus/test-doc"]}>
          <Routes>
            <Route
              path="/d/:userIdent/:corpusIdent/:docIdent"
              element={<DocumentLandingRoute />}
            />
            <Route
              path="/c/:userIdent/:corpusIdent"
              element={<div>Corpus View</div>}
            />
          </Routes>
        </MemoryRouter>
      </MockedProvider>
    );

    await waitFor(() => {
      const closeButton = screen.getByRole("button", { name: /close/i });
      closeButton.click();
    });

    await waitFor(() => {
      expect(screen.getByText("Corpus View")).toBeInTheDocument();
    });
  });
});
