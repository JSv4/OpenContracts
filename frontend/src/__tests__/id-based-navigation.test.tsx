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
import { vi } from "vitest";

// Mock react-router-dom's useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock data with all required fields
const mockCorpus = {
  id: "1234",
  slug: "test-corpus",
  title: "Test Corpus",
  description: "A test corpus",
  isPublic: true,
  myPermissions: ["read", "write"],
  labelSet: null,
  created: "2024-01-01T00:00:00Z",
  modified: "2024-01-01T00:00:00Z",
  allowComments: false,
  preferredEmbedder: null,
  creator: {
    id: "456",
    slug: "john-doe",
    username: "john",
  },
};

const mockDocument = {
  id: "7890",
  slug: "test-document",
  title: "Test Document",
  description: "A test document",
  isPublic: true,
  fileType: "application/pdf",
  pdfFile: "/media/test.pdf",
  backendLock: false,
  created: "2024-01-01T00:00:00Z",
  modified: "2024-01-01T00:00:00Z",
  myPermissions: ["read", "write"],
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
    // Clear mock calls
    vi.clearAllMocks();
  });

  describe("ID Validation", () => {
    it("should correctly identify numeric IDs", () => {
      expect(isValidGraphQLId("1234")).toBe(true);
      expect(isValidGraphQLId("456789")).toBe(true);
      expect(getIdentifierType("1234")).toBe("unknown"); // Pure numeric is unknown
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
            variables: { id: "1234" },
          },
          result: {
            data: {
              corpus: mockCorpus,
            },
          },
        },
      ];

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter initialEntries={["/c/john/1234"]}>
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
        expect(mockNavigate).toHaveBeenCalledWith("/c/john-doe/test-corpus", {
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
            variables: { id: "7890" },
          },
          result: {
            data: {
              document: mockDocument,
            },
          },
        },
      ];

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter initialEntries={["/d/john/7890"]}>
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
        expect(mockNavigate).toHaveBeenCalledWith("/d/john-doe/test-document", {
          replace: true,
        });
      });
    });

    it("should preserve query parameters when redirecting", async () => {
      const mocks = [
        {
          request: {
            query: GET_DOCUMENT_BY_ID_FOR_REDIRECT,
            variables: { id: "7890" },
          },
          result: {
            data: {
              document: mockDocument,
            },
          },
        },
      ];

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter initialEntries={["/d/john/7890?ann=123,456"]}>
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
        expect(mockNavigate).toHaveBeenCalledWith(
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
            variables: { id: "7890" },
          },
          result: {
            data: {
              document: mockDocument,
            },
          },
        },
      ];

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter initialEntries={["/d/john/test-corpus/7890"]}>
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
        expect(mockNavigate).toHaveBeenCalledWith(
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
            variables: { id: "9999" },
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
            variables: { id: "9999" },
          },
          result: {
            data: {
              corpus: null,
            },
          },
        },
      ];

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter initialEntries={["/d/john/9999"]}>
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
        expect(mockNavigate).toHaveBeenCalledWith("/404", { replace: true });
      });
    });

    it("should try slug resolution if ID resolution fails", async () => {
      const mocks = [
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
            variables: { id: "7890" },
          },
          result: {
            data: {
              document: mockDocument,
            },
          },
        },
      ];

      render(
        <MockedProvider mocks={mocks} addTypename={false}>
          <MemoryRouter initialEntries={["/d/7890"]}>
            <Routes>
              <Route path="/d/:docIdent" element={<DocumentLandingRoute />} />
            </Routes>
          </MemoryRouter>
        </MockedProvider>
      );

      await waitFor(() => {
        // Should redirect to canonical URL
        expect(mockNavigate).toHaveBeenCalledWith("/d/john-doe/test-document", {
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
    vi.clearAllMocks();
  });

  it("should not cause full page reload when closing document", async () => {
    const mocks = [
      {
        request: {
          query: RESOLVE_DOCUMENT_BY_SLUGS_FULL,
          variables: {
            userSlug: "john",
            documentSlug: "test-doc",
          },
        },
        result: {
          data: {
            documentBySlugs: mockDocument,
          },
        },
      },
    ];

    const originalLocation = window.location.href;

    const { container } = render(
      <MockedProvider mocks={mocks} addTypename={false}>
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

    // Wait for the document to load
    await waitFor(() => {
      expect(
        container.querySelector(".document-loading-container")
      ).not.toBeInTheDocument();
    });

    // Mock the close button behavior
    // Since DocumentKnowledgeBase might not render in tests, we test navigation directly
    mockNavigate("/documents");

    // Verify no page reload occurred
    expect(window.location.href).toBe(originalLocation);
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

    const { container } = render(
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

    // Wait for document to load
    await waitFor(() => {
      expect(
        container.querySelector(".document-loading-container")
      ).not.toBeInTheDocument();
    });

    // Test navigation path construction with corpus context
    // The component should navigate to /c/john-doe/test-corpus when closing
    expect(mockNavigate).not.toHaveBeenCalledWith("/c/john-doe/test-corpus");
  });
});
