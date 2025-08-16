import { describe, it, expect } from "vitest";
import {
  isValidGraphQLId,
  isSlug,
  safeExtractId,
  getIdentifierType,
  validateGraphQLVariables,
  createSafeCorpusReference,
  createSafeDocumentReference,
} from "./idValidation";

describe("idValidation utilities", () => {
  describe("isValidGraphQLId", () => {
    it("should validate gid: prefixed IDs", () => {
      expect(isValidGraphQLId("gid:corpus:123")).toBe(true);
      expect(isValidGraphQLId("gid:document:456")).toBe(true);
    });

    it("should validate base64 encoded GraphQL IDs", () => {
      // 'CorpusType:123' encoded in base64
      const validId = btoa("CorpusType:123");
      expect(isValidGraphQLId(validId)).toBe(true);

      // 'DocumentType:456' encoded in base64
      const validDocId = btoa("DocumentType:456");
      expect(isValidGraphQLId(validDocId)).toBe(true);
    });

    it("should reject invalid IDs", () => {
      expect(isValidGraphQLId(null)).toBe(false);
      expect(isValidGraphQLId(undefined)).toBe(false);
      expect(isValidGraphQLId("")).toBe(false);
      expect(isValidGraphQLId("not-an-id")).toBe(false);
      expect(isValidGraphQLId("123")).toBe(false);
      expect(isValidGraphQLId("my-corpus-slug")).toBe(false);
    });

    it("should reject malformed base64", () => {
      expect(isValidGraphQLId("not!valid!base64")).toBe(false);
      expect(isValidGraphQLId("!!!!")).toBe(false);
    });
  });

  describe("isSlug", () => {
    it("should validate typical slugs", () => {
      expect(isSlug("my-corpus")).toBe(true);
      expect(isSlug("my_corpus")).toBe(true);
      expect(isSlug("corpus-123")).toBe(true);
      expect(isSlug("test_document_1")).toBe(true);
      expect(isSlug("simple")).toBe(true);
    });

    it("should reject GraphQL IDs", () => {
      expect(isSlug("gid:corpus:123")).toBe(false);
      expect(isSlug(btoa("CorpusType:123"))).toBe(false);
    });

    it("should reject invalid slugs", () => {
      expect(isSlug(null)).toBe(false);
      expect(isSlug(undefined)).toBe(false);
      expect(isSlug("")).toBe(false);
      expect(isSlug("slug with spaces")).toBe(false);
      expect(isSlug("slug!with!special")).toBe(false);
      expect(isSlug(".hidden")).toBe(false);
    });
  });

  describe("safeExtractId", () => {
    it("should extract valid IDs from objects", () => {
      const validId = btoa("CorpusType:123");
      expect(safeExtractId({ id: validId })).toBe(validId);
      expect(safeExtractId({ id: "gid:corpus:123" })).toBe("gid:corpus:123");
    });

    it("should return undefined for invalid cases", () => {
      expect(safeExtractId(null)).toBeUndefined();
      expect(safeExtractId(undefined)).toBeUndefined();
      expect(safeExtractId({})).toBeUndefined();
      expect(safeExtractId({ id: null })).toBeUndefined();
      expect(safeExtractId({ id: "not-an-id" })).toBeUndefined();
      expect(safeExtractId({ id: "my-slug" })).toBeUndefined();
    });
  });

  describe("getIdentifierType", () => {
    it("should correctly identify IDs", () => {
      expect(getIdentifierType("gid:corpus:123")).toBe("id");
      expect(getIdentifierType(btoa("CorpusType:123"))).toBe("id");
    });

    it("should correctly identify slugs", () => {
      expect(getIdentifierType("my-corpus")).toBe("slug");
      expect(getIdentifierType("document_123")).toBe("slug");
    });

    it("should return unknown for invalid inputs", () => {
      expect(getIdentifierType(null)).toBe("unknown");
      expect(getIdentifierType(undefined)).toBe("unknown");
      expect(getIdentifierType("")).toBe("unknown");
      expect(getIdentifierType("!!!invalid!!!")).toBe("unknown");
    });
  });

  describe("validateGraphQLVariables", () => {
    it("should validate required ID fields", () => {
      const validId = btoa("CorpusType:123");
      const variables = {
        corpusId: validId,
        documentId: "gid:document:456",
      };

      const result = validateGraphQLVariables(variables, [
        "corpusId",
        "documentId",
      ]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should report missing fields", () => {
      const variables = {
        corpusId: btoa("CorpusType:123"),
      };

      const result = validateGraphQLVariables(variables, [
        "corpusId",
        "documentId",
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing required field: documentId");
    });

    it("should report invalid IDs", () => {
      const variables = {
        corpusId: "my-slug",
        documentId: "another-slug",
      };

      const result = validateGraphQLVariables(variables, [
        "corpusId",
        "documentId",
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain(
        "Invalid GraphQL ID for field corpusId"
      );
      expect(result.errors[1]).toContain(
        "Invalid GraphQL ID for field documentId"
      );
    });
  });

  describe("createSafeCorpusReference", () => {
    it("should create reference for valid IDs", () => {
      const validId = btoa("CorpusType:123");
      const ref = createSafeCorpusReference(validId, { slug: "my-corpus" });

      expect(ref).toEqual({
        id: validId,
        slug: "my-corpus",
      });
    });

    it("should return null for invalid inputs", () => {
      expect(createSafeCorpusReference(null)).toBeNull();
      expect(createSafeCorpusReference(undefined)).toBeNull();
      expect(createSafeCorpusReference("my-slug")).toBeNull();
      expect(createSafeCorpusReference("")).toBeNull();
    });
  });

  describe("createSafeDocumentReference", () => {
    it("should create reference for valid IDs", () => {
      const validId = "gid:document:456";
      const ref = createSafeDocumentReference(validId, {
        title: "My Document",
      });

      expect(ref).toEqual({
        id: validId,
        title: "My Document",
      });
    });

    it("should return null for slugs", () => {
      expect(createSafeDocumentReference("doc-slug")).toBeNull();
    });
  });
});
