import React from "react";
import { useParams } from "react-router-dom";
import { Corpuses } from "../../views/Corpuses";
import { MetaTags } from "../seo/MetaTags";
import {
  useSlugResolver,
  useCanonicalRedirect,
} from "../../hooks/useSlugResolver";
import { LoadingSpinner } from "../widgets/LoadingSpinner";
import { ErrorBoundary } from "../widgets/ErrorBoundary";

/**
 * CorpusLandingRoute - Handles corpus routes with explicit /c/ prefix
 *
 * Route pattern:
 * - /c/:userIdent/:corpusIdent
 */
export const CorpusLandingRoute: React.FC = () => {
  const { userIdent, corpusIdent } = useParams();

  // Simple resolver parameters - only one pattern to handle!
  const resolverParams = React.useMemo(() => {
    if (userIdent && corpusIdent) {
      return {
        userIdent,
        corpusIdent,
      };
    }
    // Invalid route - shouldn't happen with proper routing
    return {};
  }, [userIdent, corpusIdent]);

  // Use unified slug resolver
  const { loading, error, corpus } = useSlugResolver(resolverParams);

  // Handle canonical redirects
  useCanonicalRedirect(corpus, "corpus");

  if (loading) {
    return (
      <div className="corpus-loading-container">
        <LoadingSpinner message="Loading corpus..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="corpus-error-container">
        <h2>Error loading corpus</h2>
        <p>{error.message}</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <MetaTags
        title={corpus?.title}
        description={corpus?.description}
        entity={corpus}
        entityType="corpus"
      />
      <Corpuses />
    </ErrorBoundary>
  );
};

export default CorpusLandingRoute;
