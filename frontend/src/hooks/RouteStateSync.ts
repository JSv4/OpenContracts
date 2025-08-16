import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useLazyQuery, useReactiveVar } from "@apollo/client";
import {
  openedCorpus,
  openedDocument,
  selectedAnnotationIds,
  backendUserObj,
} from "../graphql/cache";
import {
  USER_BY_SLUG,
  CORPUS_BY_SLUGS,
  DOCUMENT_BY_SLUGS,
  DOCUMENT_IN_CORPUS_BY_SLUGS,
} from "../graphql/queries";

/**
 * useRouteStateSync – bidirectional synchronisation between the browser URL
 * and the global selection reactive-vars (`openedCorpus`, `openedDocument`).
 *
 * 1) URL → State: when the user navigates (back/forward/type), parse the path
 *    and update the vars.
 * 2) State → URL: when a component imperatively changes the vars, push/replace
 *    the corresponding route so the address bar reflects the selection.
 *
 * Guard flags (`updatingFromUrl` / `updatingFromState`) prevent infinite loops.
 */
export function useRouteStateSync() {
  const location = useLocation();

  const corpus = useReactiveVar(openedCorpus);
  const document = useReactiveVar(openedDocument);
  const currentUser = useReactiveVar(backendUserObj);

  const updatingFromUrl = useRef(false);

  const isLikelyGlobalId = (value: string): boolean => {
    try {
      // Accept explicit gid: prefix
      if (value.startsWith("gid:")) return true;
      // Try base64 decode and check for Typename:pk
      const decoded = atob(value);
      return /:[0-9]+$/.test(decoded);
    } catch {
      return false;
    }
  };

  // Slug resolution queries (lazy; executed only if slug-shaped routes are detected)
  const [resolveUserBySlug] = useLazyQuery(USER_BY_SLUG);
  const [resolveCorpusBySlugs] = useLazyQuery(CORPUS_BY_SLUGS);
  const [resolveDocumentBySlugs] = useLazyQuery(DOCUMENT_BY_SLUGS);
  const [resolveDocumentInCorpusBySlugs] = useLazyQuery(
    DOCUMENT_IN_CORPUS_BY_SLUGS
  );

  /*
   * ------------------------------------------------------
   * The URL is the single source-of-truth ➜ reactive-vars
   * ------------------------------------------------------
   * We deliberately DO NOT try to update the URL when the
   * vars change.  Components that wish to change the open
   * document/corpus should navigate via react-router and
   * allow this hook to propagate the change to the global
   * reactive-vars.  That avoids two-way coupling loops.
   */
  // (State → URL syncing was intentionally removed.)

  /* ------------------------------------------------------ */
  /* URL → State                                            */
  /* ------------------------------------------------------ */
  useEffect(() => {
    updatingFromUrl.current = true;

    const path = location.pathname;
    const docMatch = path.match(/^\/corpus\/([^/]+)\/document\/([^/]+)/);
    const docOnlyMatch = path.match(/^\/documents\/([^/]+)$/);
    const corpusMatch = path.match(/^\/(?:corpuses|corpus)\/([^/]+)$/);

    // Reserved top-level segments to prevent misinterpreting static routes as slugs
    const reservedFirstSegments = new Set([
      "corpuses",
      "corpus",
      "documents",
      "document",
      "label_sets",
      "annotations",
      "privacy",
      "terms_of_service",
      "extracts",
      "login",
      "logout",
      "admin",
      "api",
      "graphql",
    ]);

    // New slug-first routes: /:userIdent/:corpusIdent/:docIdent, /:userIdent/:corpusIdent, /:userIdent/:docIdent
    const segments = path.split("/").filter(Boolean);
    const firstSegment = segments[0];
    const eligibleForSlugRouting =
      (segments.length === 2 || segments.length === 3) &&
      firstSegment &&
      !reservedFirstSegments.has(firstSegment);

    /* Parse optional `?anns=ID1,ID2` query-string parameter
       so deep-links can pre-select annotations. */
    const searchParams = new URLSearchParams(location.search);
    const annParam = searchParams.get("ann");
    const annotationIds = annParam ? annParam.split(",").filter(Boolean) : [];

    if (eligibleForSlugRouting && segments.length === 3) {
      const [userSlug, corpusSlug, documentSlug] = segments as [
        string,
        string,
        string
      ];
      // Resolve corpus, then document within corpus
      resolveCorpusBySlugs({ variables: { userSlug, corpusSlug } }).then(
        (cRes) => {
          const corpusId = cRes.data?.corpusBySlugs?.id;
          if (corpusId) {
            openedCorpus({ id: corpusId } as any);
          }
          resolveDocumentInCorpusBySlugs({
            variables: { userSlug, corpusSlug, documentSlug },
          }).then((dRes) => {
            const docId = dRes.data?.documentInCorpusBySlugs?.id;
            if (docId) openedDocument({ id: docId } as any);
          });
        }
      );
      if (annotationIds.length) selectedAnnotationIds(annotationIds);
    } else if (eligibleForSlugRouting && segments.length === 2) {
      const [userIdent, second] = segments as [string, string];
      const looksLikeGid = userIdent.startsWith("gid:");
      if (looksLikeGid) {
        // Treat as id/id legacy: /gid:<userId>/<corpusId or docId>
        // Leave to existing ID-based branches if needed, otherwise just seed corpus/doc ids directly
        // Prefer resolving as corpus id first
        openedCorpus({ id: second } as any);
        if (document) openedDocument(null);
      } else {
        // Treat as userSlug + (corpusSlug|documentSlug), works for anonymous browsing as well
        const userSlug = userIdent;
        const corpusSlug = second;
        resolveCorpusBySlugs({ variables: { userSlug, corpusSlug } }).then(
          (cRes) => {
            const corpusId = cRes.data?.corpusBySlugs?.id;
            if (corpusId) {
              openedCorpus({ id: corpusId } as any);
              if (document) openedDocument(null);
            } else {
              // Fallback: treat as document-only slug under user
              resolveDocumentBySlugs({
                variables: { userSlug, documentSlug: second },
              }).then((dRes) => {
                const docId = dRes.data?.documentBySlugs?.id;
                if (docId) openedDocument({ id: docId } as any);
              });
            }
          }
        );
      }
    } else if (docMatch) {
      const [, corpusId, docId] = docMatch;
      if (!corpus || corpus.id !== corpusId) {
        openedCorpus({ id: corpusId } as any); // partial – will be hydrated by query later
      }
      if (!document || document.id !== docId) {
        openedDocument({ id: docId } as any);
      }
      // When we have annotation ids in the query-string, prime the
      // selectedAnnotation reactive-var so annotator loads them.
      if (annotationIds.length) {
        selectedAnnotationIds(annotationIds);
      }
    } else if (docOnlyMatch) {
      const [, docId] = docOnlyMatch;
      if (!document || document.id !== docId) {
        openedDocument({ id: docId } as any);
      }
      if (annotationIds.length) {
        selectedAnnotationIds(annotationIds);
      }
    } else if (corpusMatch) {
      const [, corpusIdent] = corpusMatch;
      // Support ONLY ID on /corpuses/:id. Slug browsing uses slug-first routes.
      if (isLikelyGlobalId(corpusIdent)) {
        if (!corpus || corpus.id !== corpusIdent) {
          openedCorpus({ id: corpusIdent } as any);
        }
        if (document) openedDocument(null);
      }
    } else {
      if (corpus) openedCorpus(null);
      if (document) openedDocument(null);
    }

    updatingFromUrl.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);
}
