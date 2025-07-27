export enum MetadataDataType {
  STRING = "STRING",
  TEXT = "TEXT",
  BOOLEAN = "BOOLEAN",
  NUMBER = "NUMBER",
  INTEGER = "INTEGER",
  FLOAT = "FLOAT",
  DATE = "DATE",
  DATETIME = "DATETIME",
  URL = "URL",
  EMAIL = "EMAIL",
  CHOICE = "CHOICE",
  MULTI_CHOICE = "MULTI_CHOICE",
  JSON = "JSON",
}

export interface ValidationConfig {
  required?: boolean;
  min_length?: number;
  max_length?: number;
  min_value?: number;
  max_value?: number;
  choices?: string[];
  regex_pattern?: string;
  min_date?: string;
  max_date?: string;
  default_value?: any;
  help_text?: string;
}

export interface MetadataColumn {
  id: string;
  name: string;
  dataType: MetadataDataType;
  validationConfig?: ValidationConfig;
  validationRules?: any; // Alternative name used in tests
  defaultValue?: any;
  helpText?: string;
  displayOrder?: number;
  orderIndex?: number; // Alternative name used in tests
  isManualEntry: boolean;
  extractIsList?: boolean;
  __typename?: string;
}

export interface MetadataFieldset {
  id: string;
  name: string;
  columns: {
    edges: Array<{
      node: MetadataColumn;
      __typename?: string;
    }>;
    pageInfo?: any;
    __typename?: string;
  };
  __typename?: string;
}

export interface MetadataDatacell {
  id: string;
  data: { value: any };
  dataDefinition?: string;
  column: MetadataColumn | { id: string; __typename?: string };
  document?: {
    id: string;
    title?: string;
    __typename?: string;
  };
  creator?: {
    id: string;
    email: string;
  };
  created?: string;
  modified?: string;
  correctedData?: any;
  failed?: boolean;
  __typename?: string;
}

export interface MetadataCompletionStatus {
  totalFields: number;
  filledFields: number;
  missingFields: number;
  percentage: number;
  missingRequired: string[];
}

interface ValidationResult {
  valid: boolean;
  message: string;
}

// Helper functions for metadata validation
export const validateMetadataValue = (
  value: any,
  column: MetadataColumn
): ValidationResult => {
  const rules = column.validationConfig || column.validationRules;

  // Empty values are valid unless required
  if (value === null || value === undefined || value === "") {
    const valid = !rules?.required;
    return {
      valid,
      message: valid ? "" : `${column.name} is required.`,
    };
  }

  // Handle list validation
  if (column.extractIsList) {
    if (!Array.isArray(value)) {
      return { valid: false, message: "Expected a list of values." };
    }

    // Check max items constraint
    if (rules?.max_items && value.length > rules.max_items) {
      return {
        valid: false,
        message: `Maximum of ${rules.max_items} items allowed.`,
      };
    }

    // Validate each item
    for (const item of value) {
      const result = validateSingleValue(item, column.dataType, rules);
      if (!result.valid) return result;
    }

    return { valid: true, message: "" };
  }

  return validateSingleValue(value, column.dataType, rules);
};

const validateSingleValue = (
  value: any,
  dataType: MetadataDataType,
  rules: any
): ValidationResult => {
  if (value === null || value === undefined)
    return { valid: true, message: "" };

  switch (dataType) {
    case MetadataDataType.STRING:
    case MetadataDataType.TEXT:
      if (typeof value !== "string") {
        return { valid: false, message: "Must be a string." };
      }
      if (rules?.max_length && value.length > rules.max_length) {
        return {
          valid: false,
          message: `Must be ≤ ${rules.max_length} characters.`,
        };
      }
      if (rules?.choices && !rules.choices.includes(value)) {
        return { valid: false, message: "Invalid choice." };
      }
      return { valid: true, message: "" };

    case MetadataDataType.NUMBER:
    case MetadataDataType.INTEGER:
    case MetadataDataType.FLOAT:
      if (typeof value !== "number") {
        return { valid: false, message: "Must be a number." };
      }
      if (rules?.min_value !== undefined && value < rules.min_value) {
        return { valid: false, message: `Must be ≥ ${rules.min_value}.` };
      }
      if (rules?.max_value !== undefined && value > rules.max_value) {
        return { valid: false, message: `Must be ≤ ${rules.max_value}.` };
      }
      return { valid: true, message: "" };

    case MetadataDataType.BOOLEAN:
      return {
        valid: typeof value === "boolean",
        message:
          typeof value === "boolean" ? "" : "Must be a true/false value.",
      };

    case MetadataDataType.DATE:
      if (typeof value !== "string") {
        return { valid: false, message: "Must be a date string." };
      }
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) {
        return { valid: false, message: "Invalid date format (YYYY-MM-DD)." };
      }
      if (rules?.min_date && value < rules.min_date) {
        return {
          valid: false,
          message: `Date must be after ${rules.min_date}`,
        };
      }
      if (rules?.max_date && value < rules.max_date) {
        return {
          valid: false,
          message: `Date must be before ${rules.max_date}`,
        };
      }
      return { valid: true, message: "" };

    case MetadataDataType.JSON:
      if (typeof value === "object") return { valid: true, message: "" };
      if (typeof value === "string") {
        try {
          JSON.parse(value);
          return { valid: true, message: "" };
        } catch {
          return { valid: false, message: "Invalid JSON" };
        }
      }
      return { valid: false, message: "Must be valid JSON." };

    default:
      return { valid: true, message: "" };
  }
};

// Helper function to get default value for a data type
export const getDefaultValueForDataType = (dataType: MetadataDataType): any => {
  switch (dataType) {
    case MetadataDataType.STRING:
    case MetadataDataType.TEXT:
    case MetadataDataType.URL:
    case MetadataDataType.EMAIL:
      return "";
    case MetadataDataType.INTEGER:
    case MetadataDataType.FLOAT:
      return 0;
    case MetadataDataType.BOOLEAN:
      return false;
    case MetadataDataType.DATE:
      return new Date().toISOString().split("T")[0];
    case MetadataDataType.DATETIME:
      return new Date().toISOString();
    case MetadataDataType.CHOICE:
      return null;
    case MetadataDataType.MULTI_CHOICE:
      return [];
    case MetadataDataType.JSON:
      return {};
    default:
      return null;
  }
};

// Helper to format display value
export const formatMetadataValue = (
  value: any,
  dataType: MetadataDataType
): string => {
  if (value === null || value === undefined) return "";

  switch (dataType) {
    case MetadataDataType.BOOLEAN:
      return value ? "Yes" : "No";
    case MetadataDataType.DATE:
      return new Date(value).toLocaleDateString();
    case MetadataDataType.DATETIME:
      return new Date(value).toLocaleString();
    case MetadataDataType.MULTI_CHOICE:
      return Array.isArray(value) ? value.join(", ") : "";
    case MetadataDataType.JSON:
      return typeof value === "string" ? value : JSON.stringify(value, null, 2);
    default:
      return String(value);
  }
};
