import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { CorpusRequiredEmptyState } from "../src/components/common/CorpusRequiredEmptyState";

test.describe("CorpusRequiredEmptyState", () => {
  test("should render with feature name", async ({ mount, page }) => {
    let addToCorpusClicked = false;

    await mount(
      <CorpusRequiredEmptyState
        feature="Document Chat"
        onAddToCorpus={() => {
          addToCorpusClicked = true;
        }}
      />
    );

    // Check that feature name is displayed
    await expect(
      page.locator("text=Document Chat requires corpus membership")
    ).toBeVisible();

    // Check description is shown
    await expect(
      page.locator(
        "text=Add this document to one of your corpuses to enable collaborative features"
      )
    ).toBeVisible();

    // Check icon is displayed
    await expect(page.locator(".icon.folder.open.outline")).toBeVisible();
  });

  test("should call onAddToCorpus when button clicked", async ({
    mount,
    page,
  }) => {
    let addToCorpusClicked = false;

    await mount(
      <CorpusRequiredEmptyState
        feature="Annotations"
        onAddToCorpus={() => {
          addToCorpusClicked = true;
        }}
      />
    );

    // Click the Add to Corpus button
    await page.locator("button:has-text('Add to Corpus')").click();

    // Verify callback was called
    await page.waitForTimeout(100); // Give time for state update
    expect(addToCorpusClicked).toBe(true);
  });

  test("should render consistently for different features", async ({
    mount,
    page,
  }) => {
    const features = [
      "AI Chat",
      "Data Extraction",
      "Collaborative Annotations",
    ];

    for (const feature of features) {
      await mount(
        <CorpusRequiredEmptyState feature={feature} onAddToCorpus={() => {}} />
      );

      // Check that each feature name is properly displayed
      await expect(
        page.locator(`text=${feature} requires corpus membership`)
      ).toBeVisible();

      // Clear for next iteration
      await page.reload();
    }
  });
});
