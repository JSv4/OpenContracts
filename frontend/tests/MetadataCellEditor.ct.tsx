import React from "react";
import { test, expect } from "@playwright/experimental-ct-react";
import { MetadataCellEditor } from "../src/components/metadata/editors/MetadataCellEditor";
import { MetadataDataType } from "../src/types/metadata";
import { createMockColumn } from "./factories/metadataFactories";

test.describe("MetadataCellEditor", () => {
  test("renders string editor", async ({ mount, page }) => {
    const column = createMockColumn({
      dataType: MetadataDataType.STRING,
      validationRules: { max_length: 50 },
    });

    const handleChange = () => {};

    await mount(
      <MetadataCellEditor
        column={column}
        value="Initial value"
        onChange={handleChange}
      />
    );

    const input = page.getByRole("textbox");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("Initial value");
    await expect(input).toHaveAttribute("maxlength", "50");
  });

  test("renders text editor (textarea)", async ({ mount, page }) => {
    const column = createMockColumn({
      dataType: MetadataDataType.TEXT,
    });

    await mount(
      <MetadataCellEditor
        column={column}
        value={"Multi\nline\ntext"}
        onChange={() => {}}
      />
    );

    const textarea = page.getByRole("textbox");
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue("Multi\nline\ntext");
    await expect(textarea.evaluate((el) => el.tagName)).resolves.toBe(
      "TEXTAREA"
    );
  });

  test("renders number editor", async ({ mount, page }) => {
    const column = createMockColumn({
      dataType: MetadataDataType.NUMBER,
      validationRules: { min_value: 0, max_value: 100 },
    });

    await mount(
      <MetadataCellEditor column={column} value={50} onChange={() => {}} />
    );

    const input = page.getByRole("spinbutton");
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute("type", "number");
    await expect(input).toHaveValue("50");
    await expect(input).toHaveAttribute("min", "0");
    await expect(input).toHaveAttribute("max", "100");
  });

  test("renders boolean editor (checkbox)", async ({ mount, page }) => {
    const column = createMockColumn({
      dataType: MetadataDataType.BOOLEAN,
    });

    await mount(
      <MetadataCellEditor column={column} value={true} onChange={() => {}} />
    );

    const checkbox = page.getByRole("checkbox");
    await expect(checkbox).toBeVisible();
    await expect(checkbox).toBeChecked();
  });

  test("renders date editor", async ({ mount, page }) => {
    const column = createMockColumn({
      dataType: MetadataDataType.DATE,
      validationRules: {
        min_date: "2024-01-01",
        max_date: "2024-12-31",
      },
    });

    await mount(
      <MetadataCellEditor
        column={column}
        value="2024-06-15"
        onChange={() => {}}
      />
    );

    const input = page.getByRole("textbox");
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute("type", "date");
    await expect(input).toHaveValue("2024-06-15");
    await expect(input).toHaveAttribute("min", "2024-01-01");
    await expect(input).toHaveAttribute("max", "2024-12-31");
  });

  test("renders select editor for choices", async ({ mount, page }) => {
    const column = createMockColumn({
      dataType: MetadataDataType.STRING,
      validationRules: {
        choices: ["Option A", "Option B", "Option C"],
      },
    });

    await mount(
      <MetadataCellEditor
        column={column}
        value="Option B"
        onChange={() => {}}
      />
    );

    const select = page.getByRole("combobox");
    await expect(select).toBeVisible();
    await expect(select.locator("div.text").first()).toHaveText("Option B");

    // Semantic UI Dropdown doesn't use <option> elements
    // Instead, we should click to open the dropdown and check the menu items
    await select.click();

    const menuItems = page.locator(".ui.dropdown .menu .item");
    await expect(menuItems).toHaveCount(3); // No empty option in clearable dropdown
    await expect(menuItems.nth(0)).toHaveText("Option A");
    await expect(menuItems.nth(1)).toHaveText("Option B");
    await expect(menuItems.nth(2)).toHaveText("Option C");
  });

  test("renders JSON editor", async ({ mount, page }) => {
    const column = createMockColumn({
      dataType: MetadataDataType.JSON,
    });

    const jsonValue = { key: "value", nested: { a: 1 } };

    await mount(
      <MetadataCellEditor
        column={column}
        value={jsonValue}
        onChange={() => {}}
      />
    );

    const textarea = page.getByRole("textbox");
    await expect(textarea).toBeVisible();
    await expect(textarea).toHaveValue(JSON.stringify(jsonValue, null, 2));
  });

  test("shows validation feedback in real-time", async ({ mount, page }) => {
    const column = createMockColumn({
      dataType: MetadataDataType.NUMBER,
      validationRules: { min_value: 0, max_value: 100 },
    });

    let validationState = true;
    const handleValidationChange = (isValid: boolean) => {
      validationState = isValid;
    };

    const component = await mount(
      <MetadataCellEditor
        column={column}
        value={50}
        onChange={() => {}}
        onValidationChange={handleValidationChange}
      />
    );

    const input = page.getByRole("spinbutton");

    // Valid value - should show success
    await input.fill("75");
    await component.update(
      <MetadataCellEditor
        column={column}
        value={75}
        onChange={() => {}}
        onValidationChange={handleValidationChange}
      />
    );
    await page.waitForTimeout(100); // Give time for icon to render
    await expect(page.getByTestId("validation-icon-success")).toBeVisible();

    // Invalid value - should show error
    await input.fill("150");
    await component.update(
      <MetadataCellEditor
        column={column}
        value={150}
        onChange={() => {}}
        onValidationChange={handleValidationChange}
      />
    );
    await expect(page.getByTestId("validation-icon-error")).toBeVisible();
    await expect(page.getByText("Must be ≤ 100")).toBeVisible();

    // Another invalid case
    await input.fill("-10");
    await component.update(
      <MetadataCellEditor
        column={column}
        value={-10}
        onChange={() => {}}
        onValidationChange={handleValidationChange}
      />
    );
    await expect(page.getByTestId("validation-icon-error")).toBeVisible();
    await expect(page.getByText("Must be ≥ 0")).toBeVisible();
  });

  test("handles onChange callback", async ({ mount, page }) => {
    const column = createMockColumn({
      dataType: MetadataDataType.STRING,
    });

    let capturedValue = "";
    const handleChange = (value: any) => {
      capturedValue = value;
    };

    const component = await mount(
      <MetadataCellEditor column={column} value="" onChange={handleChange} />
    );

    const input = page.getByRole("textbox");
    await input.fill("New value");

    // The component is controlled, so we need to re-render with the new value
    await component.update(
      <MetadataCellEditor
        column={column}
        value={"New value"}
        onChange={handleChange}
      />
    );

    expect(capturedValue).toBe("New value");
  });

  test("handles boolean toggle", async ({ mount, page }) => {
    const column = createMockColumn({
      dataType: MetadataDataType.BOOLEAN,
    });

    let capturedValue = false;
    const handleChange = (value: boolean) => {
      capturedValue = value;
    };

    const component = await mount(
      <MetadataCellEditor
        column={column}
        value={false}
        onChange={handleChange}
      />
    );

    const checkbox = page.getByRole("checkbox");
    await expect(checkbox).not.toBeChecked();

    // Click the label or container instead of using check()
    const checkboxContainer = page.locator(".ui.checkbox");
    await checkboxContainer.click();

    // Wait for the onChange to be called
    await page.waitForTimeout(200);
    expect(capturedValue).toBe(true);

    await component.update(
      <MetadataCellEditor
        column={column}
        value={true}
        onChange={handleChange}
      />
    );

    await expect(checkbox).toBeChecked();
  });

  test("validates JSON input", async ({ mount, page }) => {
    const column = createMockColumn({
      dataType: MetadataDataType.JSON,
    });

    const component = await mount(
      <MetadataCellEditor
        column={column}
        value={{}}
        onChange={() => {}}
        onValidationChange={() => {}}
      />
    );

    const textarea = page.getByRole("textbox");

    // Valid JSON
    await textarea.fill('{"valid": "json"}');
    await component.update(
      <MetadataCellEditor
        column={column}
        value={JSON.parse('{"valid": "json"}')}
        onChange={() => {}}
        onValidationChange={() => {}}
      />
    );
    await page.waitForTimeout(100); // Give time for icon to render
    await expect(page.getByTestId("validation-icon-success")).toBeVisible();

    // Invalid JSON
    await textarea.fill("{invalid json}");
    await component.update(
      <MetadataCellEditor
        column={column}
        value="{invalid json}"
        onChange={() => {}}
        onValidationChange={() => {}}
      />
    );
    await expect(page.getByTestId("validation-icon-error")).toBeVisible();
    await expect(page.getByTestId("validation-error-message")).toBeVisible();
  });

  test("handles list editor for string arrays", async ({ mount, page }) => {
    const column = createMockColumn({
      dataType: MetadataDataType.STRING,
      extractIsList: true,
      validationRules: {
        choices: ["Tag1", "Tag2", "Tag3", "Tag4"],
        max_items: 3,
      },
    });

    await mount(
      <MetadataCellEditor
        column={column}
        value={["Tag1", "Tag2"]}
        onChange={() => {}}
      />
    );

    // Should render multi-select or tag input
    const multiselect = page.getByRole("listbox");
    await expect(multiselect).toBeVisible();

    // Check selected items
    await expect(page.getByText("Tag1")).toBeVisible();
    await expect(page.getByText("Tag2")).toBeVisible();
  });

  test("respects readOnly prop", async ({ mount, page }) => {
    const column = createMockColumn({
      dataType: MetadataDataType.STRING,
    });

    await mount(
      <MetadataCellEditor
        column={column}
        value="Read only value"
        onChange={() => {}}
        readOnly={true}
      />
    );

    const input = page.getByRole("textbox");
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute("readonly");
    await expect(input).toHaveValue("Read only value");

    // Try to edit - should not change
    await input.click();
    await page.keyboard.type("New text");
    await expect(input).toHaveValue("Read only value");
  });

  test("handles null/empty values", async ({ mount, page }) => {
    const column = createMockColumn({
      dataType: MetadataDataType.STRING,
    });

    await mount(
      <MetadataCellEditor column={column} value={null} onChange={() => {}} />
    );

    const input = page.getByRole("textbox");
    await expect(input).toBeVisible();
    await expect(input).toHaveValue("");
    await expect(input).toHaveAttribute("placeholder", expect.any(String));
  });

  test("focuses on mount when autoFocus is true", async ({ mount, page }) => {
    const column = createMockColumn({
      dataType: MetadataDataType.STRING,
    });

    await mount(
      <MetadataCellEditor
        column={column}
        value=""
        onChange={() => {}}
        autoFocus={true}
      />
    );

    const input = page.getByRole("textbox");
    await expect(input).toBeFocused();
  });
});
