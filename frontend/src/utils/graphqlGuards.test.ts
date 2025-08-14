import { describe, it, expect, vi } from "vitest";
import {
  guardGraphQLQuery,
  createSafeQueryExecutor,
  ensureValidCorpusId,
  ensureValidDocumentId,
  ensureValidIdVariables,
} from "./graphqlGuards";

describe("GraphQL Guards", () => {
  const validId = btoa("CorpusType:123");
  const invalidId = "my-slug";

  describe("guardGraphQLQuery", () => {
    it("should allow valid queries to execute", () => {
      const result = guardGraphQLQuery({
        variables: { corpusId: validId, name: "Test" },
        requiredFields: ["corpusId", "name"],
        idFields: ["corpusId"],
      });

      expect(result.canExecute).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should block queries with invalid IDs", () => {
      const result = guardGraphQLQuery({
        variables: { corpusId: invalidId },
        idFields: ["corpusId"],
      });

      expect(result.canExecute).toBe(false);
      expect(result.errors).toContain(
        `Invalid GraphQL ID for field corpusId: ${invalidId}`
      );
    });

    it("should report missing required fields", () => {
      const result = guardGraphQLQuery({
        variables: { name: "Test" } as any,
        requiredFields: ["corpusId", "name"],
      });

      expect(result.errors).toContain("Missing required field: corpusId");
      expect((result.variables as any).corpusId).toBe(""); // Safe default
    });

    it("should call onError callback with errors", () => {
      const onError = vi.fn();

      guardGraphQLQuery({
        variables: { corpusId: invalidId },
        idFields: ["corpusId"],
        onError,
      });

      expect(onError).toHaveBeenCalledWith([
        `Invalid GraphQL ID for field corpusId: ${invalidId}`,
      ]);
    });
  });

  describe("createSafeQueryExecutor", () => {
    it("should execute valid queries", async () => {
      const queryFn = vi
        .fn()
        .mockResolvedValue({ data: { corpus: { id: validId } } });
      const safeExecutor = createSafeQueryExecutor(queryFn, {
        idFields: ["corpusId"],
      });

      const result = await safeExecutor({ corpusId: validId });

      expect(queryFn).toHaveBeenCalledWith({
        variables: { corpusId: validId },
      });
      expect(result.data).toEqual({ corpus: { id: validId } });
      expect(result.skipped).toBeUndefined();
    });

    it("should skip invalid queries", async () => {
      const queryFn = vi.fn();
      const onValidationError = vi.fn();
      const safeExecutor = createSafeQueryExecutor(queryFn, {
        idFields: ["corpusId"],
        onValidationError,
      });

      const result = await safeExecutor({ corpusId: invalidId });

      expect(queryFn).not.toHaveBeenCalled();
      expect(result.skipped).toBe(true);
      expect(result.error).toBeDefined();
      expect(onValidationError).toHaveBeenCalled();
    });

    it("should handle query execution errors", async () => {
      const error = new Error("Network error");
      const queryFn = vi.fn().mockRejectedValue(error);
      const safeExecutor = createSafeQueryExecutor(queryFn, {});

      const result = await safeExecutor({ corpusId: validId });

      expect(result.error).toBe(error);
    });
  });

  describe("ensureValidCorpusId", () => {
    it("should validate valid corpus IDs", () => {
      const result = ensureValidCorpusId({ id: validId });

      expect(result.id).toBe(validId);
      expect(result.isValid).toBe(true);
    });

    it("should reject invalid corpus IDs", () => {
      const result = ensureValidCorpusId({ id: invalidId });

      expect(result.id).toBeUndefined();
      expect(result.isValid).toBe(false);
    });

    it("should handle null/undefined corpus", () => {
      expect(ensureValidCorpusId(null)).toEqual({
        id: undefined,
        isValid: false,
      });
      expect(ensureValidCorpusId(undefined)).toEqual({
        id: undefined,
        isValid: false,
      });
      expect(ensureValidCorpusId({})).toEqual({
        id: undefined,
        isValid: false,
      });
    });
  });

  describe("ensureValidDocumentId", () => {
    it("should validate valid document IDs", () => {
      const result = ensureValidDocumentId({ id: "gid:document:456" });

      expect(result.id).toBe("gid:document:456");
      expect(result.isValid).toBe(true);
    });

    it("should reject slugs", () => {
      const result = ensureValidDocumentId({ id: "doc-slug" });

      expect(result.id).toBeUndefined();
      expect(result.isValid).toBe(false);
    });
  });

  describe("ensureValidIdVariables", () => {
    it("should preserve valid IDs", () => {
      const variables = {
        corpusId: validId,
        documentId: "gid:document:456",
        name: "Test",
      };

      const result = ensureValidIdVariables(variables, [
        "corpusId",
        "documentId",
      ]);

      expect(result).toEqual(variables);
    });

    it("should remove invalid IDs", () => {
      const variables = {
        corpusId: invalidId,
        documentId: "doc-slug",
        name: "Test",
      };

      const result = ensureValidIdVariables(variables, [
        "corpusId",
        "documentId",
      ]);

      expect(result.corpusId).toBeUndefined();
      expect(result.documentId).toBeUndefined();
      expect(result.name).toBe("Test");
    });

    it("should not modify non-ID fields", () => {
      const variables = {
        corpusId: validId,
        searchTerm: "my-search-term",
      };

      const result = ensureValidIdVariables(variables, ["corpusId"]);

      expect(result.searchTerm).toBe("my-search-term");
    });
  });
});
