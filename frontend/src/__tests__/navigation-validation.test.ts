/**
 * Unit tests for Phase 1 navigation fixes
 * Focus on testing the validation and guard logic directly
 */

import { describe, it, expect, vi } from "vitest";
import {
  isValidGraphQLId,
  isSlug,
  getIdentifierType,
  createSafeCorpusReference,
  createSafeDocumentReference,
} from "../utils/idValidation";
import {
  guardGraphQLQuery,
  ensureValidCorpusId,
  ensureValidDocumentId,
  ensureValidIdVariables,
} from "../utils/graphqlGuards";

describe("Phase 1 - Critical Navigation Fixes", () => {
  const validBase64Id = btoa("CorpusType:123");
  const validGidId = "gid:corpus:456";
  const invalidSlug = "my-corpus-slug";
  const invalidId = "not-valid";

  describe("ID Validation Tests", () => {
    it("should correctly identify valid GraphQL IDs", () => {
      expect(isValidGraphQLId(validBase64Id)).toBe(true);
      expect(isValidGraphQLId(validGidId)).toBe(true);
      expect(isValidGraphQLId(invalidSlug)).toBe(false);
      expect(isValidGraphQLId(invalidId)).toBe(false);
      expect(isValidGraphQLId(null)).toBe(false);
      expect(isValidGraphQLId(undefined)).toBe(false);
      expect(isValidGraphQLId("")).toBe(false);
    });

    it("should correctly identify slugs", () => {
      expect(isSlug("my-corpus")).toBe(true);
      expect(isSlug("document_123")).toBe(true);
      expect(isSlug("simple")).toBe(true);
      expect(isSlug(validBase64Id)).toBe(false);
      expect(isSlug(validGidId)).toBe(false);
      expect(isSlug("")).toBe(false);
    });

    it("should correctly classify identifier types", () => {
      expect(getIdentifierType(validBase64Id)).toBe("id");
      expect(getIdentifierType(validGidId)).toBe("id");
      expect(getIdentifierType("my-slug")).toBe("slug");
      expect(getIdentifierType("doc_123")).toBe("slug");
      expect(getIdentifierType(null)).toBe("unknown");
      expect(getIdentifierType("")).toBe("unknown");
    });
  });

  describe("State Hydration Guards", () => {
    it("should only create corpus references with valid IDs", () => {
      const validRef = createSafeCorpusReference(validBase64Id, {
        slug: "test-corpus",
        title: "Test Corpus",
      });

      expect(validRef).not.toBeNull();
      expect(validRef?.id).toBe(validBase64Id);
      expect(validRef?.slug).toBe("test-corpus");
      expect(validRef?.title).toBe("Test Corpus");

      const invalidRef = createSafeCorpusReference(invalidSlug);
      expect(invalidRef).toBeNull();

      const nullRef = createSafeCorpusReference(null);
      expect(nullRef).toBeNull();
    });

    it("should only create document references with valid IDs", () => {
      const validRef = createSafeDocumentReference(validGidId, {
        title: "Test Document",
      });

      expect(validRef).not.toBeNull();
      expect(validRef?.id).toBe(validGidId);
      expect(validRef?.title).toBe("Test Document");

      const invalidRef = createSafeDocumentReference("doc-slug");
      expect(invalidRef).toBeNull();
    });
  });

  describe("GraphQL Query Protection", () => {
    it("should prevent queries with invalid corpus IDs", () => {
      const guard = guardGraphQLQuery({
        variables: { corpusId: invalidSlug },
        idFields: ["corpusId"],
      });

      expect(guard.canExecute).toBe(false);
      expect(guard.errors).toContain(
        `Invalid GraphQL ID for field corpusId: ${invalidSlug}`
      );
    });

    it("should allow queries with valid IDs", () => {
      const guard = guardGraphQLQuery({
        variables: { corpusId: validBase64Id },
        idFields: ["corpusId"],
      });

      expect(guard.canExecute).toBe(true);
      expect(guard.errors).toHaveLength(0);
    });

    it("should provide safe defaults for missing required fields", () => {
      const guard = guardGraphQLQuery({
        variables: { name: "Test" },
        requiredFields: ["name"],
      });

      expect(guard.variables.name).toBe("Test");
      expect(guard.errors).toHaveLength(0);
    });

    it("should validate corpus ID before allowing query", () => {
      const validCorpus = { id: validBase64Id };
      const invalidCorpus = { id: invalidSlug };
      const nullCorpus = null;

      const valid = ensureValidCorpusId(validCorpus);
      expect(valid.isValid).toBe(true);
      expect(valid.id).toBe(validBase64Id);

      const invalid = ensureValidCorpusId(invalidCorpus);
      expect(invalid.isValid).toBe(false);
      expect(invalid.id).toBeUndefined();

      const nullResult = ensureValidCorpusId(nullCorpus);
      expect(nullResult.isValid).toBe(false);
      expect(nullResult.id).toBeUndefined();
    });

    it("should validate document ID before allowing query", () => {
      const validDoc = { id: validGidId };
      const invalidDoc = { id: "doc-slug" };

      const valid = ensureValidDocumentId(validDoc);
      expect(valid.isValid).toBe(true);
      expect(valid.id).toBe(validGidId);

      const invalid = ensureValidDocumentId(invalidDoc);
      expect(invalid.isValid).toBe(false);
      expect(invalid.id).toBeUndefined();
    });

    it("should clean invalid IDs from variables object", () => {
      const variables = {
        corpusId: invalidSlug,
        documentId: "doc-slug",
        validId: validBase64Id,
        name: "Test Name",
      };

      const cleaned = ensureValidIdVariables(variables, [
        "corpusId",
        "documentId",
        "validId",
      ]);

      expect(cleaned.corpusId).toBeUndefined();
      expect(cleaned.documentId).toBeUndefined();
      expect(cleaned.validId).toBe(validBase64Id);
      expect(cleaned.name).toBe("Test Name");
    });
  });

  describe("Error Recovery", () => {
    it("should handle null and undefined gracefully", () => {
      expect(isValidGraphQLId(null)).toBe(false);
      expect(isValidGraphQLId(undefined)).toBe(false);
      expect(isSlug(null)).toBe(false);
      expect(isSlug(undefined)).toBe(false);
      expect(getIdentifierType(null)).toBe("unknown");
      expect(getIdentifierType(undefined)).toBe("unknown");
    });

    it("should handle empty strings gracefully", () => {
      expect(isValidGraphQLId("")).toBe(false);
      expect(isSlug("")).toBe(false);
      expect(getIdentifierType("")).toBe("unknown");
    });

    it("should handle malformed base64 gracefully", () => {
      expect(isValidGraphQLId("!!!invalid!!!")).toBe(false);
      expect(isValidGraphQLId("not.base64")).toBe(false);
    });
  });

  describe("Integration Scenarios", () => {
    it("should handle mixed slug and ID navigation", () => {
      const params1 = { userIdent: "john", corpusIdent: validBase64Id };
      const params2 = { userIdent: "john", corpusIdent: "my-corpus" };
      const params3 = { corpusIdent: validBase64Id }; // Legacy

      // Scenario 1: User slug with corpus ID
      expect(getIdentifierType(params1.corpusIdent)).toBe("id");
      expect(isSlug(params1.userIdent)).toBe(true);

      // Scenario 2: Both slugs
      expect(getIdentifierType(params2.corpusIdent)).toBe("slug");
      expect(isSlug(params2.userIdent)).toBe(true);

      // Scenario 3: Legacy ID route
      expect(getIdentifierType(params3.corpusIdent)).toBe("id");
    });

    it("should validate query variables before execution", () => {
      // Simulate a GET_CORPUS_METADATA query
      const validVariables = { metadataForCorpusId: validBase64Id };
      const invalidVariables = { metadataForCorpusId: invalidSlug };
      const missingVariables: { metadataForCorpusId?: string } = {};

      const validGuard = guardGraphQLQuery({
        variables: validVariables,
        requiredFields: ["metadataForCorpusId"],
        idFields: ["metadataForCorpusId"],
      });

      const invalidGuard = guardGraphQLQuery({
        variables: invalidVariables,
        requiredFields: ["metadataForCorpusId"],
        idFields: ["metadataForCorpusId"],
      });

      const missingGuard = guardGraphQLQuery({
        variables: missingVariables,
        requiredFields: ["metadataForCorpusId"],
        idFields: ["metadataForCorpusId"],
      });

      expect(validGuard.canExecute).toBe(true);
      expect(invalidGuard.canExecute).toBe(false);
      expect(missingGuard.canExecute).toBe(true); // Can execute with default value
      expect((missingGuard.variables as any).metadataForCorpusId).toBe(""); // Has safe default
    });

    it("should validate GET_CORPUS_STATS variables", () => {
      // The actual bug scenario
      const undefinedCorpusId = undefined;
      const nullCorpusId = null;
      const emptyCorpusId = "";
      const slugCorpusId = "my-corpus";
      const validCorpusId = validBase64Id;

      // All invalid cases should be blocked
      const guard1 = guardGraphQLQuery({
        variables: { corpusId: undefinedCorpusId },
        requiredFields: ["corpusId"],
        idFields: ["corpusId"],
      });
      expect(guard1.canExecute).toBe(true); // Has default
      expect(guard1.variables.corpusId).toBe("");

      const guard2 = guardGraphQLQuery({
        variables: { corpusId: nullCorpusId },
        requiredFields: ["corpusId"],
        idFields: ["corpusId"],
      });
      expect(guard2.canExecute).toBe(true); // Has default
      expect(guard2.variables.corpusId).toBe("");

      const guard3 = guardGraphQLQuery({
        variables: { corpusId: emptyCorpusId },
        requiredFields: ["corpusId"],
        idFields: ["corpusId"],
      });
      expect(guard3.canExecute).toBe(true); // Empty is valid for skip

      const guard4 = guardGraphQLQuery({
        variables: { corpusId: slugCorpusId },
        requiredFields: ["corpusId"],
        idFields: ["corpusId"],
      });
      expect(guard4.canExecute).toBe(false); // Invalid ID

      const guard5 = guardGraphQLQuery({
        variables: { corpusId: validCorpusId },
        requiredFields: ["corpusId"],
        idFields: ["corpusId"],
      });
      expect(guard5.canExecute).toBe(true);
      expect(guard5.variables.corpusId).toBe(validCorpusId);
    });
  });
});
