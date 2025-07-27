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

// Helper functions for metadata validation
export const validateMetadataValue = (
  value: any,
  column: MetadataColumn
): boolean => {
  const { dataType, validationRules, extractIsList } = column;

  // Empty values are valid unless required
  if (value === null || value === undefined || value === "") {
    return !validationRules?.required;
  }

  // Handle list validation
  if (extractIsList) {
    if (!Array.isArray(value)) return false;

    // Check max items constraint
    if (
      validationRules?.max_items &&
      value.length > validationRules.max_items
    ) {
      return false;
    }

    // Validate each item
    return value.every((item) =>
      validateSingleValue(item, dataType, validationRules)
    );
  }

  return validateSingleValue(value, dataType, validationRules);
};

const validateSingleValue = (
  value: any,
  dataType: MetadataDataType,
  rules: any
): boolean => {
  if (value === null || value === undefined) return true;

  switch (dataType) {
    case MetadataDataType.STRING:
    case MetadataDataType.TEXT:
      if (typeof value !== "string") return false;
      if (rules?.max_length && value.length > rules.max_length) return false;
      if (rules?.choices && !rules.choices.includes(value)) return false;
      return true;

    case MetadataDataType.NUMBER:
    case MetadataDataType.INTEGER:
    case MetadataDataType.FLOAT:
      if (typeof value !== "number") return false;
      if (rules?.min !== undefined && value < rules.min) return false;
      if (rules?.max !== undefined && value > rules.max) return false;
      return true;

    case MetadataDataType.BOOLEAN:
      return typeof value === "boolean";

    case MetadataDataType.DATE:
      if (typeof value !== "string") return false;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      if (rules?.min_date && value < rules.min_date) return false;
      if (rules?.max_date && value > rules.max_date) return false;
      return true;

    case MetadataDataType.JSON:
      if (typeof value === "object") return true;
      if (typeof value === "string") {
        try {
          JSON.parse(value);
          return true;
        } catch {
          return false;
        }
      }
      return false;

    default:
      return true;
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
