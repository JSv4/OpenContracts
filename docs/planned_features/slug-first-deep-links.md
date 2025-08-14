# Slug-first Deep Links (User → Corpus → Document)

Status: Proposal • Owner: Frontend + Backend • Last updated: YYYY-MM-DD

## Summary

Introduce case-sensitive, slug-first deep links with GitHub-like semantics:

- `/:userSlug/:corpusSlug/:documentSlug[?ann=ids]` → open document KB within corpus context
- `/:userSlug/:corpusSlug` → open corpus view
- `/:userSlug/:documentSlug[?ann=ids]` → open document KB without corpus context

Maintain backward compatibility with existing ID-based routes. Support a fallback that accepts GraphQL global IDs in path segments using a `gid:` prefix when slugs are absent.

See also: `docs/frontend/corpus-and-document-selection.md` for current routing/state sync.

## Goals

- Human-readable, shareable deep links centered on user namespace.
- Preserve existing routes and flows during rollout.
- Keep URL → state sync one-way; components push navigation explicitly.
- Support public browsing by user (landing pages for corpuses and documents).

## URL Patterns

- Document in corpus: `/:userSlug/:corpusSlug/:documentSlug[?ann=id1,id2,...]`
- Corpus: `/:userSlug/:corpusSlug`
- Document without corpus: `/:userSlug/:documentSlug[?ann=id1,id2,...]`

Fallback (slug-or-ID): any of the segments may be a GraphQL global ID using `gid:<base64>` form. Example: `/:userIdent/:corpusIdent/:docIdent` where each ident is either a slug or `gid:...`.

## Slug Rules

- Case sensitivity: slugs are case-sensitive; `JSv4` ≠ `jsv4`.
- Allowed characters: `[A-Za-z0-9-]`; collapse repeated dashes; trim leading/trailing dashes.
- Length limits: User (≤64), Corpus (≤128), Document (≤128).
- Uniqueness scope:
  - User.slug: unique globally.
  - Corpus.slug: unique per creator (user).
  - Document.slug: unique per creator (user) to make `/:userSlug/:documentSlug` unambiguous across corpuses.
- Reserved top-level user slugs: `corpuses`, `corpus`, `documents`, `document`, `settings`, `login`, `logout`, `admin`, `api`, `graphql`. Keep extendable via settings.
- Auto-generation: if not provided, generate from title (or fallback) with suffixes `-2`, `-3`, ... on collisions within scope.

## Backend Changes (Django)

### Models

- users.models.User
  - Add `slug = models.SlugField(max_length=64, unique=True, db_index=True)`.
  - Validation: enforce allowed chars, length, reserved-name exclusion.

- corpuses.models.Corpus
  - Add `slug = models.SlugField(max_length=128, db_index=True)`.
  - Add unique constraint: `UniqueConstraint(fields=['creator', 'slug'], name='uniq_corpus_slug_per_creator_cs')`.

- documents.models.Document
  - Add `slug = models.SlugField(max_length=128, db_index=True)`.
  - Add unique constraint: `UniqueConstraint(fields=['creator', 'slug'], name='uniq_document_slug_per_creator_cs')`.

### Slug generation utility

- Central helper to normalize input, collapse dashes, enforce allowed chars/length, and apply a deterministic suffix strategy within a scope queryset to ensure uniqueness.
- Auto-generate document slugs by default when none provided.

### Data migrations

1) Add nullable `slug` fields and indexes.
2) Backfill slugs:
   - User: from `username`.
   - Corpus: from `title`.
   - Document: from `title` then `description` then `document-<pk>`.
   - Apply suffixes on collisions in the appropriate scope.
3) Set NOT NULL and add unique constraints as above.

## GraphQL API

### Fields

- Expose `slug` on `User`, `Corpus`, and `Document` types.

### Queries/Resolvers (read-only)

