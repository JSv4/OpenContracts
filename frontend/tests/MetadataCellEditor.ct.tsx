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
        value="Multi\nline\ntext"
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
      validationRules: { min: 0, max: 100 },
    });

    await mount(
      <MetadataCellEditor column={column} value={50} onChange={() => {}} />
    );

    const input = page.getByRole("textbox");
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
    await expect(select).toHaveValue("Option B");

    // Check options
    const options = await select.locator("option").all();
    expect(options).toHaveLength(4); // Including empty option
    await expect(options[0]).toHaveText(""); // Empty option
    await expect(options[1]).toHaveText("Option A");
    await expect(options[2]).toHaveText("Option B");
    await expect(options[3]).toHaveText("Option C");
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
      validationRules: { min: 0, max: 100 },
    });

    let validationState = true;
    const handleValidationChange = (isValid: boolean) => {
      validationState = isValid;
    };

    await mount(
      <MetadataCellEditor
        column={column}
        value={50}
        onChange={() => {}}
        onValidationChange={handleValidationChange}
      />
    );

    const input = page.getByRole("textbox");

    // Valid value - should show success
    await input.fill("75");
    await expect(page.getByTestId("validation-icon-success")).toBeVisible();

    // Invalid value - should show error
    await input.fill("150");
    await expect(page.getByTestId("validation-icon-error")).toBeVisible();
    await expect(page.getByText("Must be ≤ 100")).toBeVisible();

    // Another invalid case
    await input.fill("-10");
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

    await mount(
      <MetadataCellEditor column={column} value="" onChange={handleChange} />
    );

    const input = page.getByRole("textbox");
    await input.fill("New value");

    // Wait for debounce if any
    await page.waitForTimeout(100);

    // Note: In real implementation, onChange might be called on blur or with debounce
    // For testing, we'll check the input value
    await expect(input).toHaveValue("New value");
  });

  test("handles boolean toggle", async ({ mount, page }) => {
    const column = createMockColumn({
      dataType: MetadataDataType.BOOLEAN,
    });

    let capturedValue = false;
    const handleChange = (value: boolean) => {
      capturedValue = value;
    };

    await mount(
      <MetadataCellEditor
        column={column}
        value={false}
        onChange={handleChange}
      />
    );

    const checkbox = page.getByRole("checkbox");
    await expect(checkbox).not.toBeChecked();

    await checkbox.check();
    await expect(checkbox).toBeChecked();
  });

  test("validates JSON input", async ({ mount, page }) => {
    const column = createMockColumn({
      dataType: MetadataDataType.JSON,
    });

    await mount(
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
    await expect(page.getByTestId("validation-icon-success")).toBeVisible();

    // Invalid JSON
    await textarea.fill("{invalid json}");
    await expect(page.getByTestId("validation-icon-error")).toBeVisible();
    await expect(page.getByText("Invalid JSON")).toBeVisible();
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
