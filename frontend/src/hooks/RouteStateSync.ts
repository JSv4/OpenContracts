import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useReactiveVar } from "@apollo/client";
import {
  openedCorpus,
  openedDocument,
  selectedAnnotationIds,
} from "../graphql/cache";

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

  const updatingFromUrl = useRef(false);

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
    const corpusMatch = path.match(/^\/(?:corpuses|corpus)\/([^/]+)$/);

    /* Parse optional `?anns=ID1,ID2` query-string parameter
       so deep-links can pre-select annotations. */
    const searchParams = new URLSearchParams(location.search);
    const annParam = searchParams.get("ann");
    const annotationIds = annParam ? annParam.split(",").filter(Boolean) : [];

    if (docMatch) {
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
    } else if (corpusMatch) {
      const [, corpusId] = corpusMatch;
      if (!corpus || corpus.id !== corpusId) {
        openedCorpus({ id: corpusId } as any);
      }
      if (document) openedDocument(null);
    } else {
      if (corpus) openedCorpus(null);
      if (document) openedDocument(null);
    }

    updatingFromUrl.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);
}
