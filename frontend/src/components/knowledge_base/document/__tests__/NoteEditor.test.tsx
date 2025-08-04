import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MockedProvider } from "@apollo/client/testing";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { toast } from "react-toastify";
import { NoteEditor } from "../NoteEditor";
import {
  UPDATE_NOTE,
  GET_NOTE_WITH_HISTORY,
} from "../../../../graphql/mutations/noteMutations";
import { GetNoteWithHistoryQuery } from "../../../../graphql/types/NoteTypes";

// Mock toast notifications
vi.mock("react-toastify", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => (
      <button {...props}>{children}</button>
    ),
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe("NoteEditor", () => {
  const mockNoteId = "note-123";
  const mockOnClose = vi.fn();
  const mockOnUpdate = vi.fn();

  const mockNote: GetNoteWithHistoryQuery["note"] = {
    id: mockNoteId,
    title: "Test Note Title",
    content: "Test note content",
    created: "2024-01-01T00:00:00Z",
    modified: "2024-01-02T00:00:00Z",
    currentVersion: 2,
    creator: {
      id: "user-1",
      email: "test@example.com",
      username: "testuser",
    },
    document: {
      id: "doc-1",
      title: "Test Document",
    },
    revisions: [
      {
        id: "rev-2",
        version: 2,
        author: {
          id: "user-1",
          email: "test@example.com",
          username: "testuser",
        },
        created: "2024-01-02T00:00:00Z",
        diff: undefined,
        snapshot: "Test note content",
        checksumBase: undefined,
        checksumFull: undefined,
      },
      {
        id: "rev-1",
        version: 1,
        author: {
          id: "user-1",
          email: "test@example.com",
          username: "testuser",
        },
        created: "2024-01-01T00:00:00Z",
        diff: undefined,
        snapshot: "Original content",
        checksumBase: undefined,
        checksumFull: undefined,
      },
    ],
  };

  const mocks = [
    {
      request: {
        query: GET_NOTE_WITH_HISTORY,
        variables: { id: mockNoteId },
      },
      result: {
        data: {
          note: mockNote,
        },
      },
    },
  ];

  const renderComponent = (additionalMocks: any[] = []) => {
    return render(
      <MockedProvider
        mocks={[...mocks, ...additionalMocks]}
        addTypename={false}
      >
        <NoteEditor
          noteId={mockNoteId}
          isOpen={true}
          onClose={mockOnClose}
          onUpdate={mockOnUpdate}
        />
      </MockedProvider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Basic Rendering", () => {
    it("should render the editor with note data", async () => {
      renderComponent();

      // Wait for the component to load data by checking for document title
      await waitFor(() => {
        expect(screen.getByText("Test Document")).toBeInTheDocument();
      });

      // Give the component time to populate the form fields
      await waitFor(() => {
        const titleInput = screen.getByPlaceholderText("Note title...");
        expect(titleInput).toBeInTheDocument();
      });

      // Use a more flexible approach - check if the inputs exist first
      const titleInput = screen.getByPlaceholderText("Note title...");
      const contentInput = screen.getByPlaceholderText(
        "Write your note in Markdown..."
      );

      // If the values aren't populated yet, wait a bit more
      await waitFor(
        () => {
          expect(titleInput).toHaveValue("Test Note Title");
        },
        { timeout: 3000 }
      );

      await waitFor(
        () => {
          expect(contentInput).toHaveValue("Test note content");
        },
        { timeout: 3000 }
      );
    });

    it("should display document metadata", async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText("Test Document")).toBeInTheDocument();
      });

      // Use getAllByText since there might be multiple occurrences
      await waitFor(() => {
        const versionElements = screen.getAllByText(/Version 2/);
        expect(versionElements.length).toBeGreaterThan(0);
      });
    });

    it("should show edit indicator when content changes", async () => {
      renderComponent();

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Note title...")
        ).toBeInTheDocument();
      });

      const contentField = screen.getByPlaceholderText(
        "Write your note in Markdown..."
      );
      await userEvent.clear(contentField);
      await userEvent.type(contentField, "Updated content");

      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    });
  });

  describe("Saving Functionality", () => {
    it("should save changes when Save button is clicked", async () => {
      const updateMock = {
        request: {
          query: UPDATE_NOTE,
          variables: {
            noteId: mockNoteId,
            newContent: "Updated content",
            title: "Updated Title",
          },
        },
        result: {
          data: {
            updateNote: {
              ok: true,
              message: "Note updated successfully",
              version: 3,
              obj: {
                ...mockNote,
                title: "Updated Title",
                content: "Updated content",
                currentVersion: 3,
              },
            },
          },
        },
      };

      // Add a refetch mock for after the save
      const refetchMock = {
        request: {
          query: GET_NOTE_WITH_HISTORY,
          variables: { id: mockNoteId },
        },
        result: {
          data: {
            note: {
              ...mockNote,
              title: "Updated Title",
              content: "Updated content",
              currentVersion: 3,
              revisions: [
                {
                  id: "rev-3",
                  version: 3,
                  author: {
                    id: "user-1",
                    email: "test@example.com",
                    username: "testuser",
                  },
                  created: "2024-01-03T00:00:00Z",
                  diff: undefined,
                  snapshot: "Updated content",
                  checksumBase: undefined,
                  checksumFull: undefined,
                },
                ...(mockNote.revisions || []),
              ],
            },
          },
        },
      };

      renderComponent([updateMock, refetchMock]);

      // Wait for the component to load data
      await waitFor(() => {
        expect(screen.getByText("Test Document")).toBeInTheDocument();
      });

      // Wait for form fields to be populated
      await waitFor(
        () => {
          const titleField = screen.getByPlaceholderText("Note title...");
          expect(titleField).toHaveValue("Test Note Title");
        },
        { timeout: 3000 }
      );

      // Update title and content
      const titleField = screen.getByPlaceholderText("Note title...");
      await userEvent.clear(titleField);
      await userEvent.type(titleField, "Updated Title");

      const contentField = screen.getByPlaceholderText(
        "Write your note in Markdown..."
      );
      await userEvent.clear(contentField);
      await userEvent.type(contentField, "Updated content");

      // Ensure the save button is enabled after changes
      await waitFor(() => {
        const saveButton = screen.getByText("Save Changes").closest("button");
        expect(saveButton).not.toBeDisabled();
      });

      // Click save
      const saveButton = screen.getByText("Save Changes").closest("button");
      expect(saveButton).not.toBeDisabled(); // Double-check it's enabled
      await userEvent.click(saveButton!);

      // First wait for the toast message
      await waitFor(
        () => {
          expect(toast.success).toHaveBeenCalledWith(
            "Note updated! Now at version 3",
            expect.any(Object)
          );
        },
        { timeout: 3000 }
      );

      // Then check if the callback was called - sometimes this takes a bit longer
      await waitFor(
        () => {
          expect(mockOnUpdate).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );
    });

    it("should not save when there are no changes", async () => {
      renderComponent();

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText("Test Document")).toBeInTheDocument();
      });

      await waitFor(
        () => {
          const titleField = screen.getByPlaceholderText("Note title...");
          expect(titleField).toHaveValue("Test Note Title");
        },
        { timeout: 3000 }
      );

      const saveButton = screen.getByText("Save Changes").closest("button");
      expect(saveButton).toBeDisabled();
    });
  });

  describe("Version History", () => {
    it("should toggle version history panel", async () => {
      renderComponent();

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByText("Show History")).toBeInTheDocument();
      });

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText("Test Document")).toBeInTheDocument();
      });

      // Open history
      await userEvent.click(screen.getByText("Show History"));

      // Wait for history panel to appear
      await waitFor(() => {
        expect(screen.getByText("Version History")).toBeInTheDocument();
      });

      // Check for version count - use a flexible matcher
      await waitFor(() => {
        const versionText = screen.getByText(/\d+ version/);
        expect(versionText).toBeInTheDocument();
      });

      // Close history
      await userEvent.click(screen.getByText("Hide History"));
      await waitFor(() => {
        expect(screen.queryByText("Version History")).not.toBeInTheDocument();
      });
    });

    it("should display version list correctly", async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText("Show History")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Show History"));

      // Use more specific queries to avoid conflicts
      await waitFor(() => {
        // Look for version numbers in the history panel
        const versionElements = screen.getAllByText(/Version \d+/);
        expect(versionElements.length).toBeGreaterThanOrEqual(2);

        // Check for the "Current" badge
        expect(screen.getByText("Current")).toBeInTheDocument();
      });
    });

    it("should show version details when clicking on a version", async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText("Show History")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Show History"));

      // Click on version 1
      const version1Button = screen.getByText("Version 1").closest("button");
      await userEvent.click(version1Button!);

      await waitFor(() => {
        expect(screen.getByText("Version 1 snapshot")).toBeInTheDocument();
        expect(screen.getByText("Original content")).toBeInTheDocument();
        expect(screen.getByText("Reapply as New Version")).toBeInTheDocument();
        expect(screen.getByText("Edit from This Version")).toBeInTheDocument();
      });
    });

    it("should reapply version when clicking Reapply button", async () => {
      const reapplyMock = {
        request: {
          query: UPDATE_NOTE,
          variables: {
            noteId: mockNoteId,
            newContent: "Original content",
            title: "Test Note Title",
          },
        },
        result: {
          data: {
            updateNote: {
              ok: true,
              message: "Version reapplied",
              version: 3,
              obj: mockNote,
            },
          },
        },
      };

      renderComponent([reapplyMock]);

      await waitFor(() => {
        expect(screen.getByText("Show History")).toBeInTheDocument();
      });

      // Open history and select version 1
      await userEvent.click(screen.getByText("Show History"));
      const version1Button = screen.getByText("Version 1").closest("button");
      await userEvent.click(version1Button!);

      // Click reapply
      await waitFor(() => {
        expect(screen.getByText("Reapply as New Version")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Reapply as New Version"));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith(
          "Version 1 reapplied as new version 3!",
          expect.any(Object)
        );
      });
    });

    it("should load version content for editing", async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText("Show History")).toBeInTheDocument();
      });

      // Open history and select version 1
      await userEvent.click(screen.getByText("Show History"));
      const version1Button = screen.getByText("Version 1").closest("button");
      await userEvent.click(version1Button!);

      // Click edit from version
      await waitFor(() => {
        expect(screen.getByText("Edit from This Version")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Edit from This Version"));

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Write your note in Markdown...")
        ).toHaveValue("Original content");
        expect(screen.getByText("Editing from v1")).toBeInTheDocument();
        expect(toast.info).toHaveBeenCalledWith(
          "Editing from version 1. Make your changes and save."
        );
      });
    });
  });

  describe("Modal Behavior", () => {
    it("should close modal when Close button is clicked without changes", async () => {
      renderComponent();

      await waitFor(() => {
        expect(screen.getByText("Close")).toBeInTheDocument();
      });

      await userEvent.click(screen.getByText("Close"));
      expect(mockOnClose).toHaveBeenCalled();
    });

    it("should show confirmation dialog when closing with unsaved changes", async () => {
      window.confirm = vi.fn(() => true);

      renderComponent();

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Note title...")
        ).toBeInTheDocument();
      });

      // Make changes
      const contentField = screen.getByPlaceholderText(
        "Write your note in Markdown..."
      );
      await userEvent.type(contentField, " additional text");

      // Try to close
      await userEvent.click(screen.getByText("Close"));

      expect(window.confirm).toHaveBeenCalledWith(
        "You have unsaved changes. Are you sure you want to close?"
      );
      expect(mockOnClose).toHaveBeenCalled();
    });

    it("should not close modal if user cancels confirmation", async () => {
      window.confirm = vi.fn(() => false);

      renderComponent();

      await waitFor(() => {
        expect(
          screen.getByPlaceholderText("Note title...")
        ).toBeInTheDocument();
      });

      // Make changes
      const contentField = screen.getByPlaceholderText(
        "Write your note in Markdown..."
      );
      await userEvent.type(contentField, " additional text");

      // Try to close
      await userEvent.click(screen.getByText("Close"));

      expect(window.confirm).toHaveBeenCalled();
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should show error toast when save fails", async () => {
      const errorMock = {
        request: {
          query: UPDATE_NOTE,
          variables: {
            noteId: mockNoteId,
            newContent: "Updated content",
            title: undefined,
          },
        },
        error: new Error("Network error"),
      };

      renderComponent([errorMock]);

      // Wait for data to load first
      await waitFor(() => {
        expect(screen.getByText("Test Document")).toBeInTheDocument();
      });

      await waitFor(
        () => {
          const contentField = screen.getByPlaceholderText(
            "Write your note in Markdown..."
          );
          expect(contentField).toHaveValue("Test note content");
        },
        { timeout: 3000 }
      );

      // Update content
      const contentField = screen.getByPlaceholderText(
        "Write your note in Markdown..."
      );
      await userEvent.clear(contentField);
      await userEvent.type(contentField, "Updated content");

      // Try to save
      const saveButton = screen.getByText("Save Changes").closest("button");
      await userEvent.click(saveButton!);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Failed to update note");
      });
    });
  });
});
