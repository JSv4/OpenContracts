import { JSONSchema7, JSONSchema7TypeName } from "json-schema";
import { FieldType } from "../components/widgets/ModelFieldBuilder";

/**
 * Parse a string representation of a Python Pydantic model or a primitive type
 * into a JSONSchema7 object.
 *
 * This function attempts to parse the given string as either a primitive type
 * ("int", "float", "str", "bool") or as an object type defined by key-value pairs.
 * It does not support nested models; it only supports simple objects with one level
 * of key-value pairs.
 *
 * @param outputType - The string representation of the type to parse.
 * @returns A JSONSchema7 object representing the parsed type.
 * @throws Will throw an error if the input is invalid or unsupported.
 */
export function parseOutputType(outputType: string): JSONSchema7 {
  const primitiveTypeMap: Record<string, JSONSchema7TypeName> = {
    int: "number",
    float: "number",
    str: "string",
    bool: "boolean",
  };

  const trimmedOutputType = outputType.trim();

  // Check if it's a primitive type
  if (primitiveTypeMap.hasOwnProperty(trimmedOutputType)) {
    return { type: primitiveTypeMap[trimmedOutputType] };
  }

  // Check if it's an object type
  if (trimmedOutputType.includes(":")) {
    const lines = trimmedOutputType.split("\n");
    const properties: Record<string, JSONSchema7> = {};

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index].trim();

      if (line === "") continue;

      if (line.includes("=")) {
        throw new Error("We don't support default values, sorry.");
      }

      if (!line.includes(":")) {
        throw new Error(
          `Every property needs to be typed! Error in line ${
            index + 1
          }: "${line}"`
        );
      }

      const parts = line.split(":");
      if (parts.length !== 2) {
        throw new Error(
          `There is an error in line ${index + 1} of your model: "${line}"`
        );
      }

      const key = parts[0].trim();
      const value = parts[1].trim();

      const type = primitiveTypeMap[value] || "string";
      properties[key] = { type: type };
    }

    return {
      type: "object",
      properties,
    };
  }

  throw new Error(`Invalid model or primitive type: "${outputType}"`);
}

/**
 * Parses a Pydantic model string and extracts field definitions.
 *
 * @param modelStr - The Pydantic model as a string.
 * @returns An array of field definitions.
 */
export function parsePydanticModel(modelStr: string): FieldType[] {
  const lines = modelStr.split("\n").map((line) => line.trim());
  const fieldLines = lines.filter(
    (line) => line && line.includes(":") && !line.startsWith("class")
  );
  const fields: FieldType[] = fieldLines.map((line) => {
    const [fieldName, fieldType] = line.split(":").map((part) => part.trim());
    return {
      id: Math.random().toString(),
      fieldName,
      fieldType,
    };
  });
  return fields;
}
