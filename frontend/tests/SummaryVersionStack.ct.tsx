import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { SummaryVersionStack } from "../src/components/knowledge_base/document/floating_summary_preview/SummaryVersionStack";
import { DocumentSummaryRevision } from "../src/components/knowledge_base/document/floating_summary_preview/graphql/documentSummaryQueries";

/* --------------------------------------------------------------------------
 * Mock data
 * -------------------------------------------------------------------------- */
const createMockVersions = (count: number): DocumentSummaryRevision[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `rev-${count - i}`,
    version: count - i,
    created: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
    snapshot: `# Summary v${count - i}\n\nThis is version ${
      count - i
    } of the document summary.`,
    diff: "",
    author: {
      id: `user-${(i % 3) + 1}`,
      username: `user${(i % 3) + 1}`,
      email: `user${(i % 3) + 1}@example.com`,
    },
  }));
};

/* --------------------------------------------------------------------------
 * Tests
 * -------------------------------------------------------------------------- */

test.use({ viewport: { width: 500, height: 400 } });

test("renders empty state when no versions", async ({ mount, page }) => {
  await mount(
    <SummaryVersionStack
      versions={[]}
      isExpanded={true}
      isFanned={false}
      onFanToggle={() => {}}
      loading={false}
    />
  );

  await expect(page.locator("text=No summary versions yet.")).toBeVisible();
  await expect(
    page.locator("text=Create your first summary to get started!")
  ).toBeVisible();
});

test("renders loading state", async ({ mount, page }) => {
  await mount(
    <SummaryVersionStack
      versions={[]}
      isExpanded={true}
      isFanned={false}
      onFanToggle={() => {}}
      loading={true}
    />
  );

  // Semantic UI Loader should be visible
  await expect(page.locator(".ui.loader")).toBeVisible();
});

test("renders stacked cards when collapsed", async ({ mount, page }) => {
  const versions = createMockVersions(5);

  await mount(
    <SummaryVersionStack
      versions={versions}
      isExpanded={true}
      isFanned={false}
      onFanToggle={() => {}}
      loading={false}
    />
  );

  // Should show first 3 cards
  await expect(page.locator("text=v5")).toBeVisible();
  await expect(page.locator("text=v4")).toBeVisible();
  await expect(page.locator("text=v3")).toBeVisible();

  // Should show "Show all" button
  await expect(page.locator("text=Show all 5")).toBeVisible();

  // Should not show navigation
  await expect(
    page.locator('button:has(svg[class*="lucide-chevron-left"])')
  ).not.toBeVisible();
});

test("fans out cards and shows navigation when expanded", async ({
  mount,
  page,
}) => {
  const versions = createMockVersions(5);
  let fannedState = false;

  await mount(
    <SummaryVersionStack
      versions={versions}
      isExpanded={true}
      isFanned={fannedState}
      onFanToggle={() => {
        fannedState = !fannedState;
      }}
      loading={false}
    />
  );

  // Click to fan out
  await page.locator("text=Show all 5").click();

  // Remount with fanned state
  await mount(
    <SummaryVersionStack
      versions={versions}
      isExpanded={true}
      isFanned={true}
      onFanToggle={() => {}}
      loading={false}
    />
  );

  // Navigation should be visible
  await expect(
    page.locator('button:has(svg[class*="lucide-chevron-left"])')
  ).toBeVisible();
  await expect(
    page.locator('button:has(svg[class*="lucide-chevron-right"])')
  ).toBeVisible();

  // Version indicator
  await expect(page.locator("text=1 / 5")).toBeVisible();

  // Collapse button
  await expect(page.locator("text=Collapse")).toBeVisible();
});

test("navigates through cards with buttons", async ({ mount, page }) => {
  const versions = createMockVersions(5);

  await mount(
    <SummaryVersionStack
      versions={versions}
      isExpanded={true}
      isFanned={true}
      onFanToggle={() => {}}
      loading={false}
    />
  );

  const leftArrow = page.locator(
    'button:has(svg[class*="lucide-chevron-left"])'
  );
  const rightArrow = page.locator(
    'button:has(svg[class*="lucide-chevron-right"])'
  );

  // Initially at position 1
  await expect(page.locator("text=1 / 5")).toBeVisible();
  await expect(leftArrow).toBeDisabled();

  // Navigate right
  await rightArrow.click();
  await expect(page.locator("text=2 / 5")).toBeVisible();

  // Navigate right again
  await rightArrow.click();
  await expect(page.locator("text=3 / 5")).toBeVisible();

  // Navigate to end
  await rightArrow.click();
  await rightArrow.click();
  await expect(page.locator("text=5 / 5")).toBeVisible();
  await expect(rightArrow).toBeDisabled();

  // Navigate back
  await leftArrow.click();
  await expect(page.locator("text=4 / 5")).toBeVisible();
});

test("triggers onVersionClick when card is clicked", async ({
  mount,
  page,
}) => {
  const versions = createMockVersions(3);
  let clickedVersion: number | undefined;

  await mount(
    <SummaryVersionStack
      versions={versions}
      isExpanded={true}
      isFanned={false}
      onFanToggle={() => {}}
      onVersionClick={(version) => {
        clickedVersion = version;
      }}
      loading={false}
    />
  );

  // Click on v2 card
  const v2Card = page.locator("text=Summary preview for version 2").first();
  await v2Card.click();

  await page.waitForTimeout(100);
  expect(clickedVersion).toBe(2);
});

test("shows author information on cards", async ({ mount, page }) => {
  const versions = createMockVersions(3);

  await mount(
    <SummaryVersionStack
      versions={versions}
      isExpanded={true}
      isFanned={false}
      onFanToggle={() => {}}
      loading={false}
      currentContent="# Current Content\n\nThis is the latest version."
    />
  );

  // Should show author emails
  await expect(page.locator("text=user1@example.com").first()).toBeVisible();
  await expect(page.locator("text=user2@example.com").first()).toBeVisible();
});

test("supports drag/swipe gestures when fanned", async ({ mount, page }) => {
  const versions = createMockVersions(5);

  await mount(
    <SummaryVersionStack
      versions={versions}
      isExpanded={true}
      isFanned={true}
      onFanToggle={() => {}}
      loading={false}
    />
  );

  // Initial position
  await expect(page.locator("text=1 / 5")).toBeVisible();

  // Simulate swipe left (should go to next)
  const cardsWrapper = page.locator('[style*="cursor: grab"]').first();
  const box = await cardsWrapper.boundingBox();

  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2);
    await page.mouse.up();

    // Should have moved to next card
    await expect(page.locator("text=2 / 5")).toBeVisible();
  }
});

test("handles single version gracefully", async ({ mount, page }) => {
  const versions = createMockVersions(1);

  await mount(
    <SummaryVersionStack
      versions={versions}
      isExpanded={true}
      isFanned={false}
      onFanToggle={() => {}}
      loading={false}
    />
  );

  // Should show the single card
  await expect(page.locator("text=v1")).toBeVisible();

  // Should not show "Show all" button
  await expect(page.locator("text=Show all")).not.toBeVisible();
});

test("displays latest badge on first card", async ({ mount, page }) => {
  const versions = createMockVersions(3);

  await mount(
    <SummaryVersionStack
      versions={versions}
      isExpanded={true}
      isFanned={false}
      onFanToggle={() => {}}
      loading={false}
    />
  );

  // First card should have "Latest" badge
  await expect(page.locator("text=v3 (Latest)")).toBeVisible();
});
