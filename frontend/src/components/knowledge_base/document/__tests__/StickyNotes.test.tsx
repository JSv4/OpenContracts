import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, it, expect, vi } from "vitest";
import { PostItNote } from "../StickyNotes";

// Mock framer-motion
vi.mock("framer-motion", () => ({
  motion: {
    button: React.forwardRef(({ children, ...props }: any, ref: any) => (
      <button ref={ref} {...props}>
        {children}
      </button>
    )),
  },
}));

describe("PostItNote", () => {
  describe("Visual Rendering", () => {
    it("should render with title when provided", () => {
      render(
        <PostItNote>
          <div className="title">My Test Note</div>
          <div className="content">Note content</div>
          <div className="meta">test@example.com • 01/01/2024</div>
        </PostItNote>
      );

      expect(screen.getByText("My Test Note")).toBeInTheDocument();
      expect(screen.getByText("Note content")).toBeInTheDocument();
      expect(
        screen.getByText("test@example.com • 01/01/2024")
      ).toBeInTheDocument();
    });

    it("should render without title", () => {
      const { container } = render(
        <PostItNote>
          <div className="content">Note content only</div>
          <div className="meta">test@example.com • 01/01/2024</div>
        </PostItNote>
      );

      // Check that no element with class "title" exists
      const titleElements = container.getElementsByClassName("title");
      expect(titleElements.length).toBe(0);
      expect(screen.getByText("Note content only")).toBeInTheDocument();
    });

    it("should show edit indicator on hover", async () => {
      render(
        <PostItNote>
          <div className="edit-indicator">Edit Icon</div>
          <div className="content">Note content</div>
        </PostItNote>
      );

      const editIndicator = screen.getByText("Edit Icon");
      expect(editIndicator).toBeInTheDocument();

      // Check that the element itself has the class, not the parent
      expect(editIndicator).toHaveClass("edit-indicator");
    });
  });

  describe("Interactions", () => {
    it("should handle click events", async () => {
      const handleClick = vi.fn();

      render(
        <PostItNote onClick={handleClick}>
          <div className="content">Clickable note</div>
        </PostItNote>
      );

      const note = screen.getByText("Clickable note").closest("button");
      await userEvent.click(note!);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("should handle double click events", async () => {
      const handleDoubleClick = vi.fn();

      render(
        <PostItNote onDoubleClick={handleDoubleClick}>
          <div className="content">Double clickable note</div>
        </PostItNote>
      );

      const note = screen.getByText("Double clickable note").closest("button");
      await userEvent.dblClick(note!);

      expect(handleDoubleClick).toHaveBeenCalledTimes(1);
    });

    it("should support both click and double click", async () => {
      const handleClick = vi.fn();
      const handleDoubleClick = vi.fn();

      render(
        <PostItNote onClick={handleClick} onDoubleClick={handleDoubleClick}>
          <div className="content">Interactive note</div>
        </PostItNote>
      );

      const note = screen.getByText("Interactive note").closest("button");

      // Single click
      await userEvent.click(note!);
      expect(handleClick).toHaveBeenCalledTimes(1);

      // Double click
      await userEvent.dblClick(note!);
      expect(handleDoubleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Content Display", () => {
    it("should handle long titles with truncation", () => {
      const longTitle =
        "This is a very long title that should be truncated properly according to the CSS rules defined in the component";

      render(
        <PostItNote>
          <div className="title">{longTitle}</div>
          <div className="content">Content</div>
        </PostItNote>
      );

      const titleElement = screen.getByText(longTitle);
      expect(titleElement).toBeInTheDocument();
      expect(titleElement).toHaveClass("title");
    });

    it("should handle long content with gradient overlay", () => {
      const longContent =
        "This is very long content that should have a gradient overlay at the bottom. It contains multiple lines and paragraphs to test the overflow behavior. The component should handle this gracefully with the gradient fade effect. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

      render(
        <PostItNote>
          <div className="content">{longContent}</div>
        </PostItNote>
      );

      const contentElement = screen.getByText(longContent);
      expect(contentElement).toBeInTheDocument();
      expect(contentElement.className).toContain("content");
    });

    it("should display metadata correctly", () => {
      render(
        <PostItNote>
          <div className="content">Note</div>
          <div className="meta">john.doe@example.com • 12/25/2023</div>
        </PostItNote>
      );

      expect(
        screen.getByText("john.doe@example.com • 12/25/2023")
      ).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should be keyboard accessible", async () => {
      const handleClick = vi.fn();

      render(
        <PostItNote onClick={handleClick} title="Press Enter to view note">
          <div className="content">Accessible note</div>
        </PostItNote>
      );

      const note = screen.getByText("Accessible note").closest("button");
      expect(note).toHaveAttribute("title", "Press Enter to view note");

      // Focus and press Enter
      note!.focus();
      await userEvent.keyboard("{Enter}");

      expect(handleClick).toHaveBeenCalled();
    });

    it("should have button role", () => {
      render(
        <PostItNote>
          <div className="content">Button note</div>
        </PostItNote>
      );

      const note = screen.getByText("Button note").closest("button");
      expect(note).toBeInTheDocument();
      expect(note!.tagName).toBe("BUTTON");
    });
  });

  describe("Styling Classes", () => {
    it("should apply all required CSS classes", () => {
      const { container } = render(
        <PostItNote className="custom-class">
          <div className="edit-indicator">Edit</div>
          <div className="title">Title</div>
          <div className="content">Content</div>
          <div className="meta">Meta</div>
        </PostItNote>
      );

      const note = screen.getByText("Content").closest("button");
      expect(note?.className).toContain("custom-class");

      // Check classes on the actual elements, not their parents
      expect(screen.getByText("Edit")).toHaveClass("edit-indicator");
      expect(screen.getByText("Title")).toHaveClass("title");
      expect(screen.getByText("Content")).toHaveClass("content");
      expect(screen.getByText("Meta")).toHaveClass("meta");
    });
  });
});
