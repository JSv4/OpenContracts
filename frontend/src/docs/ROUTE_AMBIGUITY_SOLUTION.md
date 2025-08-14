# Route Ambiguity Solution

## Current Problem

The routes `/:userIdent/:corpusIdent` and `/:userIdent/:docIdent` both match the same URL pattern (2 segments), causing ambiguity. This leads to:

- Race conditions when resolving slugs
- Intermittent 404 errors
- Unnecessary GraphQL queries
- Poor user experience

## Immediate Fix (Implemented)

Created `SlugLandingRoute` that:

1. Waits for authentication to be ready
2. Fires both document and corpus queries in parallel
3. Uses whichever returns valid data
4. Properly handles all edge cases

## Recommended Long-Term Solution

### Option 1: Explicit Route Prefixes (Recommended)

Use unambiguous route patterns with clear prefixes:

```typescript
// Clear, unambiguous routes
<Route path="/c/:userIdent/:corpusIdent" element={<CorpusLandingRouteV2 />} />
<Route path="/d/:userIdent/:docIdent" element={<DocumentLandingRoute />} />
<Route path="/d/:userIdent/:corpusIdent/:docIdent" element={<DocumentLandingRoute />} />

// Legacy routes for backward compatibility
<Route path="/corpuses/:corpusId" element={<CorpusLandingRouteV2 />} />
<Route path="/documents/:documentId" element={<DocumentLandingRoute />} />
<Route path="/corpus/:corpusId/document/:documentId" element={<DocumentLandingRoute />} />

// Redirect old ambiguous routes to new ones
<Route path="/:userIdent/:secondIdent" element={<SlugRedirector />} />
```

Benefits:

- No ambiguity - routes are deterministic
- No need for disambiguation queries
- Better performance (single query per route)
- Clear URLs that indicate content type
- SEO-friendly with clear content hierarchy

### Option 2: Server-Side Type Resolution

Have the backend provide a single endpoint that:

1. Takes a slug path
2. Determines the type (corpus or document)
3. Returns the appropriate data with type indicator

```graphql
query ResolveSlugPath($userSlug: String!, $slug: String!) {
  resolveSlugPath(userSlug: $userSlug, slug: $slug) {
    __typename
    ... on CorpusType {
      id
      slug
      title
      # corpus fields
    }
    ... on DocumentType {
      id
      slug
      title
      # document fields
    }
  }
}
```

Benefits:

- Single query instead of two
- Backend has full context for resolution
- Can implement smart fallbacks
- Reduces client complexity

### Option 3: Content Type in URL

Include content type information in the URL structure:

```
/JSv4/corpus/my-corpus
/JSv4/document/my-document
/JSv4/corpus/my-corpus/document/my-doc
```

Benefits:

- Human-readable URLs
- No ambiguity
- Works well with REST principles
- Easy to implement

## Migration Strategy

1. **Phase 1**: Keep current SlugLandingRoute for backward compatibility
2. **Phase 2**: Update all internal navigation to use new explicit routes
3. **Phase 3**: Add redirects from old routes to new routes
4. **Phase 4**: Update external links and documentation
5. **Phase 5**: Eventually deprecate ambiguous routes

## Implementation Priority

1. **Immediate**: Use improved SlugLandingRoute with auth-awareness and parallel queries (DONE)
2. **Short-term**: Implement Option 1 with `/c/` and `/d/` prefixes
3. **Long-term**: Consider Option 2 for optimal performance

## Testing Requirements

- Test with authenticated and unauthenticated users
- Test cold navigation (new tab, direct URL)
- Test warm navigation (clicking links)
- Test page refresh on all route types
- Test with slow network conditions
- Test with GraphQL errors/timeouts
