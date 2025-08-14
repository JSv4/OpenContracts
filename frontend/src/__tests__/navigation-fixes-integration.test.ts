/**
 * Integration tests to prove navigation fixes work
 * Tests request deduplication, redirect prevention, and smart navigation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCorpusUrl,
  getDocumentUrl,
  isCanonicalPath,
  navigateToCorpus,
  navigateToDocument,
  requestTracker,
  buildRequestKey,
} from "../utils/navigationUtils";
import {
  isValidGraphQLId,
  isSlug,
  getIdentifierType,
} from "../utils/idValidation";
import { guardGraphQLQuery, ensureValidCorpusId } from "../utils/graphqlGuards";

describe("Navigation System Integration Tests", () => {
  const validCorpusId = btoa("CorpusType:123");
  const validDocumentId = btoa("DocumentType:456");

  const corpusWithSlugs = {
    id: validCorpusId,
    slug: "my-corpus",
    creator: { id: "1", slug: "john" },
  };

  const corpusWithoutSlugs = {
    id: validCorpusId,
    slug: undefined,
    creator: { id: "1", slug: undefined },
  };

  const documentWithSlugs = {
    id: validDocumentId,
    slug: "my-document",
    creator: { id: "1", slug: "john" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Note: requestTracker doesn't have a clear method, it manages its own cleanup
  });

  describe("Smart URL Building", () => {
    it("should prefer slug URLs when available", () => {
      const url = getCorpusUrl(corpusWithSlugs);
      expect(url).toBe("/c/john/my-corpus");
      expect(url).not.toContain(validCorpusId);
    });

    it("should return safe fallback when slugs unavailable", () => {
      const url = getCorpusUrl(corpusWithoutSlugs);
      expect(url).toBe("#"); // Returns # when slugs are missing
    });

    it("should build correct document URLs with corpus context", () => {
      const url = getDocumentUrl(documentWithSlugs, corpusWithSlugs);
      expect(url).toBe("/d/john/my-corpus/my-document");
    });

    it("should return safe fallback when document slugs missing", () => {
      const url = getDocumentUrl(
        {
          id: validDocumentId,
          slug: undefined,
          creator: { id: "1", slug: undefined },
        },
        {
          id: validCorpusId,
          slug: undefined,
          creator: { id: "1", slug: undefined },
        }
      );
      expect(url).toBe("#"); // Returns # when slugs are missing
    });
  });

  describe("Redirect Loop Prevention", () => {
    it("should detect identical paths", () => {
      const path = "/john/my-corpus";
      expect(isCanonicalPath(path, path)).toBe(true);
    });

    it("should ignore trailing slashes when comparing", () => {
      expect(isCanonicalPath("/john/my-corpus/", "/john/my-corpus")).toBe(true);
      expect(isCanonicalPath("/john/my-corpus", "/john/my-corpus/")).toBe(true);
    });

    it("should ignore query parameters when comparing", () => {
      expect(isCanonicalPath("/john/my-corpus?test=1", "/john/my-corpus")).toBe(
        true
      );
      expect(isCanonicalPath("/john/my-corpus", "/john/my-corpus?test=1")).toBe(
        true
      );
    });

    it("should detect when paths are equivalent", () => {
      expect(isCanonicalPath("/john/my-corpus", "/john/my-corpus")).toBe(true);
    });
  });

  describe("Smart Navigation Functions", () => {
    it("should not navigate if already at canonical path", () => {
      const mockNavigate = vi.fn();
      const currentPath = "/c/john/my-corpus";

      navigateToCorpus(corpusWithSlugs, mockNavigate, currentPath);

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("should navigate when not at canonical path", () => {
      const mockNavigate = vi.fn();
      const currentPath = `/corpuses/${validCorpusId}`;

      navigateToCorpus(corpusWithSlugs, mockNavigate, currentPath);

      expect(mockNavigate).toHaveBeenCalledWith("/c/john/my-corpus", {
        replace: true,
      });
    });

    it("should handle document navigation with corpus context", () => {
      const mockNavigate = vi.fn();
      const currentPath = "/documents/123";

      navigateToDocument(
        documentWithSlugs,
        corpusWithSlugs,
        mockNavigate,
        currentPath
      );

      expect(mockNavigate).toHaveBeenCalledWith(
        "/d/john/my-corpus/my-document",
        {
          replace: true,
        }
      );
    });
  });

  describe("Request Deduplication", () => {
    it("should prevent duplicate simultaneous requests", async () => {
      const mockRequest = vi.fn().mockResolvedValue({ data: "test" });
      const key = "test-request";

      // Start two requests simultaneously
      const promise1 = requestTracker.trackRequest(key, mockRequest);
      const promise2 = requestTracker.trackRequest(key, mockRequest);

      // Should only call the request function once
      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Both promises should resolve to the same result
      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toEqual({ data: "test" });
      expect(result2).toEqual({ data: "test" });
    });

    it("should allow new request after previous completes", async () => {
      const mockRequest = vi.fn().mockResolvedValue({ data: "test" });
      const key = "test-request";

      // First request
      await requestTracker.trackRequest(key, mockRequest);
      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Second request (after first completes)
      await requestTracker.trackRequest(key, mockRequest);
      expect(mockRequest).toHaveBeenCalledTimes(2);
    });

    it("should track different requests independently", async () => {
      const mockRequest1 = vi.fn().mockResolvedValue({ data: "test1" });
      const mockRequest2 = vi.fn().mockResolvedValue({ data: "test2" });

      // Start two different requests
      const promise1 = requestTracker.trackRequest("key1", mockRequest1);
      const promise2 = requestTracker.trackRequest("key2", mockRequest2);

      // Both should be called
      expect(mockRequest1).toHaveBeenCalledTimes(1);
      expect(mockRequest2).toHaveBeenCalledTimes(1);

      await Promise.all([promise1, promise2]);
    });
  });

  describe("GraphQL Query Protection", () => {
    it("should prevent queries with invalid corpus IDs", () => {
      const slug = "my-corpus-slug";
      const variables = { corpusId: slug };

      const guard = guardGraphQLQuery({
        variables,
        idFields: ["corpusId"],
      });

      expect(guard.canExecute).toBe(false);
      expect(guard.errors).toContain(
        `Invalid GraphQL ID for field corpusId: ${slug}`
      );
    });

    it("should allow queries with valid IDs", () => {
      const variables = { corpusId: validCorpusId };

      const guard = guardGraphQLQuery({
        variables,
        idFields: ["corpusId"],
      });

      expect(guard.canExecute).toBe(true);
      expect(guard.errors).toHaveLength(0);
    });

    it("should validate corpus before allowing query", () => {
      const corpusWithSlugId = { id: "my-slug" };
      const corpusWithValidId = { id: validCorpusId };

      const invalidResult = ensureValidCorpusId(corpusWithSlugId);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.id).toBeUndefined();

      const validResult = ensureValidCorpusId(corpusWithValidId);
      expect(validResult.isValid).toBe(true);
      expect(validResult.id).toBe(validCorpusId);
    });
  });

  describe("ID vs Slug Detection", () => {
    it("should correctly identify GraphQL IDs", () => {
      expect(isValidGraphQLId(validCorpusId)).toBe(true);
      expect(isValidGraphQLId("gid:corpus:123")).toBe(true);
      expect(isValidGraphQLId("my-slug")).toBe(false);
    });

    it("should correctly identify slugs", () => {
      expect(isSlug("my-corpus")).toBe(true);
      expect(isSlug("document-123")).toBe(true);
      expect(isSlug(validCorpusId)).toBe(false);
    });

    it("should classify identifiers correctly", () => {
      expect(getIdentifierType(validCorpusId)).toBe("id");
      expect(getIdentifierType("my-slug")).toBe("slug");
      expect(getIdentifierType("")).toBe("unknown");
    });
  });

  describe("Real-World Scenarios", () => {
    it("should handle deep link without cascading requests", async () => {
      const mockNavigate = vi.fn();
      const mockFetch = vi.fn().mockResolvedValue({
        corpus: corpusWithSlugs,
      });

      // Simulate deep link to ID-based URL
      const currentPath = `/corpuses/${validCorpusId}`;

      // First request - should fetch data
      const key = buildRequestKey("corpus", validCorpusId);
      await requestTracker.trackRequest(key, mockFetch);

      // Navigation should redirect to slug URL
      navigateToCorpus(corpusWithSlugs, mockNavigate, currentPath);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith("/c/john/my-corpus", {
        replace: true,
      });

      // Simulate arriving at new URL
      const newPath = "/c/john/my-corpus";

      // Should not navigate again (already at canonical)
      mockNavigate.mockClear();
      navigateToCorpus(corpusWithSlugs, mockNavigate, newPath);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it("should handle mixed ID/slug parameters", () => {
      const corpusId = validCorpusId;
      const userSlug = "john";

      // Corpus is ID but should still work
      expect(isValidGraphQLId(corpusId)).toBe(true);
      expect(isSlug(userSlug)).toBe(true);

      // Should use ID-based query for corpus
      const corpusGuard = guardGraphQLQuery({
        variables: { metadataForCorpusId: corpusId },
        idFields: ["metadataForCorpusId"],
      });

      expect(corpusGuard.canExecute).toBe(true);
    });

    it("should prevent navigation to same path", () => {
      const mockNavigate = vi.fn();
      const currentPath = "/c/john/my-corpus";

      // Should not navigate if already at target path
      navigateToCorpus(corpusWithSlugs, mockNavigate, currentPath);
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe("Performance Optimizations", () => {
    it("should build efficient request keys", () => {
      const key1 = buildRequestKey("corpus", "user1", "corpus1");
      const key2 = buildRequestKey("corpus", "user1", "corpus1");
      const key3 = buildRequestKey("corpus", "user2", "corpus1");

      expect(key1).toBe(key2); // Same parameters = same key
      expect(key1).not.toBe(key3); // Different parameters = different key
    });

    it("should handle undefined parameters in request keys", () => {
      const key = buildRequestKey("document", "user1", undefined, "doc1");
      expect(key).toBe("document-user1-doc1");
      expect(key).not.toContain("undefined");
    });
  });
});
