import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLazyQuery } from "@apollo/client";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { CORPUS_BY_SLUGS, GET_CORPUS_METADATA } from "../../graphql/queries";
import { openedCorpus } from "../../graphql/cache";
import { Corpuses } from "../../views/Corpuses";

function isLikelyGlobalId(value: string | undefined): boolean {
  if (!value) return false;
  if (value.startsWith("gid:")) return true;
  try {
    const decoded = atob(value);
    return /:[0-9]+$/.test(decoded);
  } catch {
    return false;
  }
}

function setTitle(title: string) {
  if (typeof document !== "undefined") document.title = title;
}

function setMeta(name: string, content: string) {
  if (typeof document === "undefined") return;
  let tag = document.querySelector(
    `meta[name='${name}']`
  ) as HTMLMetaElement | null;
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function setCanonical(href: string) {
  if (typeof document === "undefined") return;
  let link = document.querySelector(
    "link[rel='canonical']"
  ) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

/**
 * CorpusLandingRoute normalizes either slug-first or ID routes to a resolved
 * GraphQL ID, sets meta tags, and then renders the corpus view.
 */
export const CorpusLandingRoute: React.FC = () => {
  const { userIdent, corpusIdent, corpusId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const initialized = useRef(false);

  const [resolveBySlugs, slugQuery] = useLazyQuery(CORPUS_BY_SLUGS);
  const [resolveById, idQuery] = useLazyQuery(GET_CORPUS_METADATA);

  const onResolved = (c: any, cameFromIdRoute: boolean) => {
    if (!c) {
      navigate("/404", { replace: true });
      return;
    }
    openedCorpus(c);
    // Meta tags
    setTitle(c.title || "Corpus");
    setMeta("description", c.description || "");
    if (c.slug && c.creator?.slug) {
      const canonical = `/${c.creator.slug}/${c.slug}`;
      setCanonical(window.location.origin + canonical);
      // Only redirect if we came from an ID route to prevent loops
      if (cameFromIdRoute && location.pathname !== canonical) {
        navigate(canonical, { replace: true });
      }
    }
  };

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // slug-first route
    if (userIdent && corpusIdent) {
      resolveBySlugs({
        variables: { userSlug: userIdent, corpusSlug: corpusIdent },
      })
        .then((res) => onResolved(res.data?.corpusBySlugs, false))
        .catch(() => navigate("/404", { replace: true }));
      return;
    }

    // legacy id route
    if (corpusId) {
      if (!isLikelyGlobalId(corpusId)) {
        navigate("/404", { replace: true });
        return;
      }
      resolveById({ variables: { metadataForCorpusId: corpusId } })
        .then((res) => onResolved(res.data?.corpus, true))
        .catch(() => navigate("/404", { replace: true }));
      return;
    }

    // Fallback
    navigate("/404", { replace: true });
  }, [
    userIdent,
    corpusIdent,
    corpusId,
    resolveBySlugs,
    resolveById,
    navigate,
    location.pathname,
  ]);

  return <Corpuses />;
};

export default CorpusLandingRoute;
