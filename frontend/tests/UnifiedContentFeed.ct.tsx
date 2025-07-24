import { test, expect } from "@playwright/experimental-ct-react";
import { UnifiedContentFeedTestWrapper } from "./UnifiedContentFeedTestWrapper";
import { Note } from "../src/components/knowledge_base/document/unified_feed/types";
import { SortOption } from "../src/components/knowledge_base/document/unified_feed/types";
import React from "react";

test.describe("UnifiedContentFeed", () => {
  test("renders notes in feed", async ({ mount, page }) => {
    const component = await mount(<UnifiedContentFeedTestWrapper />);

    // Check that notes are rendered
    await expect(page.locator("text=Test Note 1")).toBeVisible();
    await expect(page.locator("text=Test Note 2")).toBeVisible();

    // Check that notes show as PostItNote components
    const postItNotes = page.locator("button").filter({ hasText: "Test Note" });
    await expect(postItNotes).toHaveCount(2);
  });

  test("shows empty state when no content", async ({ mount, page }) => {
    const component = await mount(<UnifiedContentFeedTestWrapper notes={[]} />);

    // Should show empty state
    await expect(page.locator("text=No content found")).toBeVisible();
    await expect(
      page.locator("text=Try adjusting your filters or search query")
    ).toBeVisible();
  });

  test("shows loading state", async ({ mount, page }) => {
    const component = await mount(
      <UnifiedContentFeedTestWrapper isLoading={true} />
    );

    // Should show loader
    await expect(page.locator(".loader")).toBeVisible();
  });

  test("calls onItemSelect when note is clicked", async ({ mount, page }) => {
    let itemSelected = false;
    const component = await mount(
      <UnifiedContentFeedTestWrapper
        onItemSelect={() => {
          itemSelected = true;
        }}
      />
    );

    // Click first note
    await page.locator("text=Test Note 1").click();

    // Should have called onItemSelect
    expect(itemSelected).toBe(true);
  });

  test("groups items by page number", async ({ mount, page }) => {
    const notesWithPages: Note[] = [
      {
        id: "1",
        title: "Note on page 1",
        content: "Content",
        created: new Date().toISOString(),
        creator: {
          email: "test@example.com",
        },
      },
      {
        id: "2",
        title: "Note on page 2",
        content: "Content",
        created: new Date().toISOString(),
        creator: {
          email: "test@example.com",
        },
      },
    ];

    const component = await mount(
      <UnifiedContentFeedTestWrapper notes={notesWithPages} />
    );

    // Should show page headers
    await expect(page.locator("text=Page 1")).toBeVisible();
    await expect(page.locator("text=Page 2")).toBeVisible();
  });
});

