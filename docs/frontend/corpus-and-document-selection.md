## Frontend: Selected Corpus and Document State (with deep links)

This document explains how URL deep linking and selection state work for corpuses and documents. It covers the router routes, the global URL→state synchronizer, where we push navigation, and how components fetch and hydrate data.

### Terminology
- **Selected corpus**: The corpus the user is viewing or interacting with (e.g., its dashboard, documents, annotations, analyses, extracts, or settings).
- **Selected document**: A single document the user has opened for viewing or actions.
- **Reactive vars**: Apollo client-side reactive variables defined in `frontend/src/graphql/cache` (e.g., `openedCorpus`, `openedDocument`, and filter/search vars).

---

## Selected Corpus (Router-based in `Corpuses.tsx`)

The selected corpus is synchronized with the URL and reactive vars. The URL is the source of truth, and deep-links are supported.

- **Route param**: `:corpusId` (via `useParams`) indicates the intended selected corpus.
- **Two-way sync**:
  - Route → reactive var: When `corpusId` changes, the app sets `openedCorpus(...)` to match (from the list if present, or via a lazy fetch).
  - Reactive var → route: When `openedCorpus` changes, the app updates the URL to `/corpuses/:corpusId` (or `/corpuses` if cleared), guarding against flicker during initial loading.
- **Deep-link hydration**: If the selected corpus is not in the current paginated list, the app lazily fetches the corpus metadata by id and then hydrates `openedCorpus`.
- **Dependent data refresh**:
  - When `openedCorpus` updates, the app refreshes: corpus metadata via `GET_CORPUS_METADATA` and corpus stats via `GET_CORPUS_STATS` (polling every 5 seconds).
  - Search/query view state remains local UI state and is not reflected in the URL.
- **Auth guard**: On login/logout, the app refetches corpuses, refreshes metadata if authenticated, and clears selection and navigates to `/corpuses` on logout.

Key flows in `frontend/src/views/Corpuses.tsx`:

- Route `corpusId` → match in fetched list → `openedCorpus(match)`; otherwise trigger lazy fetch by id.
- On lazy fetch completion → `openedCorpus(corpusByIdData.corpus)`.
- On `opened_corpus` change → update URL and refresh metadata/stats; clear route if selection is removed after loading.

Result: The selected corpus is fully deep-linkable and shareable via URL, and switching corpuses drives the rest of the UI and data fetching.

---

## Selected Document (Router-based KB + reactive filters in lists)

We support deep links that open the Knowledge Base for a document with or without a corpus context. The global documents list and filters remain driven by reactive vars.

- Routes
  - `/corpus/:corpusId/document/:documentId` → opens KB with corpus context.
  - `/documents/:documentId` → opens KB in corpus-less mode.
  - Both support `?ann=id1,id2` to pre-select annotations.
- Lists and filters
  - The global list (`views/Documents.tsx`) uses reactive vars for filtering: `filterToCorpus`, `filterToLabelId`, `filterToLabelsetId`, `documentSearchTerm`.
  - Clicking a document navigates to the appropriate KB route (see State → URL navigation below).

---

## Routing overview

- `/corpuses` → Corpus list and dashboard navigation (`views/Corpuses.tsx`).
- `/corpuses/:corpusId` or `/corpus/:corpusId` → Selected corpus views (same component).
- `/corpus/:corpusId/document/:documentId` → KB with corpus (`components/routes/DocumentKBRoute.tsx`).
- `/documents` → Global documents list (`views/Documents.tsx`).
- `/documents/:documentId` → KB without corpus (`components/routes/DocumentKBDocRoute.tsx`).
- Optional query `?ann=id1,id2,...` on both document routes seeds selected annotation ids.

## URL → state synchronization

- Implemented centrally in `hooks/RouteStateSync.ts` and installed in `App.tsx`.
- On route changes, it updates reactive vars:
  - `/corpuses/:corpusId` or `/corpus/:corpusId` → `openedCorpus({ id })`.
  - `/corpus/:corpusId/document/:documentId` → `openedCorpus({ id })`, `openedDocument({ id })`.
  - `/documents/:documentId` → `openedDocument({ id })`.
  - `?ann=` → `selectedAnnotationIds([...])`.
- Navigating away clears selections where appropriate.

Note: This hook is one-way (URL → state) to avoid feedback loops. Components push navigation explicitly.

## State → URL navigation

- Corpuses (`views/Corpuses.tsx`)
  - Ensures URL reflects `opened_corpus`; fetches metadata by id on deep link (`GET_CORPUS_METADATA`) and polls stats (`GET_CORPUS_STATS`).
- Documents
  - `CorpusDocumentCards.tsx` handles click navigation:
    - If a corpus is active → `/corpus/:corpusId/document/:documentId`.
    - Otherwise → `/documents/:documentId`.
  - The `DocumentItem` context menu “Open Knowledge Base” follows the same rules.

## Deep-link hydration and data fetching

- KB with corpus: `DocumentKBRoute` renders `DocumentKnowledgeBase` with `documentId` and `corpusId`, which queries `GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS` and hydrates document, annotations, relationships, and corpus labels.
- KB without corpus: `DocumentKBDocRoute` renders `DocumentKnowledgeBase` with just `documentId`, which queries `GET_DOCUMENT_ONLY` and loads the viewer with editing disabled and an “Add to Corpus” ribbon.
- Both pass `onClose={() => navigate(-1)}` so closing returns to the previous route, and `DocumentKnowledgeBase` clears `openedDocument(null)` on unmount.

## Documents list and filters

- `views/Documents.tsx` builds `GET_DOCUMENTS` variables from reactive vars (`filterToCorpus`, `filterToLabelsetId`, `filterToLabelId`, `documentSearchTerm`) and refetches on changes.
- While any document has `backendLock`, a timer refetches periodically to surface progress.

## Quick reference

- Routes: `/corpuses`, `/corpuses/:corpusId` (or `/corpus/:corpusId`), `/corpus/:corpusId/document/:documentId`, `/documents`, `/documents/:documentId`, optional `?ann=...`.
- URL → state: `useRouteStateSync` updates `openedCorpus`, `openedDocument`, `selectedAnnotationIds`.
- State → URL: components navigate explicitly (corpus selection; document clicks/context menu).
- Deep-link hydration: corpuses `GET_CORPUS_METADATA`; documents with corpus `GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS`; documents without corpus `GET_DOCUMENT_ONLY` (uses `corpusSet`).

---

## Quick reference

- Selected corpus (today): URL param `:corpusId` ↔ `openedCorpus` with lazy hydration; dependent metadata/stats refreshed and polled.
- Selected document (today): `openedDocument` and `selectedDocumentIds` reactive vars only; deep-linking not yet supported.
- Document filters: `filterToCorpus`, `filterToLabelId`, `filterToLabelsetId`, and `documentSearchTerm` feed `GET_DOCUMENTS` variables.

