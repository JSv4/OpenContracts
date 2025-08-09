# Corpus Dependencies Inventory for DocumentKnowledgeBase Component

## Overview
This document provides a comprehensive inventory of all dependencies on `corpus_id` or corpus being selected in the DocumentKnowledgeBase component and its children. These dependencies come from props, state stores, GraphQL queries, and various hooks.

## Primary Component: DocumentKnowledgeBase.tsx

### Direct Corpus Dependencies
- **Props**: 
  - `corpusId: string` (line 130) - Required prop passed to the component
- **GraphQL Query Variables**:
  - `corpusId` passed to `GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS` query (line 576)
  - Used in `refetch` calls (lines 749, 759)
- **Child Component Props**:
  - Passed to `ChatTray` component (line 1000)
  - Passed to `UnifiedKnowledgeLayer` component (line 1078)
  - Passed to `FloatingSummaryPreview` component (line 1223)
  - Passed to `NewNoteModal` component (line 1526)

### State Store Dependencies
- **CorpusAtom State** (via `useCorpusState` hook):
  - Sets corpus data via `setCorpus` function (lines 236, 423)
  - Updates `openedCorpus` reactive var (line 434)
  - Processes corpus permissions, label sets, and metadata (lines 377-425)

## Child Components and Their Corpus Dependencies

### 1. ChatTray Component (`right_tray/ChatTray.tsx`)
- **Props**: 
  - `corpusId?: string` (optional prop, line 143)
- **Usage**:
  - Passed to WebSocket URL construction via `getWebSocketUrl` (line 854)
  - Used to establish corpus-specific chat connections

### 2. FloatingSummaryPreview Component
- **Props**: 
  - `corpusId: string` (required prop, line 18)
- **Usage**:
  - Passed to `useSummaryVersions` hook (line 555)
  - Required for fetching document summary versions specific to the corpus

### 3. UnifiedKnowledgeLayer Component
- **Props**: 
  - `corpusId: string` (required prop, line 39)
- **Usage**:
  - Passed to `useSummaryVersions` hook (line 75)
  - Used for updating document summaries within corpus context

### 4. NewNoteModal Component
- **Props**: 
  - `corpusId?: string` (optional prop, line 15)
- **GraphQL Mutation**:
  - Passed to `CREATE_NOTE` mutation variables (line 44)
  - Associates new notes with the specific corpus

## Hooks and State Store Dependencies

### 1. useSummaryVersions Hook
- **Parameters**: 
  - Takes `corpusId: string` as parameter (line 27)
- **GraphQL Dependencies**:
  - Used in `GET_DOCUMENT_SUMMARY_VERSIONS` query (line 35)
  - Used in `UPDATE_DOCUMENT_SUMMARY` mutation (line 53)
- **Query Skip Condition**: 
  - Skips query if `!corpusId` (line 36)

### 2. CorpusAtom State Store (`annotator/context/CorpusAtom.tsx`)
- **State Structure**:
  ```typescript
  interface CorpusState {
    selectedCorpus: CorpusType | null | undefined;
    myPermissions: PermissionTypes[];
    spanLabels: AnnotationLabelType[];
    humanSpanLabels: AnnotationLabelType[];
    relationLabels: AnnotationLabelType[];
    docTypeLabels: AnnotationLabelType[];
    humanTokenLabels: AnnotationLabelType[];
    allowComments: boolean;
    isLoading: boolean;
  }
  ```
- **Usage Pattern**: 
  - Central store for corpus-related data
  - Updated when corpus is selected/loaded
  - Provides permission checks and label management

### 3. GraphQL Cache Dependencies
- **openedCorpus Reactive Variable**:
  - Global state management for currently opened corpus
  - Updated in `processAnnotationsData` function (line 434)
  - Cleared on component unmount (line 1127)

## GraphQL Query Dependencies

### 1. GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS
- **Variables**: Requires `corpusId` (line 576)
- **Response Processing**: 
  - Extracts corpus data including permissions and label sets
  - Updates CorpusAtom state with corpus information

### 2. GET_DOCUMENT_SUMMARY_VERSIONS
- **Variables**: Requires `corpusId` (line 35 in useSummaryVersions)
- **Purpose**: Fetches summary revision history for document within corpus