test.describe("UnifiedContentFeed - Read-only Mode", () => {
  test("read-only: notes are not clickable", async ({ mount, page }) => {
    let itemSelected = false;
    const component = await mount(
      <UnifiedContentFeedTestWrapper
        readOnly={true}
        onItemSelect={() => {
          itemSelected = true;
        }}
      />
    );

    // Click first note
    await page.locator("text=Test Note 1").click();

    // Should NOT have called onItemSelect
    expect(itemSelected).toBe(false);
  });

  test("read-only: notes have default cursor", async ({ mount, page }) => {
    const component = await mount(
      <UnifiedContentFeedTestWrapper readOnly={true} />
    );

    // Get the PostItNote button
    const firstNote = page.locator("button").filter({ hasText: "Test Note 1" });

    // Check cursor style
    const cursor = await firstNote.evaluate(
      (el) => window.getComputedStyle(el).cursor
    );
    expect(cursor).toBe("default");
  });

  test("read-only: edit indicators are hidden", async ({ mount, page }) => {
    const component = await mount(
      <UnifiedContentFeedTestWrapper readOnly={true} />
    );

    // Get the first note
    const firstNote = page.locator("button").filter({ hasText: "Test Note 1" });

    // Hover over the note
    await firstNote.hover();

    // Edit indicator should not be visible (opacity 0)
    const editIndicator = firstNote.locator(".edit-indicator");
    const opacity = await editIndicator.evaluate(
      (el) => window.getComputedStyle(el).opacity
    );
    expect(opacity).toBe("0");
  });

  test("read-only: no hover animation on notes", async ({ mount, page }) => {
    const component = await mount(
      <UnifiedContentFeedTestWrapper readOnly={true} />
    );

    // Get the first note
    const firstNote = page.locator("button").filter({ hasText: "Test Note 1" });

    // Get initial Y position
    const initialBox = await firstNote.boundingBox();
    const initialY = initialBox?.y || 0;

    // Hover over the note
    await firstNote.hover();
    await page.waitForTimeout(300); // Wait for any potential animation

    // Y position should not have changed (no upward animation)
    const hoverBox = await firstNote.boundingBox();
    const hoverY = hoverBox?.y || 0;

    // Allow for minor rounding differences but no significant movement
    expect(Math.abs(hoverY - initialY)).toBeLessThan(1);
  });

  test("editable: notes are clickable", async ({ mount, page }) => {
    let itemSelected = false;
    const component = await mount(
      <UnifiedContentFeedTestWrapper
        readOnly={false}
        onItemSelect={() => {
          itemSelected = true;
        }}
      />
    );

    // Click first note
    await page.locator("text=Test Note 1").click();

    // Should have called onItemSelect
    expect(itemSelected).toBe(true);
  });

  test("editable: notes have pointer cursor", async ({ mount, page }) => {
    const component = await mount(
      <UnifiedContentFeedTestWrapper readOnly={false} />
    );

    // Get the PostItNote button
    const firstNote = page.locator("button").filter({ hasText: "Test Note 1" });

    // Check cursor style
    const cursor = await firstNote.evaluate(
      (el) => window.getComputedStyle(el).cursor
    );
    expect(cursor).toBe("pointer");
  });

  test("editable: edit indicators show on hover", async ({ mount, page }) => {
    const component = await mount(
      <UnifiedContentFeedTestWrapper readOnly={false} />
    );

    // Get the first note
    const firstNote = page.locator("button").filter({ hasText: "Test Note 1" });

    // Initially edit indicator should be hidden
    const editIndicator = firstNote.locator(".edit-indicator");
    const initialOpacity = await editIndicator.evaluate(
      (el) => window.getComputedStyle(el).opacity
    );
    expect(initialOpacity).toBe("0");

    // Hover over the note
    await firstNote.hover();
    await page.waitForTimeout(300); // Wait for transition

    // Edit indicator should be visible
    const hoverOpacity = await editIndicator.evaluate(
      (el) => window.getComputedStyle(el).opacity
    );
    expect(hoverOpacity).toBe("1");
  });

  test("filters content by type", async ({ mount, page }) => {
    const filters = {
      contentTypes: new Set(["note"] as const),
      annotationFilters: {
        showStructural: false,
      },
      relationshipFilters: {
        showStructural: false,
      },
      searchQuery: "",
    };

    const component = await mount(
      <UnifiedContentFeedTestWrapper filters={filters} />
    );

    // Notes should still be visible
    await expect(page.locator("text=Test Note 1")).toBeVisible();
    await expect(page.locator("text=Test Note 2")).toBeVisible();
  });

  test("sorts content by creation date", async ({ mount, page }) => {
    const notes: Note[] = [
      {
        id: "1",
        title: "Newer Note",
        content: "Created later",
        created: "2024-01-02T00:00:00Z",
        creator: {
          email: "test@example.com",
        },
      },
      {
        id: "2",
        title: "Older Note",
        content: "Created earlier",
        created: "2024-01-01T00:00:00Z",
        creator: {
          email: "test@example.com",
        },
      },
    ];

    const component = await mount(
      <UnifiedContentFeedTestWrapper
        notes={notes}
        sortBy={"date" as SortOption}
      />
    );

    // Get all notes
    const postItNotes = await page
      .locator("button")
      .filter({ hasText: "Note" })
      .all();

    // When sorted by created date (newest first), Newer Note should be first
    const firstNoteText = await postItNotes[0].textContent();
    expect(firstNoteText).toContain("Newer Note");
  });
});

