import { useEffect, useState, useRef } from "react";
import { useLazyQuery } from "@apollo/client";
import { useNavigate, useLocation } from "react-router-dom";
import {
  openedCorpus,
  openedDocument,
  selectedAnnotationIds,
} from "../graphql/cache";
import {
  RESOLVE_CORPUS_BY_SLUGS_FULL,
  RESOLVE_DOCUMENT_BY_SLUGS_FULL,
  RESOLVE_DOCUMENT_IN_CORPUS_BY_SLUGS_FULL,
  GET_CORPUS_BY_ID_FOR_REDIRECT,
  GET_DOCUMENT_BY_ID_FOR_REDIRECT,
  GetCorpusByIdForRedirectInput,
  GetCorpusByIdForRedirectOutput,
  GetDocumentByIdForRedirectInput,
  GetDocumentByIdForRedirectOutput,
} from "../graphql/queries";
import { CorpusType, DocumentType } from "../types/graphql-api";
import {
  ResolveCorpusFullQuery,
  ResolveCorpusFullVariables,
  ResolveDocumentFullQuery,
  ResolveDocumentFullVariables,
  ResolveDocumentInCorpusFullQuery,
  ResolveDocumentInCorpusFullVariables,
} from "../types/graphql-slug-queries";
import { performanceMonitor } from "../utils/performance";
import { requestTracker, buildRequestKey } from "../utils/navigationUtils";
import { getIdentifierType, isValidGraphQLId } from "../utils/idValidation";

export interface SlugResolverResult {
  loading: boolean;
  error: Error | undefined;
  corpus: CorpusType | null;
  document: DocumentType | null;
}

interface SlugResolverOptions {
  userIdent?: string;
  corpusIdent?: string;
  documentIdent?: string;
  annotationIds?: string[];
  onResolved?: (result: SlugResolverResult) => void;
}

// Cache for resolved slugs to prevent redundant queries
const slugCache = new Map<string, { corpus?: string; document?: string }>();

/**
 * Unified hook for resolving both slug-based and ID-based routes to full entity data.
 * Supports fallback to ID-based resolution when entities have numeric or base64 IDs.
 */
