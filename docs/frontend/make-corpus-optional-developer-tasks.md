# Corpus-Optional Document Viewer - Developer Tasks

## Overview
Enable viewing documents without corpus membership while providing clear paths to unlock corpus features.

## Task Breakdown by Developer Level

### Frontend Infrastructure Tasks (Senior Dev - 2-3 days)

#### Task 1: Create Feature Configuration System
**Priority**: High  
**Complexity**: Medium
- [ ] Create `/frontend/src/config/features.ts` with FEATURE_FLAGS constant
- [ ] Define FeatureConfig interface with requiresCorpus, displayName, etc.
- [ ] Add feature flags for: CHAT, ANNOTATIONS, NOTES, SUMMARIES, SEARCH, ANALYSES, EXTRACTS
- [ ] Export type definitions for feature keys

#### Task 2: Build useFeatureAvailability Hook
**Priority**: High  
**Complexity**: Medium
- [ ] Create `/frontend/src/hooks/useFeatureAvailability.ts`
- [ ] Implement isFeatureAvailable(feature) function
- [ ] Implement getFeatureStatus(feature) function
- [ ] Add hasCorpus computed property
- [ ] Write comprehensive unit tests

#### Task 3: Create Document-Only GraphQL Query
**Priority**: High  
**Complexity**: Low
- [ ] Add GET_DOCUMENT_ONLY query to `/frontend/src/graphql/queries.ts`
- [ ] Include fields: id, title, fileType, creator, created, pdfFile, txtExtractFile, pawlsParseFile, myPermissions
- [ ] Add allNotesWithoutCorpus field (coordinate with backend)
- [ ] Add corpuses field to check if document belongs to any corpus

### Component Development Tasks (Mid-Level Dev - 3-4 days)

#### Task 4: Update DocumentKnowledgeBase Props
**Priority**: High  
**Complexity**: Medium
- [ ] Make corpusId prop optional in DocumentKnowledgeBaseProps interface
- [ ] Add showCorpusInfo and showSuccessMessage optional props
- [ ] Update prop validation and default values
- [ ] Update component documentation

#### Task 5: Implement Conditional GraphQL Query Logic
**Priority**: High  
**Complexity**: Medium
- [ ] Add conditional query selection based on corpusId presence
- [ ] Use GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS when corpusId exists
- [ ] Use GET_DOCUMENT_ONLY when no corpusId
- [ ] Handle loading and error states for both queries

#### Task 6: Create AddToCorpusModal Component
**Priority**: High  
**Complexity**: Medium
- [ ] Create `/frontend/src/components/modals/AddToCorpusModal.tsx`
- [ ] Implement GET_MY_CORPUSES query integration
- [ ] Add corpus list display with document counts
- [ ] Implement ADD_DOCUMENT_TO_CORPUS mutation
- [ ] Add loading states and error handling
- [ ] Navigate to corpus view on success

#### Task 7: Create FeatureUnavailable Component
**Priority**: Medium  
**Complexity**: Low
- [ ] Create `/frontend/src/components/common/FeatureUnavailable.tsx`
- [ ] Display feature name and disabled message
- [ ] Add "Add to Corpus" CTA when user has corpuses
- [ ] Style with appropriate icons and spacing

### Annotation Control Tasks (Senior Dev - 2-3 days)

#### Task 8: Implement Annotation Layer Control
**Priority**: High  
**Complexity**: High
- [ ] Create conditional annotation data functions in DocumentKnowledgeBase
- [ ] Implement getAnnotationsForMode() - returns empty array without corpus
- [ ] Implement getVisibleLabels() - returns empty array without corpus
- [ ] Create handleCreateAnnotation wrapper that checks for corpus

#### Task 9: Update PDF/TXT Renderers
**Priority**: High  
**Complexity**: High
- [ ] Update PDF component to accept conditional createAnnotationHandler
- [ ] Set read_only=true when no corpus
- [ ] Update TxtAnnotator props: annotations, read_only, allowInput, visibleLabels
- [ ] Pass no-op handlers when corpus not available
- [ ] Ensure SelectionLayer doesn't create annotations without corpus

