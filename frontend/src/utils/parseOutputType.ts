import { JSONSchema7, JSONSchema7TypeName } from "json-schema";

// Type mapping for primitives
const primitiveTypeMap: Record<string, string> = {
  int: "number",
  float: "number",
  str: "string",
  bool: "boolean",
};

// Function to parse the outputType string
export function parseOutputType(outputType: string): JSONSchema7 {
  // Trim the outputType string
  const trimmedOutputType = outputType.trim();

  // Check if it's a primitive type
  if (primitiveTypeMap[trimmedOutputType]) {
    return { type: primitiveTypeMap[trimmedOutputType] as JSONSchema7TypeName };
  }

  // Check if it's an object type
  if (trimmedOutputType.includes(":")) {
    const lines = trimmedOutputType.split("\n").map((line) => line.trim());
    const properties: Record<string, JSONSchema7> = {};

    lines.forEach((line) => {
      if (!line) return;
      if (!line.includes(":")) {
        throw new Error(`Invalid line in outputType: "${line}"`);
      }
      const [key, value] = line.split(":").map((part) => part.trim());
      if (!key || !value) {
        throw new Error(`Invalid property definition in outputType: "${line}"`);
      }
      const type = primitiveTypeMap[value] || "string";
      properties[key] = { type: type as JSONSchema7TypeName };
    });

    return {
      type: "object",
      properties,
    };
  }

  throw new Error(`Unsupported outputType: "${outputType}"`);
}
