import { useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DocumentKnowledgeBase } from "../knowledge_base";

/**
 * Route component that renders the Knowledge-Base modal when the url matches
 * `/corpus/:corpusId/document/:documentId` (optionally with ?ann=id1,id2)
 *
 * The component exists purely for deep-linking; it does **not** touch the
 * `showKnowledgeBaseModal` reactive-var so existing imperative flows continue
 * to function unchanged.
 */
export const DocumentKBRoute = () => {
  const { corpusId, documentId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Extract optional annotation id list from the query-param `ann`
  const annParam = searchParams.get("ann");
  const initialAnnotationIds = annParam
    ? annParam.split(",").filter(Boolean)
    : undefined;

  const handleClose = useCallback(() => {
    // Close the modal by navigating back to previous location
    navigate(-1);
  }, [navigate]);

  // Guard – react-router types allow undefined even though we know the route
  if (!corpusId || !documentId) return null;

  return (
    <DocumentKnowledgeBase
      documentId={documentId}
      corpusId={corpusId}
      initialAnnotationIds={initialAnnotationIds}
      onClose={handleClose}
    />
  );
};
