import { describe, test, expect } from "vitest";
import { MetadataDataType } from "../types/metadata";

// Helper function to convert values between types
export const convertValue = (value: any, targetType: MetadataDataType): any => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  switch (targetType) {
    case MetadataDataType.STRING:
    case MetadataDataType.TEXT:
      return String(value);

    case MetadataDataType.NUMBER:
      const num = Number(value);
      return isNaN(num) ? null : num;

    case MetadataDataType.BOOLEAN:
      if (typeof value === "boolean") return value;
      if (typeof value === "string") {
        const lower = value.toLowerCase();
        if (lower === "true" || lower === "yes" || lower === "1") return true;
        if (lower === "false" || lower === "no" || lower === "0") return false;
      }
      if (typeof value === "number") return value !== 0;
      return null;

    case MetadataDataType.DATE:
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
      }
      return null;

    case MetadataDataType.JSON:
      if (typeof value === "object") return value;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }

    default:
      return value;
  }
};

describe("convertValue", () => {
  test("converts to string", () => {
    expect(convertValue(123, MetadataDataType.STRING)).toBe("123");
    expect(convertValue(true, MetadataDataType.STRING)).toBe("true");
    expect(convertValue({ key: "value" }, MetadataDataType.STRING)).toBe(
      "[object Object]"
    );
    expect(convertValue(null, MetadataDataType.STRING)).toBe(null);
  });

  test("converts string to number", () => {
    expect(convertValue("123", MetadataDataType.NUMBER)).toBe(123);
    expect(convertValue("123.45", MetadataDataType.NUMBER)).toBe(123.45);
    expect(convertValue("abc", MetadataDataType.NUMBER)).toBe(null);
    expect(convertValue("", MetadataDataType.NUMBER)).toBe(null);
    expect(convertValue(null, MetadataDataType.NUMBER)).toBe(null);
  });

  test("converts to boolean", () => {
    // String conversions
    expect(convertValue("true", MetadataDataType.BOOLEAN)).toBe(true);
    expect(convertValue("True", MetadataDataType.BOOLEAN)).toBe(true);
    expect(convertValue("TRUE", MetadataDataType.BOOLEAN)).toBe(true);
    expect(convertValue("yes", MetadataDataType.BOOLEAN)).toBe(true);
    expect(convertValue("YES", MetadataDataType.BOOLEAN)).toBe(true);
    expect(convertValue("1", MetadataDataType.BOOLEAN)).toBe(true);

    expect(convertValue("false", MetadataDataType.BOOLEAN)).toBe(false);
    expect(convertValue("False", MetadataDataType.BOOLEAN)).toBe(false);
    expect(convertValue("FALSE", MetadataDataType.BOOLEAN)).toBe(false);
    expect(convertValue("no", MetadataDataType.BOOLEAN)).toBe(false);
    expect(convertValue("NO", MetadataDataType.BOOLEAN)).toBe(false);
    expect(convertValue("0", MetadataDataType.BOOLEAN)).toBe(false);

    // Number conversions
    expect(convertValue(1, MetadataDataType.BOOLEAN)).toBe(true);
    expect(convertValue(100, MetadataDataType.BOOLEAN)).toBe(true);
    expect(convertValue(-1, MetadataDataType.BOOLEAN)).toBe(true);
    expect(convertValue(0, MetadataDataType.BOOLEAN)).toBe(false);

    // Invalid conversions
    expect(convertValue("maybe", MetadataDataType.BOOLEAN)).toBe(null);
    expect(convertValue("", MetadataDataType.BOOLEAN)).toBe(null);
    expect(convertValue(null, MetadataDataType.BOOLEAN)).toBe(null);
  });

  test("validates date format", () => {
    expect(convertValue("2024-01-01", MetadataDataType.DATE)).toBe(
      "2024-01-01"
    );
    expect(convertValue("2024-12-31", MetadataDataType.DATE)).toBe(
      "2024-12-31"
    );
    expect(convertValue("01/01/2024", MetadataDataType.DATE)).toBe(null);
    expect(convertValue("2024-1-1", MetadataDataType.DATE)).toBe(null);
    expect(convertValue("not a date", MetadataDataType.DATE)).toBe(null);
    expect(convertValue(null, MetadataDataType.DATE)).toBe(null);
  });

  test("converts to JSON", () => {
    const obj = { key: "value" };
    expect(convertValue(obj, MetadataDataType.JSON)).toEqual(obj);
    expect(convertValue('{"key":"value"}', MetadataDataType.JSON)).toEqual(obj);
    expect(convertValue("[1,2,3]", MetadataDataType.JSON)).toEqual([1, 2, 3]);
    expect(convertValue("invalid json", MetadataDataType.JSON)).toBe(null);
    expect(convertValue(null, MetadataDataType.JSON)).toBe(null);
  });

  test("handles edge cases", () => {
    expect(convertValue(undefined, MetadataDataType.STRING)).toBe(null);
    expect(convertValue("", MetadataDataType.STRING)).toBe(null);
    expect(convertValue(NaN, MetadataDataType.NUMBER)).toBe(null);
  });
});

// Helper to format values for display
export const formatMetadataValue = (
  value: any,
  dataType: MetadataDataType
): string => {
  if (value === null || value === undefined) {
    return "";
  }

  switch (dataType) {
    case MetadataDataType.NUMBER:
      return typeof value === "number" ? value.toLocaleString() : String(value);

    case MetadataDataType.BOOLEAN:
      return value ? "Yes" : "No";

    case MetadataDataType.DATE:
      return value; // Already in YYYY-MM-DD format

    case MetadataDataType.JSON:
      return typeof value === "string" ? value : JSON.stringify(value, null, 2);

    default:
      return String(value);
  }
};

describe("formatMetadataValue", () => {
  test("formats numbers with locale", () => {
    expect(formatMetadataValue(1000, MetadataDataType.NUMBER)).toBe("1,000");
    expect(formatMetadataValue(1234567.89, MetadataDataType.NUMBER)).toBe(
      "1,234,567.89"
    );
  });

  test("formats booleans as Yes/No", () => {
    expect(formatMetadataValue(true, MetadataDataType.BOOLEAN)).toBe("Yes");
    expect(formatMetadataValue(false, MetadataDataType.BOOLEAN)).toBe("No");
  });

  test("formats JSON with indentation", () => {
    const obj = { key: "value", nested: { a: 1 } };
    const formatted = formatMetadataValue(obj, MetadataDataType.JSON);
    expect(formatted).toContain('"key": "value"');
    expect(formatted).toContain("\n"); // Has newlines for formatting
  });
});