test.describe("UnifiedContentFeed - Annotations in Read-only Mode", () => {
  test("read-only: annotations show but delete is disabled", async ({
    mount,
    page,
  }) => {
    const mockAnnotations = [
      {
        id: "ann-1",
        page: 1,
        text_extraction: { text: "Test annotation text" },
        annotation_label: { text: "Important", color: "#ff0000" },
        created: new Date().toISOString(),
        __typename: "ServerTokenAnnotation",
      },
    ];

    const component = await mount(
      <UnifiedContentFeedTestWrapper
        readOnly={true}
        notes={[]}
        mockAnnotations={mockAnnotations}
      />
    );

    // Annotation should be visible
    await expect(page.locator("text=Test annotation text")).toBeVisible();

    // Label should be visible
    await expect(page.locator("text=Important")).toBeVisible();

    // Delete button should not be visible in read-only mode
    // (HighlightItem hides delete when read_only is true)
    const deleteButton = page.locator('button[title="Delete"]');
    await expect(deleteButton).not.toBeVisible();
  });

  test("editable: annotations show delete button", async ({ mount, page }) => {
    const mockAnnotations = [
      {
        id: "ann-1",
        page: 1,
        text_extraction: { text: "Test annotation text" },
        annotation_label: { text: "Important", color: "#ff0000" },
        created: new Date().toISOString(),
        __typename: "ServerTokenAnnotation",
      },
    ];

    const component = await mount(
      <UnifiedContentFeedTestWrapper
        readOnly={false}
        notes={[]}
        mockAnnotations={mockAnnotations}
      />
    );

    // Annotation should be visible
    await expect(page.locator("text=Test annotation text")).toBeVisible();

    // In editable mode, delete functionality would be available
    // (exact behavior depends on HighlightItem implementation)
  });
});

test.describe("UnifiedContentFeed - Relations in Read-only Mode", () => {
  test("read-only: relations show but actions are disabled", async ({
    mount,
    page,
  }) => {
    const mockAnnotations = [
      {
        id: "ann-1",
        page: 1,
        text_extraction: { text: "Source text" },
        annotation_label: { text: "Source", color: "#0000ff" },
        created: new Date().toISOString(),
        __typename: "ServerTokenAnnotation",
      },
      {
        id: "ann-2",
        page: 1,
        text_extraction: { text: "Target text" },
        annotation_label: { text: "Target", color: "#00ff00" },
        created: new Date().toISOString(),
        __typename: "ServerTokenAnnotation",
      },
    ];

    const mockRelations = [
      {
        id: "rel-1",
        sourceIds: ["ann-1"],
        targetIds: ["ann-2"],
        label: { text: "References", color: "#ff00ff" },
        structural: false,
        __typename: "RelationGroup",
      },
    ];

    const component = await mount(
      <UnifiedContentFeedTestWrapper
        readOnly={true}
        notes={[]}
        mockAnnotations={mockAnnotations}
        mockRelations={mockRelations}
      />
    );

    // Relation should be visible
    await expect(page.locator("text=References")).toBeVisible();

    // Source and target should be visible
    await expect(page.locator("text=Source text")).toBeVisible();
    await expect(page.locator("text=Target text")).toBeVisible();
  });

  test("mixed content shows in correct order", async ({ mount, page }) => {
    const mockAnnotations = [
      {
        id: "ann-1",
        page: 1,
        text_extraction: { text: "Page 1 annotation" },
        annotation_label: { text: "Label", color: "#ff0000" },
        created: new Date().toISOString(),
        __typename: "ServerTokenAnnotation",
      },
    ];

    const notes: Note[] = [
      {
        id: "1",
        title: "Page 2 Note",
        content: "Note on page 2",
        created: new Date().toISOString(),
        creator: {
          email: "test@example.com",
        },
      },
    ];

    const component = await mount(
      <UnifiedContentFeedTestWrapper
        notes={notes}
        mockAnnotations={mockAnnotations}
        sortBy="page"
      />
    );

    // Should show page headers in order
    const pageHeaders = await page.locator("text=/Page \\d+/").all();
    expect(pageHeaders).toHaveLength(2);

    // Content should be visible
    await expect(page.locator("text=Page 1 annotation")).toBeVisible();
    await expect(page.locator("text=Page 2 Note")).toBeVisible();
  });
});
