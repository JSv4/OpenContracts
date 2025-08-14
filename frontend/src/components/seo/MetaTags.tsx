import React from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { CorpusType, DocumentType } from "../../types/graphql-api";

// Note: You'll need to install react-helmet-async:
// yarn add react-helmet-async
// And wrap your app with HelmetProvider in index.tsx

interface MetaTagsProps {
  title?: string;
  description?: string;
  canonicalPath?: string;
  entity?: CorpusType | DocumentType | null;
  entityType?: "corpus" | "document";
}

/**
 * Centralized component for managing SEO meta tags.
 * Uses React Helmet for declarative meta tag management.
 */
export const MetaTags: React.FC<MetaTagsProps> = ({
  title,
  description,
  canonicalPath,
  entity,
  entityType,
}) => {
  const location = useLocation();
  const baseUrl = window.location.origin;

  // Derive meta values from entity if not explicitly provided
  const pageTitle = title || entity?.title || "OpenContracts";
  const pageDescription =
    description || entity?.description || "Legal document analysis platform";

  // Build canonical URL
  let canonical = canonicalPath;
  if (!canonical && entity && "creator" in entity) {
    const userSlug = entity.creator?.slug;
    const entitySlug = entity.slug;
    if (userSlug && entitySlug) {
      canonical = `/${userSlug}/${entitySlug}`;
    }
  }
  const canonicalUrl = canonical
    ? `${baseUrl}${canonical}`
    : `${baseUrl}${location.pathname}`;

  // OpenGraph image
  const ogImage = `${baseUrl}/og-image.png`; // You should add a default OG image

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{pageTitle}</title>
      <meta name="title" content={pageTitle} />
      <meta name="description" content={pageDescription} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={pageDescription} />
      <meta property="og:image" content={ogImage} />

      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={canonicalUrl} />
      <meta property="twitter:title" content={pageTitle} />
      <meta property="twitter:description" content={pageDescription} />
      <meta property="twitter:image" content={ogImage} />

      {/* Additional meta tags for entity-specific pages */}
      {entity && (
        <>
          <meta name="author" content={entity.creator?.username || "Unknown"} />
          {entity.isPublic === false && (
            <meta name="robots" content="noindex, nofollow" />
          )}
        </>
      )}
    </Helmet>
  );
};

/**
 * Hook to easily set meta tags from any component
 */
export function useMetaTags(props: MetaTagsProps) {
  return <MetaTags {...props} />;
}
