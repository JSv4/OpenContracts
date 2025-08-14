/**
 * Navigation utilities for consistent slug-based routing
 * Only supports new explicit route patterns with /c/ and /d/ prefixes
 */

import { CorpusType, DocumentType, UserType } from "../types/graphql-api";

/**
 * Builds the URL for a corpus
 * Always uses slug-based URL with /c/ prefix
 */
export function getCorpusUrl(
  corpus: Pick<CorpusType, "id" | "slug"> & {
    creator?: Pick<UserType, "id" | "slug"> | null;
  }
): string {
  // Always use slug-based URL with /c/ prefix
  // If slugs are missing, we can't generate a valid URL
  if (!corpus.slug || !corpus.creator?.slug) {
    console.warn("Cannot generate corpus URL without slugs:", corpus);
    return "#"; // Return a safe fallback that won't navigate
  }

  return `/c/${corpus.creator.slug}/${corpus.slug}`;
}

/**
 * Builds the URL for a document
 * Always uses slug-based URL with /d/ prefix
 */
export function getDocumentUrl(
  document: Pick<DocumentType, "id" | "slug"> & {
    creator?: Pick<UserType, "id" | "slug"> | null;
  },
  corpus?:
    | (Pick<CorpusType, "id" | "slug"> & {
        creator?: Pick<UserType, "id" | "slug"> | null;
      })
    | null
): string {
  // If we have corpus context and all slugs, use the full URL
  if (
    corpus?.slug &&
    corpus?.creator?.slug &&
    document.slug &&
    document.creator?.slug
  ) {
    return `/d/${corpus.creator.slug}/${corpus.slug}/${document.slug}`;
  }

  // Standalone document URL
  if (document.slug && document.creator?.slug) {
    return `/d/${document.creator.slug}/${document.slug}`;
  }

  // Can't generate URL without slugs
  console.warn("Cannot generate document URL without slugs:", document, corpus);
  return "#"; // Return a safe fallback that won't navigate
}

/**
 * Checks if the current path matches the canonical path
 * Prevents unnecessary redirects
 */
export function isCanonicalPath(
  currentPath: string,
  canonicalPath: string
): boolean {
  // Normalize paths (remove trailing slashes, query params)
  const normalize = (path: string) => {
    const withoutQuery = path.split("?")[0];
    return withoutQuery.replace(/\/$/, "").toLowerCase();
  };

  return normalize(currentPath) === normalize(canonicalPath);
}

/**
 * Smart navigation function for corpuses
 * Only navigates if not already at the destination
 */
export function navigateToCorpus(
  corpus: Pick<CorpusType, "id" | "slug"> & {
    creator?: Pick<UserType, "id" | "slug"> | null;
  },
  navigate: (path: string, options?: { replace?: boolean }) => void,
  currentPath?: string
) {
  const targetPath = getCorpusUrl(corpus);

  // Don't navigate to invalid URL
  if (targetPath === "#") {
    console.error("Cannot navigate to corpus without slugs");
    return;
  }

  // Don't navigate if we're already there
  if (currentPath && isCanonicalPath(currentPath, targetPath)) {
    console.log("Already at canonical corpus path:", targetPath);
    return;
  }

  navigate(targetPath, { replace: true });
}

/**
 * Smart navigation function for documents
 * Only navigates if not already at the destination
 */
export function navigateToDocument(
  document: Pick<DocumentType, "id" | "slug"> & {
    creator?: Pick<UserType, "id" | "slug"> | null;
  },
  corpus:
    | (Pick<CorpusType, "id" | "slug"> & {
        creator?: Pick<UserType, "id" | "slug"> | null;
      })
    | null,
  navigate: (path: string, options?: { replace?: boolean }) => void,
  currentPath?: string
) {
  const targetPath = getDocumentUrl(document, corpus);

  // Don't navigate to invalid URL
  if (targetPath === "#") {
    console.error("Cannot navigate to document without slugs");
    return;
  }

  // Don't navigate if we're already there
  if (currentPath && isCanonicalPath(currentPath, targetPath)) {
    console.log("Already at canonical document path:", targetPath);
    return;
  }

  navigate(targetPath, { replace: true });
}

/**
 * Request tracking to prevent duplicate GraphQL queries
 */
class RequestTracker {
  private pendingRequests: Map<string, Promise<any>> = new Map();

  isPending(key: string): boolean {
    return this.pendingRequests.has(key);
  }

  async trackRequest<T>(key: string, request: () => Promise<T>): Promise<T> {
    // If already pending, return the existing promise
    const pending = this.pendingRequests.get(key);
    if (pending) {
      return pending;
    }

    // Create and track new request
    const promise = request().finally(() => {
      this.pendingRequests.delete(key);
    });

    this.pendingRequests.set(key, promise);
    return promise;
  }
}

export const requestTracker = new RequestTracker();

/**
 * Build a unique key for request deduplication
 */
export function buildRequestKey(
  type: "corpus" | "document",
  userIdent?: string,
  corpusIdent?: string,
  documentIdent?: string
): string {
  const parts = [type, userIdent, corpusIdent, documentIdent].filter(Boolean);
  return parts.join("-");
}
