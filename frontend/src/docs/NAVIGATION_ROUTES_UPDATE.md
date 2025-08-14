# Navigation Routes Update - Explicit Prefixes Implementation

## Overview

We've successfully implemented explicit route prefixes to eliminate the ambiguity in our 2-segment URL patterns. This makes the routing system deterministic, faster, and more maintainable.

## Changes Made

### 1. New Route Patterns

#### Before (Ambiguous)

```
/:userIdent/:corpusIdent    -> Could be a corpus
/:userIdent/:docIdent       -> Could be a document
```

#### After (Explicit)

```
/c/:userIdent/:corpusIdent  -> Always a corpus
/d/:userIdent/:docIdent      -> Always a document
/d/:userIdent/:corpusIdent/:docIdent -> Document in corpus
```

### 2. URL Structure

| Content Type              | New Pattern                              | Example                         |
| ------------------------- | ---------------------------------------- | ------------------------------- |
| **Corpus**                | `/c/:userIdent/:corpusIdent`             | `/c/john/my-corpus`             |
| **Document (standalone)** | `/d/:userIdent/:docIdent`                | `/d/john/my-document`           |
| **Document (in corpus)**  | `/d/:userIdent/:corpusIdent/:docIdent`   | `/d/john/my-corpus/my-document` |
| **Legacy corpus**         | `/corpuses/:corpusId`                    | `/corpuses/Q29ycHVzVHlwZTox`    |
| **Legacy document**       | `/documents/:documentId`                 | `/documents/RG9jVHlwZTox`       |
| **Legacy corpus+doc**     | `/corpus/:corpusId/document/:documentId` | `/corpus/123/document/456`      |

### 3. Backwards Compatibility

Old ambiguous URLs are automatically redirected to the new explicit URLs:

- `/john/my-corpus` → `/c/john/my-corpus`
- `/john/my-document` → `/d/john/my-document`

This is handled by the `LegacySlugRedirect` component which:

1. Checks if the content is a document or corpus
2. Redirects to the appropriate new URL
3. Shows 404 if neither type matches

### 4. Components Updated

- **App.tsx**: Updated routes to use explicit patterns
- **DocumentLandingRoute**: Removed `secondIdent` handling
- **CorpusLandingRouteV2**: Removed `secondIdent` handling
- **navigationUtils.ts**: Updated `getCorpusUrl()` and `getDocumentUrl()` to generate new URLs
- **LegacySlugRedirect**: New component for handling old URLs

### 5. Components Removed

- **SlugLandingRoute**: No longer needed with explicit routes

## Benefits

1. **No Ambiguity**: Routes are deterministic - no need to query both document and corpus
2. **Better Performance**: Single query per route instead of parallel queries
3. **Clearer URLs**: Users can tell from the URL whether they're viewing a corpus or document
4. **Simpler Code**: No complex disambiguation logic needed
5. **SEO Friendly**: Clear content hierarchy in URLs
6. **Faster Navigation**: No race conditions or auth timing issues

## Migration Guide

### For Developers

When creating links in code, use the utility functions which now generate the correct URLs:

```typescript
import { getCorpusUrl, getDocumentUrl } from "utils/navigationUtils";

// Generates: /c/john/my-corpus
const corpusUrl = getCorpusUrl(corpus);

// Generates: /d/john/my-corpus/my-document
const docUrl = getDocumentUrl(document, corpus);
```

### For Users

No action required! Old bookmarks and links will automatically redirect to the new URLs.

## Testing Checklist

- [x] Direct navigation to corpus: `/c/user/corpus`
- [x] Direct navigation to document: `/d/user/document`
- [x] Direct navigation to document in corpus: `/d/user/corpus/document`
- [x] Legacy URL redirect: `/user/corpus` → `/c/user/corpus`
- [x] Legacy URL redirect: `/user/document` → `/d/user/document`
- [x] Legacy ID routes still work: `/corpuses/id`, `/documents/id`
- [x] Navigation utilities generate correct URLs
- [x] No TypeScript errors in main code
- [x] Dev server runs without errors

## Future Considerations

1. **Update External Documentation**: Any external docs referencing URL patterns should be updated
2. **Update API Responses**: If the API returns URLs, consider updating to new format
3. **Analytics**: Update any analytics tracking to recognize new URL patterns
4. **Sitemap**: Regenerate sitemap with new URL structure
5. **Remove Legacy Support**: Eventually (after sufficient time), the legacy redirect can be removed