### 3. UPDATE_DOCUMENT_SUMMARY
- **Variables**: Requires `corpusId` (line 53 in useSummaryVersions)
- **Purpose**: Updates document summary within corpus context

### 4. CREATE_NOTE
- **Variables**: Optional `corpusId` (line 44 in NewNoteModal)
- **Purpose**: Associates notes with specific corpus

## WebSocket Dependencies

### Document Conversation WebSocket (`config/websocket/consumers/document_conversation.py`)
- **URL Construction**: Uses `corpusId` parameter in `getWebSocketUrl` function
- **Backend Requirements**:
  - **STRICT CORPUS REQUIREMENT**: The backend consumer REQUIRES a valid `corpus_id` in the WebSocket path (line 70-72)
  - Path format must be: `.../corpus/<GLOBAL_ID>/document/<GLOBAL_ID>/`
  - Connection is rejected if corpus_id is missing (lines 90-103)
  - Validates and loads both corpus and document from database (lines 117-118)
  - Error messages explicitly state "Missing corpus_id in WebSocket path"
- **Purpose**: Establishes corpus-specific real-time chat connections for document conversations

### Corpus Conversation WebSocket (`config/websocket/consumers/corpus_conversation.py`)
- **Backend Requirements**:
  - Only requires corpus_id (no document_id needed)
  - Validates corpus exists in database (line 75)
  - Creates corpus-level agents for broader corpus queries
- **Purpose**: Enables chat at the corpus level without document context

## Data Flow Summary

1. **Corpus ID Entry Point**: 
   - Passed as prop to DocumentKnowledgeBase component
   
2. **Initial Data Loading**:
   - Used in GraphQL query to fetch document and corpus data
   - Populates CorpusAtom state store
   - Sets global reactive variables

3. **Child Component Propagation**:
   - Passed down to all major child components
   - Used for corpus-specific operations (chat, summaries, notes)

4. **State Management**:
   - Centralized in CorpusAtom for corpus metadata
   - Permissions and labels derived from corpus data
   - Used throughout component tree for access control

## Key Observations

1. **Corpus ID is Required**: The DocumentKnowledgeBase component cannot function without a valid corpusId prop

2. **Pervasive Dependency**: Nearly all major features (chat, summaries, notes, annotations) require corpus context

3. **State Synchronization**: Corpus state is synchronized between:
   - Local component state
   - CorpusAtom state store
   - Apollo cache reactive variables

4. **Permission-Based Features**: Many UI elements and features are conditionally rendered based on corpus permissions

5. **Cleanup on Unmount**: Component properly cleans up corpus state on unmount, but maintains corpus selection in global state

6. **WebSocket Architecture Enforces Corpus Requirement**:
   - The backend DocumentQueryConsumer STRICTLY requires corpus_id in the WebSocket path
   - This is a hard requirement - the connection is rejected without it
   - The comment in the code explicitly states: "This consumer *requires* a valid ``corpus_id`` in the WebSocket path"
   - This means document-level chat functionality CANNOT work without a corpus context in the current architecture

## Recommendations for Refactoring

If corpus dependency needs to be made optional or removed:

1. **Make GraphQL Queries Conditional**: Add skip conditions for queries requiring corpusId
2. **Provide Default States**: Implement fallback behavior when corpus is not selected
3. **Abstract Corpus Operations**: Create a higher-order component or context provider for corpus-related operations
4. **Decouple Features**: Consider which features truly require corpus context vs. those that could work independently

### Critical Backend Changes Required

To enable document-only operations (without corpus context), the following backend changes would be necessary:

1. **Create New WebSocket Consumer**: 
   - Implement a new `DocumentOnlyQueryConsumer` that doesn't require corpus_id
   - Path format could be: `.../document/<GLOBAL_ID>/`
   - Would need different agent initialization logic

2. **Modify Existing Consumer**:
   - Update `DocumentQueryConsumer` to make corpus_id optional
   - Add conditional logic for corpus-less operation
   - Handle agent creation without corpus context

3. **Update Frontend WebSocket Logic**:
   - Modify `getWebSocketUrl` function to support corpus-optional paths
   - Update ChatTray component to handle connections without corpus_id

## Conclusion

The current architecture has a **hard dependency on corpus_id** for document-level chat functionality. This is enforced at the backend WebSocket level, making it impossible to have document conversations without a corpus context. Any refactoring to remove this dependency would require significant backend changes, not just frontend modifications.