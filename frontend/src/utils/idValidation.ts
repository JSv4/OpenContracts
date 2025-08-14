/**
 * Utility functions for validating and handling GraphQL IDs and slugs
 */

/**
 * Checks if a value is a valid GraphQL ID (base64 encoded, gid: prefixed, or numeric)
 */
export function isValidGraphQLId(value: string | undefined | null): boolean {
  if (!value || typeof value !== "string") {
    return false;
  }

  // Check for gid: prefix (GraphQL ID format)
  if (value.startsWith("gid:")) {
    return true;
  }

  // Check if it's a numeric ID (common in this system)
  // Be conservative - only treat longer numeric strings as IDs
  // Short numeric strings (1-3 digits) are likely not GraphQL IDs
  if (/^\d+$/.test(value) && value.length >= 4) {
    console.log(`Treating numeric string "${value}" as potential ID`);
    return true;
  }

  // Check if it's a valid base64 encoded ID
  // Base64 strings often have = padding and specific character patterns
  if (value.includes("=") || /^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    try {
      const decoded = atob(value);
      // GraphQL IDs typically follow pattern: Type:Number
      return /^[A-Za-z]+:[0-9]+$/.test(decoded);
    } catch {
      // Not valid base64
      return false;
    }
  }

  return false;
}

/**
 * Checks if a value is likely a slug (alphanumeric with hyphens/underscores)
 */
export function isSlug(value: string | undefined | null): boolean {
  if (!value || typeof value !== "string") {
    return false;
  }

  // Slugs typically contain lowercase letters, numbers, hyphens, and underscores
  // They should NOT be base64 encoded IDs
  if (isValidGraphQLId(value)) {
    return false;
  }

  // Match slug pattern
  return /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/i.test(value);
}

/**
 * Safely extracts an ID from an object that might be null/undefined
 */
export function safeExtractId<T extends { id?: string | null }>(
  obj: T | null | undefined
): string | undefined {
  if (!obj || !obj.id) {
    return undefined;
  }

  if (isValidGraphQLId(obj.id)) {
    return obj.id;
  }

  return undefined;
}

/**
 * Determines the type of identifier
 */
export type IdentifierType = "id" | "slug" | "unknown";

export function getIdentifierType(
  value: string | undefined | null
): IdentifierType {
  if (!value) {
    return "unknown";
  }

  // Check slug pattern first (more specific)
  // Slugs typically contain lowercase letters, numbers, hyphens, and underscores
  if (/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/i.test(value)) {
    // This looks like a slug, but could still be a numeric ID
    if (/^\d+$/.test(value)) {
      // Pure numeric - could be either ID or slug
      // For safety, treat as unknown to allow both paths to be tried
      return "unknown";
    }
    return "slug";
  }

  // Check if it's clearly an ID
  if (isValidGraphQLId(value)) {
    return "id";
  }

  return "unknown";
}

/**
 * Ensures that GraphQL variables have valid IDs before making queries
 */
export function validateGraphQLVariables<T extends Record<string, any>>(
  variables: T,
  requiredIdFields: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const field of requiredIdFields) {
    const value = variables[field];

    if (!value) {
      errors.push(`Missing required field: ${field}`);
    } else if (!isValidGraphQLId(value)) {
      errors.push(`Invalid GraphQL ID for field ${field}: ${value}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Creates a safe corpus object with guaranteed ID
 */
export function createSafeCorpusReference(
  idOrSlug: string | undefined | null,
  additionalData?: Partial<{ slug?: string; title?: string }>
): { id: string } | null {
  if (!idOrSlug) {
    return null;
  }

  // Only create reference if we have a valid GraphQL ID
  if (isValidGraphQLId(idOrSlug)) {
    return {
      id: idOrSlug,
      ...additionalData,
    };
  }

  return null;
}

/**
 * Creates a safe document object with guaranteed ID
 */
export function createSafeDocumentReference(
  idOrSlug: string | undefined | null,
  additionalData?: Partial<{ slug?: string; title?: string }>
): { id: string } | null {
  if (!idOrSlug) {
    return null;
  }

  // Only create reference if we have a valid GraphQL ID
  if (isValidGraphQLId(idOrSlug)) {
    return {
      id: idOrSlug,
      ...additionalData,
    };
  }

  return null;
}
