import { describe, test, expect } from "vitest";
import {
  validateMetadataValue,
  MetadataDataType,
  MetadataColumn,
} from "./metadata";

describe("validateMetadataValue", () => {
  test("validates string types correctly", () => {
    const column: MetadataColumn = {
      id: "1",
      name: "Test",
      dataType: MetadataDataType.STRING,
      extractIsList: false,
      isManualEntry: true,
      validationRules: { max_length: 10 },
      orderIndex: 0,
    };

    expect(validateMetadataValue("test", column).valid).toBe(true);
    expect(
      validateMetadataValue("very long string that exceeds limit", column).valid
    ).toBe(false);
    expect(validateMetadataValue("", column).valid).toBe(true); // Empty is valid
    expect(validateMetadataValue(null, column).valid).toBe(true); // Null is valid
  });

  test("validates string with choices", () => {
    const column: MetadataColumn = {
      id: "1",
      name: "Status",
      dataType: MetadataDataType.STRING,
      extractIsList: false,
      isManualEntry: true,
      validationRules: { choices: ["Active", "Pending", "Completed"] },
      orderIndex: 0,
    };

    expect(validateMetadataValue("Active", column).valid).toBe(true);
    expect(validateMetadataValue("Pending", column).valid).toBe(true);
    expect(validateMetadataValue("Invalid", column).valid).toBe(false);
    expect(validateMetadataValue("", column).valid).toBe(true); // Empty is valid
  });

  test("validates number types with constraints", () => {
    const column: MetadataColumn = {
      id: "1",
      name: "Value",
      dataType: MetadataDataType.NUMBER,
      extractIsList: false,
      isManualEntry: true,
      validationRules: { min_value: 0, max_value: 100 },
      orderIndex: 0,
    };

    expect(validateMetadataValue(50, column).valid).toBe(true);
    expect(validateMetadataValue(0, column).valid).toBe(true);
    expect(validateMetadataValue(100, column).valid).toBe(true);
    expect(validateMetadataValue(150, column).valid).toBe(false);
    expect(validateMetadataValue(-10, column).valid).toBe(false);
    expect(validateMetadataValue("not a number", column).valid).toBe(false);
    expect(validateMetadataValue(null, column).valid).toBe(true);
  });

  test("validates date formats", () => {
    const column: MetadataColumn = {
      id: "1",
      name: "Date",
      dataType: MetadataDataType.DATE,
      extractIsList: false,
      isManualEntry: true,
      validationRules: {},
      orderIndex: 0,
    };

    expect(validateMetadataValue("2024-01-01", column).valid).toBe(true);
    expect(validateMetadataValue("2024-12-31", column).valid).toBe(true);
    expect(validateMetadataValue("invalid date", column).valid).toBe(false);
    expect(validateMetadataValue("2024/01/01", column).valid).toBe(false); // Wrong format
    expect(validateMetadataValue("", column).valid).toBe(true);
  });

  test("validates date with min/max constraints", () => {
    const column: MetadataColumn = {
      id: "1",
      name: "Contract Date",
      dataType: MetadataDataType.DATE,
      extractIsList: false,
      isManualEntry: true,
      validationRules: {
        min_date: "2024-01-01",
        max_date: "2024-12-31",
      },
      orderIndex: 0,
    };

    expect(validateMetadataValue("2024-06-15", column).valid).toBe(true);
    expect(validateMetadataValue("2023-12-31", column).valid).toBe(false);
    expect(validateMetadataValue("2025-01-01", column).valid).toBe(false);
  });

  test("validates boolean types", () => {
    const column: MetadataColumn = {
      id: "1",
      name: "Is Active",
      dataType: MetadataDataType.BOOLEAN,
      extractIsList: false,
      isManualEntry: true,
      validationRules: {},
      orderIndex: 0,
    };

    expect(validateMetadataValue(true, column).valid).toBe(true);
    expect(validateMetadataValue(false, column).valid).toBe(true);
    expect(validateMetadataValue("true", column).valid).toBe(false); // String not valid
    expect(validateMetadataValue(1, column).valid).toBe(false); // Number not valid
    expect(validateMetadataValue(null, column).valid).toBe(true);
  });

  test("validates JSON types", () => {
    const column: MetadataColumn = {
      id: "1",
      name: "Config",
      dataType: MetadataDataType.JSON,
      extractIsList: false,
      isManualEntry: true,
      validationRules: {},
      orderIndex: 0,
    };

    expect(validateMetadataValue({ key: "value" }, column).valid).toBe(true);
    expect(validateMetadataValue([1, 2, 3], column).valid).toBe(true);
    expect(validateMetadataValue("not json", column).valid).toBe(false);
    expect(validateMetadataValue(null, column).valid).toBe(true);
  });

  test("validates list constraints", () => {
    const column: MetadataColumn = {
      id: "1",
      name: "Tags",
      dataType: MetadataDataType.STRING,
      extractIsList: true,
      isManualEntry: true,
      validationRules: {
        choices: ["A", "B", "C"],
        max_items: 3,
      },
      orderIndex: 0,
    };

    expect(validateMetadataValue(["A", "B"], column).valid).toBe(true);
    expect(validateMetadataValue(["A", "B", "C"], column).valid).toBe(true);
    expect(validateMetadataValue(["A", "B", "C", "A"], column).valid).toBe(
      false
    ); // Too many
    expect(validateMetadataValue(["D"], column).valid).toBe(false); // Invalid choice
    expect(validateMetadataValue([], column).valid).toBe(true); // Empty list is valid
    expect(validateMetadataValue(["A", "D"], column).valid).toBe(false); // Contains invalid
  });

  test("validates list of numbers", () => {
    const column: MetadataColumn = {
      id: "1",
      name: "Scores",
      dataType: MetadataDataType.NUMBER,
      extractIsList: true,
      isManualEntry: true,
      validationRules: {
        min_value: 0,
        max_value: 100,
        max_items: 5,
      },
      orderIndex: 0,
    };

    expect(validateMetadataValue([10, 20, 30], column).valid).toBe(true);
    expect(validateMetadataValue([0, 50, 100], column).valid).toBe(true);
    expect(validateMetadataValue([10, 20, 150], column).valid).toBe(false); // One exceeds max
    expect(validateMetadataValue([10, 20, 30, 40, 50, 60], column).valid).toBe(
      false
    ); // Too many items
  });

  test("handles edge cases", () => {
    const column: MetadataColumn = {
      id: "1",
      name: "Test",
      dataType: MetadataDataType.STRING,
      extractIsList: false,
      isManualEntry: true,
      validationRules: {},
      orderIndex: 0,
    };

    expect(validateMetadataValue(undefined, column).valid).toBe(true);
    expect(validateMetadataValue(null, column).valid).toBe(true);
    expect(validateMetadataValue("", column).valid).toBe(true);
  });
});
