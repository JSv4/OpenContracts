import React from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { DocumentKnowledgeBase } from "../knowledge_base";
import { MetaTags } from "../seo/MetaTags";
import {
  useSlugResolver,
  useCanonicalRedirect,
} from "../../hooks/useSlugResolver";
import { ModernLoadingDisplay } from "../widgets/ModernLoadingDisplay";
import { ModernErrorDisplay } from "../widgets/ModernErrorDisplay";
import { ErrorBoundary } from "../widgets/ErrorBoundary";
import { performanceMonitor } from "../../utils/performance";

/**
 * DocumentLandingRoute - Handles all document routes with explicit /d/ prefix
 *
 * Route patterns:
 * - /d/:userIdent/:corpusIdent/:docIdent (document within a corpus)
 * - /d/:userIdent/:docIdent (standalone document)
 *
 * Query parameters:
 * - ?ann=id1,id2,id3 - Comma-separated annotation IDs to select/highlight
 *
 * Example URLs:
 * - /d/john/my-document - Opens document
 * - /d/john/my-document?ann=123 - Opens document with annotation 123 selected
 * - /d/john/corpus/doc?ann=123,456 - Opens document in corpus with multiple annotations
 */
export const DocumentLandingRoute: React.FC = () => {
  const { userIdent, corpusIdent, docIdent } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Extract annotation IDs from query params
  const annParam = searchParams.get("ann");
  const annotationIds = annParam ? annParam.split(",").filter(Boolean) : [];

  // Build resolver parameters - much simpler now!
  const resolverParams = React.useMemo(() => {
    if (userIdent && corpusIdent && docIdent) {
      // Document within a corpus
      return {
        userIdent,
        corpusIdent,
        documentIdent: docIdent,
        annotationIds,
      };
    } else if (userIdent && docIdent && !corpusIdent) {
      // Standalone document
      return {
        userIdent,
        documentIdent: docIdent,
        annotationIds,
      };
    } else {
      // Invalid route - shouldn't happen with proper routing
      return {
        annotationIds,
      };
    }
  }, [userIdent, corpusIdent, docIdent, annotationIds]);

  // Track navigation performance
  React.useEffect(() => {
    performanceMonitor.startMetric("document-navigation", {
      route: window.location.pathname,
      hasCorpus: !!corpusIdent,
    });
    return () => {
      performanceMonitor.endMetric("document-navigation");
    };
  }, [corpusIdent]);

  // Use unified slug resolver
  const { loading, error, corpus, document } = useSlugResolver(resolverParams);

  // Handle canonical redirects for documents (with corpus context)
  useCanonicalRedirect(document, "document", corpus);

  // Handle close navigation
  const handleClose = React.useCallback(() => {
    // Navigate back to corpus if we have one, otherwise to documents list
    if (corpus && corpus.creator?.slug && corpus.slug) {
      const canonicalCorpusPath = `/c/${corpus.creator.slug}/${corpus.slug}`;
      navigate(canonicalCorpusPath);
    } else {
      navigate("/documents");
    }
  }, [corpus, navigate]);

  if (loading) {
    return <ModernLoadingDisplay type="document" size="large" />;
  }

  if (error || !document) {
    return (
      <ModernErrorDisplay
        type="document"
        error={error || "Document not found"}
      />
    );
  }

  return (
    <ErrorBoundary>
      <MetaTags
        title={document.title || "Document"}
        description={document.description || ""}
        entity={document}
        entityType="document"
      />
      <DocumentKnowledgeBase
        documentId={document.id}
        corpusId={corpus?.id}
        initialAnnotationIds={annotationIds}
        onClose={handleClose}
        readOnly={true}
      />
    </ErrorBoundary>
  );
};

export default DocumentLandingRoute;
