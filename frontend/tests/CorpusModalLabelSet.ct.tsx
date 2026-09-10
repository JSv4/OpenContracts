import React from "react";
import { test, expect } from "./utils/coverage";
import { CorpusModalLabelSetTestWrapper } from "./CorpusModalLabelSetTestWrapper";

test.describe("CorpusModal label set selection", () => {
  for (const clearSelection of [false, true]) {
    test(`displays and submits ${
      clearSelection ? "a cleared selection" : "the chosen label set"
    }`, async ({ mount, page }) => {
      await mount(<CorpusModalLabelSetTestWrapper />);
      const selector = page
        .getByText("Label Set:", { exact: true })
        .locator("..");
      await expect(selector.locator(".oc-dropdown__value")).toHaveText(
        "Default Labels"
      );
      await selector.getByRole("combobox").click();
      await page
        .getByRole("option")
        .filter({ hasText: "Financial Labels" })
        .click();
      await expect(selector.locator(".oc-dropdown__value")).toHaveText(
        "Financial Labels"
      );
      if (clearSelection) {
        await selector.locator(".oc-dropdown__clear").click();
        await expect(selector.locator(".oc-dropdown__placeholder")).toHaveText(
          "Choose a label set"
        );
      }
      await page
        .getByPlaceholder("Enter corpus title")
        .fill("Selected Labels Corpus");
      await page
        .getByPlaceholder("Describe what this corpus is about...")
        .fill("A corpus using the selected label set.");
      await page
        .getByRole("button", { name: "Create Corpus", exact: true })
        .click();
      await expect(page.getByTestId("submitted-corpus")).toContainText(
        `"labelSet":${clearSelection ? "null" : '"ls-2"'}`
      );
    });
  }
});