export function useSlugResolver({
  userIdent,
  corpusIdent,
  documentIdent,
  annotationIds = [],
  onResolved,
}: SlugResolverOptions): SlugResolverResult {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<SlugResolverResult>({
    loading: true,
    error: undefined,
    corpus: null,
    document: null,
  });

  // Track if we've already processed this route
  const processedRef = useRef<string>("");
  const currentRouteKey = [userIdent, corpusIdent, documentIdent].join("-");

  // GraphQL queries - slug-based
  const [resolveCorpus] = useLazyQuery<
    ResolveCorpusFullQuery,
    ResolveCorpusFullVariables
  >(RESOLVE_CORPUS_BY_SLUGS_FULL, {
    fetchPolicy: "cache-first",
    nextFetchPolicy: "cache-and-network",
  });

  const [resolveDocumentOnly] = useLazyQuery<
    ResolveDocumentFullQuery,
    ResolveDocumentFullVariables
  >(RESOLVE_DOCUMENT_BY_SLUGS_FULL, {
    fetchPolicy: "cache-first",
    nextFetchPolicy: "cache-and-network",
  });

  const [resolveDocumentInCorpus] = useLazyQuery<
    ResolveDocumentInCorpusFullQuery,
    ResolveDocumentInCorpusFullVariables
  >(RESOLVE_DOCUMENT_IN_CORPUS_BY_SLUGS_FULL, {
    fetchPolicy: "cache-first",
    nextFetchPolicy: "cache-and-network",
  });

  // GraphQL queries - ID-based (for fallback)
  const [resolveCorpusById] = useLazyQuery<
    GetCorpusByIdForRedirectOutput,
    GetCorpusByIdForRedirectInput
  >(GET_CORPUS_BY_ID_FOR_REDIRECT, {
    fetchPolicy: "cache-first",
    nextFetchPolicy: "cache-and-network",
  });

  const [resolveDocumentById] = useLazyQuery<
    GetDocumentByIdForRedirectOutput,
    GetDocumentByIdForRedirectInput
  >(GET_DOCUMENT_BY_ID_FOR_REDIRECT, {
    fetchPolicy: "cache-first",
    nextFetchPolicy: "cache-and-network",
  });

  // Helper to build cache key
  const getCacheKey = (user: string, corpus?: string, doc?: string): string => {
    return [user, corpus, doc].filter(Boolean).join("/");
  };

  // Helper to redirect to canonical slug URL
  const redirectToCanonicalUrl = (
    entity: { slug: string; creator?: { slug: string } },
    type: "corpus" | "document",
    parentCorpus?: { slug: string; creator?: { slug: string } } | null
  ) => {
    if (!entity.creator?.slug || !entity.slug) {
      console.error("Cannot redirect: missing slugs", entity);
      return;
    }

    let canonicalUrl: string;
    if (type === "corpus") {
      canonicalUrl = `/c/${entity.creator.slug}/${entity.slug}`;
    } else if (parentCorpus?.slug && parentCorpus?.creator?.slug) {
      canonicalUrl = `/d/${parentCorpus.creator.slug}/${parentCorpus.slug}/${entity.slug}`;
    } else {
      canonicalUrl = `/d/${entity.creator.slug}/${entity.slug}`;
    }

    // Preserve query parameters (like ?ann=)
    const currentParams = new URLSearchParams(location.search);
    if (currentParams.toString()) {
      canonicalUrl += `?${currentParams.toString()}`;
    }

    console.log("Redirecting from ID to canonical URL:", canonicalUrl);
    navigate(canonicalUrl, { replace: true });
  };

  useEffect(() => {
    console.log("useSlugResolver effect triggered with:", {
      currentRouteKey,
      previousKey: processedRef.current,
      params: { userIdent, corpusIdent, documentIdent },
    });

    // Prevent re-processing same route
    if (processedRef.current === currentRouteKey) {
      console.log("Skipping - already processed this route");
      return;
    }
    processedRef.current = currentRouteKey;

    // Reset state for new resolution
    setState({
      loading: true,
      error: undefined,
      corpus: null,
      document: null,
    });

    // Handle annotation IDs from query parameters
    if (annotationIds.length > 0) {
      selectedAnnotationIds(annotationIds);
    }

    // Async resolution logic
    const resolve = async () => {
      const resolutionMetric = "slug-resolution-" + currentRouteKey;
      performanceMonitor.startMetric(resolutionMetric, {
        userIdent,
        corpusIdent,
        documentIdent,
      });

      // Build request key for deduplication
      const requestKey = buildRequestKey(
        documentIdent ? "document" : "corpus",
        userIdent,
        corpusIdent,
        documentIdent
      );

      // Check if we're already processing this request
      if (requestTracker.isPending(requestKey)) {
        console.log(
          "Request already pending for",
          requestKey + ", skipping..."
        );
        return;
      }

      try {
        // Track this request to prevent duplicates
        await requestTracker.trackRequest(requestKey, async () => {
          // Always try slug-based resolution first
          // Only try ID resolution if slug resolution fails

          console.log("Resolving route:", {
            userIdent,
            corpusIdent,
            documentIdent,
          });

          // Case 1: Document in corpus (3 segments)
          if (userIdent && corpusIdent && documentIdent) {
            const cacheKey = getCacheKey(userIdent, corpusIdent, documentIdent);

            console.log(
              "Attempting slug-based resolution for document in corpus"
            );

            // Try slug-based resolution first
            const { data, error } = await resolveDocumentInCorpus({
              variables: {
                userSlug: userIdent,
                corpusSlug: corpusIdent,
                documentSlug: documentIdent,
              },
            });

            console.log("Slug resolution result:", { data, error });

            if (
              !error &&
              data?.documentInCorpusBySlugs &&
              data?.corpusBySlugs
            ) {
              // Success with slug resolution
              const corpus = data.corpusBySlugs as any as CorpusType;
              const document =
                data.documentInCorpusBySlugs as any as DocumentType;

              console.log("Successfully resolved via slugs:", {
                corpus: corpus.id,
                document: document.id,
              });

              slugCache.set(cacheKey, {
                corpus: corpus.id,
                document: document.id,
              });

              openedCorpus(corpus);
              openedDocument(document);

              setState({
                loading: false,
                error: undefined,
                corpus,
                document,
              });
              return;
            }

            // If slug resolution failed and the identifier looks like it might be an ID, try ID resolution
            const docType = getIdentifierType(documentIdent);
            if (
              docType === "id" ||
              (docType === "unknown" && isValidGraphQLId(documentIdent))
            ) {
              console.log(
                "Slug resolution failed, trying ID-based resolution for document"
              );
              const { data: idData, error: idError } =
                await resolveDocumentById({
                  variables: { id: documentIdent },
                });

              if (!idError && idData?.document) {
                // Redirect to canonical slug URL
                redirectToCanonicalUrl(
                  idData.document,
                  "document",
                  idData.document.corpus
                );
                return;
              }
            }

            // Neither slug nor ID resolution worked
            navigate("/404", { replace: true });
            return;
          }
          // Case 2: Document or Corpus (2 segments)
          else if (
            userIdent &&
            (documentIdent || corpusIdent) &&
            !(corpusIdent && documentIdent)
          ) {
            const targetIdent = documentIdent || corpusIdent;
            const isDocumentRoute = !!documentIdent;

            // Try slug-based resolution first
            if (isDocumentRoute) {
              const cacheKey = getCacheKey(userIdent, documentIdent!);

              const { data, error } = await resolveDocumentOnly({
                variables: {
                  userSlug: userIdent,
                  documentSlug: documentIdent!,
                },
              });

              if (!error && data?.documentBySlugs) {
                const document = data.documentBySlugs as any as DocumentType;

                slugCache.set(cacheKey, { document: document.id });
                openedCorpus(null);
                openedDocument(document);

                setState({
                  loading: false,
                  error: undefined,
                  corpus: null,
                  document,
                });
                return;
              }
            } else {
              const cacheKey = getCacheKey(userIdent, corpusIdent!);

              console.log("Attempting slug-based resolution for corpus");

              const { data, error } = await resolveCorpus({
                variables: {
                  userSlug: userIdent,
                  corpusSlug: corpusIdent!,
                },
              });

              console.log("Corpus slug resolution result:", { data, error });

              if (!error && data?.corpusBySlugs) {
                const corpus = data.corpusBySlugs as any as CorpusType;

                console.log("Successfully resolved corpus via slugs:", {
                  corpus: corpus.id,
                });

                slugCache.set(cacheKey, { corpus: corpus.id });
                openedCorpus(corpus);
                openedDocument(null);

                setState({
                  loading: false,
                  error: undefined,
                  corpus,
                  document: null,
                });
                return;
              }
            }

            // If slug resolution failed, check if it might be an ID
            const targetType = getIdentifierType(targetIdent);

            if (
              targetType === "id" ||
              (targetType === "unknown" && isValidGraphQLId(targetIdent))
            ) {
              console.log("Slug resolution failed, trying ID-based resolution");

              // Try as document first (more common case)
              const { data: docData } = await resolveDocumentById({
                variables: { id: targetIdent! },
              });

              if (docData?.document) {
                redirectToCanonicalUrl(docData.document, "document");
                return;
              }

              // Try as corpus
              const { data: corpusData } = await resolveCorpusById({
                variables: { id: targetIdent! },
              });

              if (corpusData?.corpus) {
                redirectToCanonicalUrl(corpusData.corpus, "corpus");
                return;
              }
            }

            // Neither slug nor ID resolution worked
            navigate("/404", { replace: true });
            return;
          }
          // Case 3: Single segment - likely an error but check if it's an ID
          else if (userIdent && !corpusIdent && !documentIdent) {
            const userType = getIdentifierType(userIdent);

            if (
              userType === "id" ||
              (userType === "unknown" && isValidGraphQLId(userIdent))
            ) {
              console.log("Single ID segment detected, attempting resolution");

              // Try as document
              const { data: docData } = await resolveDocumentById({
                variables: { id: userIdent },
              });

              if (docData?.document) {
                redirectToCanonicalUrl(docData.document, "document");
                return;
              }

              // Try as corpus
              const { data: corpusData } = await resolveCorpusById({
                variables: { id: userIdent },
              });

              if (corpusData?.corpus) {
                redirectToCanonicalUrl(corpusData.corpus, "corpus");
                return;
              }
            }

            // Invalid configuration
            console.warn("Invalid route configuration:", {
              userIdent,
              corpusIdent,
              documentIdent,
            });
            navigate("/404", { replace: true });
          }
          // Invalid route configuration
          else {
            console.warn("Invalid route configuration:", {
              userIdent,
              corpusIdent,
              documentIdent,
            });
            navigate("/404", { replace: true });
          }
        });

        performanceMonitor.endMetric(resolutionMetric, { success: true });
      } catch (error) {
        console.error("Slug resolution error:", error);
        performanceMonitor.endMetric(resolutionMetric, {
          success: false,
          error: error?.toString(),
        });
        setState({
          loading: false,
          error: error as Error,
          corpus: null,
          document: null,
        });
      }
    };

    // Only resolve if we have at least userIdent
    if (userIdent) {
      resolve();
    } else {
      setState({
        loading: false,
        error: new Error("Missing required route parameters"),
        corpus: null,
        document: null,
      });
    }
  }, [
    userIdent,
    corpusIdent,
    documentIdent,
    annotationIds,
    navigate,
    resolveCorpus,
    resolveDocumentOnly,
    resolveDocumentInCorpus,
    resolveCorpusById,
    resolveDocumentById,
  ]);

  // Call onResolved callback when resolution completes
  useEffect(() => {
    if (!state.loading && onResolved) {
      onResolved(state);
    }
  }, [state, onResolved]);

  return state;
}

