import { useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DocumentKnowledgeBase } from "../knowledge_base";

/**
 * Route component that renders the Knowledge-Base modal for document-only
 * deep links: `/documents/:documentId` (optionally with ?ann=id1,id2)
 */
export const DocumentKBDocRoute = () => {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const annParam = searchParams.get("ann");
  const initialAnnotationIds = annParam
    ? annParam.split(",").filter(Boolean)
    : undefined;

  const handleClose = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  if (!documentId) return null;

  return (
    <DocumentKnowledgeBase
      documentId={documentId}
      initialAnnotationIds={initialAnnotationIds}
      onClose={handleClose}
    />
  );
};

export default DocumentKBDocRoute;