#### Task 10: Update Annotation State Management
**Priority**: Medium  
**Complexity**: Medium
- [ ] Create useAnnotationsForMode hook that clears annotations without corpus
- [ ] Update useAnnotationControls to return null values without corpus
- [ ] Clear pdfAnnotationsAtom when viewing without corpus
- [ ] Prevent label selection without corpus context

### UI/UX Tasks (Mid-Level Dev - 2-3 days)

#### Task 11: Add Corpus-Less Mode Banner
**Priority**: High  
**Complexity**: Low
- [ ] Add info banner when !hasCorpus
- [ ] Display "Document Management Mode" header
- [ ] Include explanation text and "Add to Corpus" button
- [ ] Style with Semantic UI Message component

#### Task 12: Create Adaptive Floating Controls
**Priority**: Medium  
**Complexity**: Medium
- [ ] Update floating controls to check feature availability
- [ ] Always show search and notes buttons
- [ ] Show "Add to Corpus" button when no corpus
- [ ] Hide chat and annotation buttons without corpus
- [ ] Add tooltips explaining why features are disabled

#### Task 13: Implement Empty States
**Priority**: Medium  
**Complexity**: Low
- [ ] Create CorpusRequiredEmptyState component
- [ ] Use in annotation panel when no corpus
- [ ] Use in chat panel when no corpus
- [ ] Include icon, message, and "Add to Corpus" CTA

### Backend Tasks (Senior Dev - 1-2 days)

#### Task 14: Add Backend Support
**Priority**: High  
**Complexity**: Medium
- [ ] Add allNotesWithoutCorpus resolver to Document type
- [ ] Create addDocumentToCorpus mutation
- [ ] Add permission checks for corpus addition
- [ ] Return success status and corpus info
- [ ] Update GraphQL schema

### Testing Tasks (Mid-Level Dev - 2-3 days)

#### Task 15: Write Unit Tests
**Priority**: High  
**Complexity**: Medium
- [ ] Test DocumentKnowledgeBase renders without corpus
- [ ] Test feature visibility with/without corpus
- [ ] Test useFeatureAvailability hook
- [ ] Test annotation controls disabled without corpus
- [ ] Create comprehensive mock data

#### Task 16: Write Integration Tests
**Priority**: Medium  
**Complexity**: Medium
- [ ] Test complete corpus assignment flow
- [ ] Test feature progressive enhancement
- [ ] Test error cases (no corpuses, permissions)
- [ ] Test state transitions

#### Task 17: Write E2E Tests
**Priority**: Medium  
**Complexity**: High
- [ ] Create Playwright tests for document viewing without corpus
- [ ] Test annotation prevention
- [ ] Test corpus assignment user journey
- [ ] Test feature activation after assignment

## Implementation Order

### Phase 1: Core Infrastructure (Week 1)
1. Feature configuration system (Task 1)
2. useFeatureAvailability hook (Task 2)
3. GraphQL queries (Task 3)
4. Backend support (Task 14)
5. Update DocumentKnowledgeBase props (Task 4)

### Phase 2: Core Functionality (Week 2)
1. Conditional GraphQL logic (Task 5)
2. Annotation layer control (Task 8)
3. Update renderers (Task 9)
4. AddToCorpusModal (Task 6)
5. UI adaptations (Tasks 11-13)

### Phase 3: Polish & Testing (Week 3)
1. State management updates (Task 10)
2. FeatureUnavailable component (Task 7)
3. Floating controls (Task 12)
4. All testing tasks (Tasks 15-17)

## Success Criteria

- [ ] Documents load successfully without corpus
- [ ] All corpus features are properly hidden/disabled
- [ ] "Add to Corpus" flow works smoothly
- [ ] Features activate immediately after corpus assignment
- [ ] No console errors or warnings
- [ ] Performance is improved (load time < 1s)
- [ ] All tests passing with 90%+ coverage

## Technical Notes

### Key Dependencies
- Apollo Client for GraphQL
- Jotai for state management
- Semantic UI React for UI components
- pdfjs-dist for PDF rendering

### Breaking Changes
- corpusId is now optional in DocumentKnowledgeBase
- New GraphQL queries required
- Backend schema updates needed

### Migration Guide
Existing code using DocumentKnowledgeBase will continue to work unchanged. The component maintains backward compatibility when corpusId is provided.