- `userBySlug(slug: String!): User`
- `corpusBySlugs(userSlug: String!, corpusSlug: String!): Corpus`
- `documentBySlugs(userSlug: String!, documentSlug: String!): Document`
- `documentInCorpusBySlugs(userSlug: String!, corpusSlug: String!, documentSlug: String!): Document`
  - Validates that the document belongs to the corpus; null/404 if not.

### Slug-or-ID resolution (fallback)

- Accept `gid:`-prefixed GraphQL Node IDs in place of slugs for any segment:
  - `resolveUser(namespace: String!): User`
  - `resolveCorpus(user: String!, corpus: String!): Corpus`
  - `resolveDocument(user: String!, doc: String!, corpus: String): Document`
- Resolution order per segment: exact slug match (case-sensitive) → `gid:` decode → not found.

### Permissions

- Apply existing permission gates and `is_public` checks.
- For user public browsing queries, return only public corpuses/documents where applicable.

## Frontend Changes

### Routes (case-sensitive)

- `/:userIdent`
- `/:userIdent/:corpusIdent`
- `/:userIdent/:corpusIdent/:docIdent`
- `/:userIdent/:docIdent`

Where each `*Ident` is either a slug or `gid:<base64>`.

### Hydration (URL → state)

Extend `hooks/RouteStateSync.ts` to resolve identifiers and set reactive vars:

- `/:userIdent/:corpusIdent` → set `openedCorpus({ id })`.
- `/:userIdent/:corpusIdent/:docIdent` → set `openedCorpus({ id })`, `openedDocument({ id })`.
- `/:userIdent/:docIdent` → set `openedDocument({ id })`.
- Preserve `?ann=` to seed `selectedAnnotationIds([...])`.

Slug/ID resolution happens via lightweight GraphQL lookups, then existing KB queries by ID are reused:

- With corpus → `GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS`.
- Without corpus → `GET_DOCUMENT_ONLY`.

### State → URL navigation

- Prefer slug-first routes when `user.slug` and corpus/document slugs are available.
- Fallback to legacy ID routes when any slug is missing.
- No redirects/canonicalization in this phase.

### Public browsing

- Add user landing pages:
  - `/:userSlug` → public corpuses overview and CTA to documents.
  - `/:userSlug/corpuses` → list public corpuses.
  - `/:userSlug/documents` → list public documents.

## Reserved Names

Reserved top-level user slugs (configurable via settings):

- `corpuses`, `corpus`, `documents`, `document`, `settings`, `login`, `logout`, `admin`, `api`, `graphql`

## Edge Cases

- Document not in corpus for `/:user/:corpus/:doc` → 404/null.
- Case sensitivity applies in DB constraints and resolvers; store/display slugs exactly as provided.
- Performance: add indexes on `(creator_id, slug)` for corpus/document and single-column index for user.

## Rollout Plan

1) Schema
   - Add slug fields and backfill; enforce constraints.

2) API
   - Expose `slug` fields; add slug resolvers and slug-or-ID resolution.
   - Surface slugs in details/settings pages (read-only initially).

3) Routing
   - Add new routes and URL→state hydration.
   - Update navigation to prefer slug URLs; keep legacy routes as fallback.

4) Optional (later)
   - Mutations to update slugs with validation (`updateUserSlug`, `updateCorpusSlug`, `updateDocumentSlug`).
   - Slug history and redirects if needed.

## Testing

- Backend
  - Slug generation, collision suffixing, and length enforcement.
  - Case-sensitive uniqueness and resolvers, including `gid:` fallback.
  - Permission gating and corpus-membership validation.

- Frontend
  - Router case-sensitive matching and hydration to `openedCorpus`/`openedDocument`.
  - Navigation emits slug URLs when available; legacy fallback otherwise.
  - `?ann=` seeding on slug routes.

- E2E
  - Shareable links for all three shapes; public vs private visibility.
  - User public landing pages load and paginate.

## Decisions (confirmed)

- URLs are case-sensitive.
- Document slugs are unique per user (not per corpus).
- Redirects/canonicalization deferred.
- Reserved name list confirmed; make extendable via settings.
- Add public browsing by user.
- Default slug generation when users do not provide a slug (especially for documents).
