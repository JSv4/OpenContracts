import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MockedResponse } from "@apollo/client/testing";
import { UPDATE_ME } from "../src/graphql/mutations";
import UserSettingsModalHarness from "./UserSettingsModalHarness";

test("@slug profile modal updates user slug", async ({ mount, page }) => {
  const mocks: ReadonlyArray<MockedResponse> = [
    {
      request: {
        query: UPDATE_ME,
        variables: { slug: "Alice-Pro" },
      },
      result: {
        data: {
          updateMe: {
            ok: true,
            message: "Success",
            user: {
              __typename: "UserType",
              id: "user-1",
              username: "alice",
              slug: "Alice-Pro",
            },
          },
        },
      },
    },
  ];

  await mount(<UserSettingsModalHarness mocks={mocks} />);
  await expect(page.getByTestId("user-settings-modal")).toBeVisible();
  await page.getByPlaceholder("your-slug").fill("Alice-Pro");
  await page.getByRole("button", { name: /Save/i }).click();
  await expect(page.getByTestId("user-settings-modal")).toBeHidden({
    timeout: 3000,
  });
});