/**
 * Hook to handle canonical redirects for entities
 * Works with both slug-based and ID-based URLs
 */
export function useCanonicalRedirect(
  entity: CorpusType | DocumentType | null,
  entityType: "corpus" | "document",
  corpus?: CorpusType | null
) {
  const navigate = useNavigate();
  const location = window.location;

  useEffect(() => {
    if (!entity) return;

    // Build canonical path based on entity type
    let canonicalPath: string;

    if (entityType === "corpus") {
      const c = entity as CorpusType;
      if (c.slug && c.creator?.slug) {
        canonicalPath = `/c/${c.creator.slug}/${c.slug}`;
      } else {
        // Can't build canonical path without slugs
        return;
      }
    } else {
      const d = entity as DocumentType;
      if (corpus?.slug && corpus?.creator?.slug && d.slug) {
        canonicalPath = `/d/${corpus.creator.slug}/${corpus.slug}/${d.slug}`;
      } else if (d.slug && d.creator?.slug) {
        canonicalPath = `/d/${d.creator.slug}/${d.slug}`;
      } else {
        // Can't build canonical path without slugs
        return;
      }
    }

    // Check if we're already at the canonical path
    const currentPath = location.pathname;
    const normalize = (path: string) => path.replace(/\/$/, "").toLowerCase();

    if (normalize(currentPath) !== normalize(canonicalPath)) {
      console.log("Redirecting to canonical path:", canonicalPath);
      navigate(canonicalPath, { replace: true });
    }
  }, [entity, entityType, corpus, navigate, location]);
}
