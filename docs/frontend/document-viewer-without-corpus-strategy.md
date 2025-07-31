# Document Viewer Without Corpus Strategy

## Executive Summary

This document outlines a strategy for viewing documents that are not yet assigned to any corpus or where the user lacks corpus access permissions. This enables users to interact with documents in a document management context before they are organized into research corpuses, while maintaining the ability to add them to appropriate corpuses.

## Business Context

OpenContracts is both:
1. **A Document Management System**: Users need to view, organize, and manage documents
2. **A Research Platform**: Documents are organized into corpuses for collaborative analysis

Currently, DocumentKnowledgeBase assumes documents are already in a corpus. This strategy enables the "document management" use case where users need to:
- View documents that haven't been assigned to any corpus yet
- Preview documents they might want to add to their corpus
- Access documents where they lack corpus permissions but have document permissions
- Perform basic interactions (notes, search) before corpus assignment

## Core Principles

1. **Document-First Access**: Enable document viewing without corpus requirement
2. **Progressive Enhancement**: Add corpus features when corpus becomes available
3. **Corpus Assignment UI**: Allow adding documents to corpuses from the viewer
4. **Clear Feature States**: Show why features are unavailable and how to enable them
5. **Permission Clarity**: Distinguish document vs corpus permissions

## Feature Classification

### Always Available (Document-Level)
- Document viewing (PDF/TXT)
- Basic search within document
- Notes (already corpus-optional)
- Document metadata display
- Export/download document
- **Add to Corpus** action (if user has corpus creation permissions)

### Corpus-Required Features
- Chat/Conversations (WebSocket requires corpus context)
- Annotations (require corpus labelsets)
- Document summaries (designed for multi-perspective analysis)
- Analyses (corpus-scoped processing)
- Extracts (corpus-based data extraction)
- Collaborative features

### Enhancement When Corpus Added
- Full annotation capabilities
- AI-powered chat
- Collaborative summaries
- Advanced analysis tools
- Data extraction workflows

## Implementation Strategy

### 1. Configuration System

#### Feature Visibility Configuration
```typescript
// config/features.ts
export interface FeatureConfig {
  requiresCorpus: boolean;
  displayName: string;
  hideWhenUnavailable: boolean;
  disabledMessage?: string;
  fallbackBehavior?: 'hide' | 'disable' | 'show-message';
}

export const FEATURE_FLAGS = {
  CHAT: {
    requiresCorpus: true,
    displayName: 'Document Chat',
    hideWhenUnavailable: true,
    disabledMessage: 'Add to corpus to enable AI chat'
  },
  ANNOTATIONS: {
    requiresCorpus: true,
    displayName: 'Annotations',
    hideWhenUnavailable: true,
    disabledMessage: 'Add to corpus to annotate'
  },
  NOTES: {
    requiresCorpus: false,
    displayName: 'Notes',
    hideWhenUnavailable: false
  },
  SUMMARIES: {
    requiresCorpus: true,
    displayName: 'Document Summaries',
    hideWhenUnavailable: true,
    disabledMessage: 'Add to corpus for collaborative summaries'
  },
  SEARCH: {
    requiresCorpus: false,
    displayName: 'Document Search',
    hideWhenUnavailable: false
  },
  ANALYSES: {
    requiresCorpus: true,
    displayName: 'Document Analyses',
    hideWhenUnavailable: true,
    disabledMessage: 'Add to corpus to run analyses'
  },
  EXTRACTS: {
    requiresCorpus: true,
    displayName: 'Data Extracts',
    hideWhenUnavailable: true,
    disabledMessage: 'Add to corpus for data extraction'
  }
} as const;
```

#### Feature Availability Hook
```typescript
// hooks/useFeatureAvailability.ts
export const useFeatureAvailability = (corpusId?: string) => {
  const isFeatureAvailable = (feature: keyof typeof FEATURE_FLAGS): boolean => {
    const config = FEATURE_FLAGS[feature];
    return !config.requiresCorpus || Boolean(corpusId);
  };

  const getFeatureStatus = (feature: keyof typeof FEATURE_FLAGS) => {
    const config = FEATURE_FLAGS[feature];
    const available = isFeatureAvailable(feature);
    
    return {
      available,
      config,
      message: !available ? config.disabledMessage : undefined
    };
  };

  return {
    isFeatureAvailable,
    getFeatureStatus,
    hasCorpus: Boolean(corpusId)
  };
};
```

### 2. Component Modifications

#### Updated DocumentKnowledgeBase Props
```typescript
interface DocumentKnowledgeBaseProps {
  documentId: string;
  corpusId?: string;  // Now optional
  initialAnnotationIds?: string[];
  onClose?: () => void;
  readOnly?: boolean;
  // New props for corpus-less viewing
  showCorpusInfo?: boolean;
  showSuccessMessage?: string;
}
```

#### Conditional Rendering Pattern
```typescript
const DocumentKnowledgeBase: React.FC<DocumentKnowledgeBaseProps> = ({
  documentId,
  corpusId,
  showCorpusInfo,
  showSuccessMessage,
  ...
}) => {
  const { isFeatureAvailable, getFeatureStatus, hasCorpus } = useFeatureAvailability(corpusId);
  const [showAddToCorpus, setShowAddToCorpus] = useState(false);
  
  // Conditional GraphQL query
  const { data, loading, error } = useQuery(
    corpusId ? GET_DOCUMENT_KNOWLEDGE_AND_ANNOTATIONS : GET_DOCUMENT_ONLY,
    {
      variables: corpusId 
        ? { documentId, corpusId } 
        : { documentId },
      skip: !documentId
    }
  );

  // Render features conditionally
  return (
    <>
      {/* Success message if just added to corpus */}
      {showSuccessMessage && (
        <Message success>
          <Message.Header>{showSuccessMessage}</Message.Header>
        </Message>
      )}
      
      {/* Info banner for corpus-less mode */}
      {!hasCorpus && (
        <Message info>
          <Message.Header>
            Document Management Mode
          </Message.Header>
          <p>
            Add this document to a corpus to unlock collaborative features.
            <Button 
              primary 
              size="small" 
              onClick={() => setShowAddToCorpus(true)}
              style={{ marginLeft: '1em' }}
            >
              <Icon name="plus" /> Add to Corpus
            </Button>
          </p>
        </Message>
      )}
      
      {/* Always show document viewer */}
      <DocumentViewer ... />
      
      {/* Conditionally show chat */}
      {isFeatureAvailable('CHAT') ? (
        <ChatTray corpusId={corpusId!} ... />
      ) : (
        <FeatureUnavailable 
          feature="CHAT" 
          documentId={documentId}
          onAddToCorpus={() => setShowAddToCorpus(true)}
        />
      )}
      
      {/* Notes work with or without corpus */}
      <NotesPanel corpusId={corpusId} ... />
      
      {/* Add to corpus modal */}
      <AddToCorpusModal
        documentId={documentId}
        open={showAddToCorpus}
        onClose={() => setShowAddToCorpus(false)}
        onSuccess={(newCorpusId) => {
          // Reload with corpus context
          window.location.href = `/corpus/${newCorpusId}/document/${documentId}`;
        }}
      />
    </>
  );
};
```

### 3. GraphQL Query Modifications

#### New Document-Only Query
```graphql
# queries.ts
export const GET_DOCUMENT_ONLY = gql`
  query GetDocumentOnly($documentId: String!) {
    document(id: $documentId) {
      id
      title
      fileType
      creator {
        email
      }
      created
      pdfFile
      txtExtractFile
      pawlsParseFile
      myPermissions
      # Document-level notes (no corpus required)
      allNotesWithoutCorpus {
        id
        title
        content
        creator {
          email
        }
        created
      }
      # Check if document is in any corpus (for UI hints)
      corpuses {
        id
        title
      }
    }
  }
`;

# Add document to corpus mutation
export const ADD_DOCUMENT_TO_CORPUS = gql`
  mutation AddDocumentToCorpus($documentId: ID!, $corpusId: ID!) {
    addDocumentToCorpus(documentId: $documentId, corpusId: $corpusId) {
      success
      message
      corpus {
        id
        title
      }
    }
  }
`;
```

### 4. UI Components

#### Feature Unavailable Component with Corpus Assignment CTA
```typescript
const FeatureUnavailable: React.FC<{ 
  feature: keyof typeof FEATURE_FLAGS;
  documentId: string;
  onAddToCorpus?: () => void;
  className?: string;
}> = ({ feature, documentId, onAddToCorpus, className }) => {
  const { getFeatureStatus } = useFeatureAvailability();
  const status = getFeatureStatus(feature);
  const { data: userCorpuses } = useQuery(GET_MY_CORPUSES);
  
  if (status.available) return null;
  
  return (
    <div className={`feature-unavailable ${className}`}>
      <Icon name="folder open" />
      <p>{status.config.displayName}</p>
      <small>{status.message}</small>
      
      {userCorpuses?.corpuses?.length > 0 && (
        <Button 
          size="small" 
          primary 
          onClick={onAddToCorpus}
        >
          <Icon name="plus" /> Add to Corpus
        </Button>
      )}
    </div>
  );
};

// Add to Corpus Modal
const AddToCorpusModal: React.FC<{
  documentId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: (corpusId: string) => void;
}> = ({ documentId, open, onClose, onSuccess }) => {
  const { data } = useQuery(GET_MY_CORPUSES);
  const [addDocument] = useMutation(ADD_DOCUMENT_TO_CORPUS);
  
  const handleAdd = async (corpusId: string) => {
    await addDocument({ 
      variables: { documentId, corpusId } 
    });
    onSuccess(corpusId);
    toast.success('Document added to corpus');
  };
  
  return (
    <Modal open={open} onClose={onClose}>
      <Modal.Header>Add Document to Corpus</Modal.Header>
      <Modal.Content>
        <p>Select a corpus to enable advanced features:</p>
        <List divided>
          {data?.corpuses?.map(corpus => (
            <List.Item key={corpus.id}>
              <List.Content floated="right">
                <Button 
                  primary 
                  size="small"
                  onClick={() => handleAdd(corpus.id)}
                >
                  Add
                </Button>
              </List.Content>
              <List.Content>
                <List.Header>{corpus.title}</List.Header>
                <List.Description>
                  {corpus.documentCount} documents
                </List.Description>
              </List.Content>
            </List.Item>
          ))}
        </List>
      </Modal.Content>
    </Modal>
  );
};
```

#### Adaptive UI Controls with Add to Corpus
```typescript
// Floating controls that adapt based on corpus availability
const AdaptiveFloatingControls: React.FC<{
  corpusId?: string;
  documentId: string;
}> = ({ corpusId, documentId }) => {
  const { isFeatureAvailable, hasCorpus } = useFeatureAvailability(corpusId);
  const [showAddToCorpus, setShowAddToCorpus] = useState(false);
  
  return (
    <>
      <FloatingControlsContainer>
        {/* Always available */}
        <Button icon="search" title="Search document" />
        <Button icon="sticky-note" title="Add note" />
        
        {/* Show add to corpus if no corpus */}
        {!hasCorpus && (
          <Button 
            icon="folder plus" 
            title="Add to corpus"
            onClick={() => setShowAddToCorpus(true)}
            color="blue"
          />
        )}
        
        {/* Corpus-dependent features */}
        {isFeatureAvailable('CHAT') && (
          <Button icon="message" title="Open chat" />
        )}
        
        {isFeatureAvailable('ANNOTATIONS') && (
          <Button icon="highlighter" title="Add annotation" />
        )}
      </FloatingControlsContainer>
      
      <AddToCorpusModal
        documentId={documentId}
        open={showAddToCorpus}
        onClose={() => setShowAddToCorpus(false)}
        onSuccess={(newCorpusId) => {
          // Reload the component with the new corpus context
          window.location.href = `/corpus/${newCorpusId}/document/${documentId}`;
        }}
      />
    </>
  );
};
```

### 5. Migration Path

#### Phase 1: Infrastructure (Week 1)
1. Make corpusId optional in DocumentKnowledgeBase props
2. Create GET_DOCUMENT_ONLY GraphQL query
3. Add ADD_DOCUMENT_TO_CORPUS mutation
4. Implement feature availability hook

#### Phase 2: Component Updates (Week 2)
1. Add conditional GraphQL query logic
2. Build AddToCorpusModal component
3. Implement conditional rendering for each feature
4. Create corpus-less UI states

#### Phase 3: Testing & Polish (Week 3)
1. Test document viewing without corpus
2. Test corpus assignment flow
3. Verify feature activation after assignment
4. Add comprehensive error handling

### 6. Usage Scenarios

#### Scenario 1: Viewing Document in Corpus (Current)
```typescript
// No changes - full feature set available
<DocumentKnowledgeBase
  documentId={documentId}
  corpusId={corpusId}
  onClose={handleClose}
/>
```

#### Scenario 2: Viewing Unassigned Document
```typescript
// Document not in any corpus yet
<DocumentKnowledgeBase
  documentId={documentId}
  // No corpusId - shows add to corpus options
  onClose={handleClose}
/>
```

#### Scenario 3: Document in Inaccessible Corpus
```typescript
// User can see document but not the corpus it's in
<DocumentKnowledgeBase
  documentId={documentId}
  // No corpusId provided due to permissions
  showCorpusInfo={true} // Shows "Document is in a corpus you cannot access"
  onClose={handleClose}
/>
```

#### Scenario 4: After Adding to Corpus
```typescript
// Component reloads with corpus context after successful add
<DocumentKnowledgeBase
  documentId={documentId}
  corpusId={newlyAddedCorpusId} // Now has full features
  showSuccessMessage="Document added to corpus!"
  onClose={handleClose}
/>
```

### 7. Future Extensibility

#### Adding New Corpus-Optional Features
1. Add feature to FEATURE_FLAGS configuration
2. Update component to check feature availability
3. Implement corpus-optional backend support if needed
4. Add UI adaptation for the feature

#### Example: Adding Comments
```typescript
// Add to FEATURE_FLAGS
COMMENTS: {
  requiresCorpus: false,  // Comments could work without corpus
  displayName: 'Comments',
  hideWhenUnavailable: false
}

// In component
{isFeatureAvailable('COMMENTS') && (
  <CommentsPanel 
    documentId={documentId} 
    corpusId={corpusId}  // Optional
  />
)}
```

## UI/UX Considerations

### Visual Indicators

1. **No Corpus State**
   - Subtle banner: "This document is not in any corpus"
   - Prominent "Add to Corpus" button
   - Disabled features show tooltips explaining why

2. **Inaccessible Corpus State**
   - Info banner: "This document belongs to a corpus you cannot access"
   - Option to request access (if applicable)
   - Show which features would be available with access

3. **Success State**
   - Success toast after adding to corpus
   - Smooth transition as features become available
   - Highlight newly available features briefly

### Empty States

```typescript
const CorpusRequiredEmptyState: React.FC<{
  feature: string;
  onAddToCorpus: () => void;
}> = ({ feature, onAddToCorpus }) => (
  <EmptyState>
    <Icon name="folder open outline" size="huge" color="grey" />
    <Header as="h3">{feature} requires corpus membership</Header>
    <p>
      Add this document to one of your corpuses to enable collaborative features
      like annotations, AI chat, and data extraction.
    </p>
    <Button primary onClick={onAddToCorpus}>
      <Icon name="plus" /> Add to Corpus
    </Button>
  </EmptyState>
);
```

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
1. Make corpusId optional in DocumentKnowledgeBase
2. Implement feature availability detection
3. Create document-only GraphQL query
4. Add corpus assignment mutations

### Phase 2: UI Adaptations (Week 2)
1. Build AddToCorpusModal component
2. Create feature unavailable states
3. Add visual indicators for no-corpus mode
4. Implement smooth transitions after corpus assignment

### Phase 3: Polish & Edge Cases (Week 3)
1. Handle permission edge cases
2. Add loading states during corpus assignment
3. Implement success animations
4. Create comprehensive test suite

## Annotation Layer Control Strategy

### Understanding Annotation Components

#### TxtAnnotator Component
The TxtAnnotator component controls annotations through several props:
```typescript
interface TxtAnnotatorProps {
  annotations: ServerSpanAnnotation[];  // Annotations to display
  read_only: boolean;                   // Disables all editing
  allowInput: boolean;                  // Controls new annotation creation
  visibleLabels: AnnotationLabelType[] | null;  // Filters visible annotations
  createAnnotation: (annotation: ServerSpanAnnotation) => void;
  updateAnnotation: (annotation: ServerSpanAnnotation) => void;
  deleteAnnotation: (annotation_id: string) => void;
  approveAnnotation?: (annot_id: string, comment?: string) => void;
  rejectAnnotation?: (annot_id: string, comment?: string) => void;
}
```

#### PDF Component
The PDF renderer controls annotations through:
```typescript
interface PDFProps {
  read_only: boolean;
  createAnnotationHandler: (annotation: ServerTokenAnnotation) => Promise<void>;
}
```

#### SelectionLayer Component
Handles new annotation creation in PDFs:
```typescript
interface SelectionLayerProps {
  read_only: boolean;
  activeSpanLabel: AnnotationLabelType | null;  // Required for creation
  createAnnotation: (annotation: ServerTokenAnnotation) => void;
}
```

### Implementation Approach

#### 1. Annotation Visibility Control
```typescript
// In DocumentKnowledgeBase component
const getAnnotationsForMode = () => {
  if (!corpusId) {
    // No corpus = no annotations
    return [];
  }
  return data?.annotations || [];
};

const getVisibleLabels = () => {
  if (!corpusId) {
    // No corpus = no labels visible
    return [];
  }
  return visibleLabels;
};
```

#### 2. Annotation Creation Control
```typescript
// Conditional handler creation
const handleCreateAnnotation = useCallback(
  async (annotation: ServerTokenAnnotation) => {
    if (!corpusId) {
      toast.warning('Add document to corpus to create annotations');
      return;
    }
    // Normal creation logic
    await createAnnotation(annotation);
  },
  [corpusId, createAnnotation]
);

// For TxtAnnotator
<TxtAnnotator
  annotations={getAnnotationsForMode()}
  read_only={!corpusId || readOnly}
  allowInput={Boolean(corpusId) && !readOnly}
  visibleLabels={getVisibleLabels()}
  createAnnotation={corpusId ? handleCreateAnnotation : () => {}}
  updateAnnotation={corpusId ? updateAnnotation : () => {}}
  deleteAnnotation={corpusId ? deleteAnnotation : () => {}}
/>

// For PDF
<PDF
  read_only={!corpusId || readOnly}
  createAnnotationHandler={corpusId ? handleCreateAnnotation : async () => {}}
/>
```

#### 3. UI Controls Visibility
```typescript
// Annotation controls in toolbar
const AnnotationControls: React.FC<{ hasCorpus: boolean }> = ({ hasCorpus }) => {
  if (!hasCorpus) {
    return (
      <Tooltip title="Add to corpus to enable annotations">
        <Button icon="highlighter" disabled />
      </Tooltip>
    );
  }
  
  return (
    <>
      <Button icon="highlighter" onClick={openAnnotationPanel} />
      <LabelSelector />
      <AnnotationFilters />
    </>
  );
};
```

#### 4. Annotation Panel Adaptation
```typescript
// Unified annotation list/panel
const AnnotationPanel: React.FC<{ corpusId?: string }> = ({ corpusId }) => {
  if (!corpusId) {
    return (
      <EmptyState>
        <Icon name="highlighter" size="large" />
        <Header>Annotations require corpus membership</Header>
        <p>Add this document to a corpus to view and create annotations.</p>
        <Button primary onClick={openAddToCorpus}>
          Add to Corpus
        </Button>
      </EmptyState>
    );
  }
  
  // Normal annotation list
  return <AnnotationList ... />;
};
```

### State Management Updates

#### 1. Annotation Atoms
```typescript
// Conditional atom updates
export const useAnnotationsForMode = (corpusId?: string) => {
  const [annotations, setAnnotations] = useAtom(pdfAnnotationsAtom);
  
  // Clear annotations when no corpus
  useEffect(() => {
    if (!corpusId) {
      setAnnotations({});
    }
  }, [corpusId, setAnnotations]);
  
  return corpusId ? annotations : {};
};
```

#### 2. Label Selection State
```typescript
// Disable label selection without corpus
export const useAnnotationControls = (corpusId?: string) => {
  const controls = useOriginalAnnotationControls();
  
  if (!corpusId) {
    return {
      ...controls,
      activeSpanLabel: null,
      setActiveSpanLabel: () => {},
      spanLabelsToView: [],
    };
  }
  
  return controls;
};
```

### Edge Cases and Considerations

1. **Existing Annotations**: If a document has annotations from when it was in a corpus, don't display them in corpus-less mode
2. **Search Highlighting**: Keep search highlighting functional (it's not an annotation)
3. **Chat Sources**: Keep chat source highlighting if chat is somehow enabled
4. **Performance**: Don't fetch annotation data in document-only GraphQL query
5. **Clear Messaging**: Always explain why annotations are unavailable

## Technical Considerations

### Performance
1. **Lighter Initial Load**: No corpus data, annotations, or WebSocket connections
2. **Progressive Loading**: Corpus features load only when needed
3. **Cached Corpus List**: User's available corpuses cached for quick access
4. **Optimistic Updates**: UI updates immediately on corpus assignment
5. **No Annotation Rendering**: Skip annotation layer rendering entirely when no corpus

### Security
1. **Document Permissions**: Enforced regardless of corpus membership
2. **Corpus Addition**: Only allowed if user has corpus edit permissions
3. **Feature Gating**: Corpus features remain inaccessible without proper context
4. **Audit Trail**: Document-to-corpus assignments are logged
5. **Annotation Access**: No annotation data exposed without corpus context

### Data Flow
1. **Document-Only Query**: Fetches only document data and document-level features
2. **Corpus Assignment**: Triggers full data refresh with corpus context
3. **State Management**: Smooth transition from document-only to corpus mode
4. **Cache Updates**: Apollo cache updated to reflect new corpus membership
5. **Annotation State**: Cleared when viewing without corpus, populated when corpus available

### Example: Complete Integration

```typescript
// In DocumentKnowledgeBase.tsx
const DocumentKnowledgeBase: React.FC<DocumentKnowledgeBaseProps> = ({
  documentId,
  corpusId,
  readOnly = false,
  ...
}) => {
  const { isFeatureAvailable } = useFeatureAvailability(corpusId);
  
  // Conditional annotation data
  const annotations = useMemo(() => {
    if (!corpusId || !data?.annotations) return [];
    return data.annotations;
  }, [corpusId, data]);
  
  // Conditional handlers
  const createAnnotationHandler = useCallback(
    async (annotation: ServerTokenAnnotation) => {
      if (!corpusId) {
        toast.info('Add document to corpus to create annotations');
        return;
      }
      await createAnnotation(annotation);
    },
    [corpusId, createAnnotation]
  );
  
  return (
    <>
      {/* Document viewer with conditional annotations */}
      {documentType === 'application/pdf' ? (
        <PDF
          read_only={!corpusId || readOnly}
          createAnnotationHandler={createAnnotationHandler}
        />
      ) : (
        <TxtAnnotator
          text={documentText}
          annotations={annotations}
          read_only={!corpusId || readOnly}
          allowInput={Boolean(corpusId) && !readOnly}
          visibleLabels={corpusId ? visibleLabels : []}
          createAnnotation={corpusId ? createAnnotationHandler : () => {}}
          updateAnnotation={corpusId ? updateAnnotation : () => {}}
          deleteAnnotation={corpusId ? deleteAnnotation : () => {}}
        />
      )}
      
      {/* Annotation controls - hidden without corpus */}
      {isFeatureAvailable('ANNOTATIONS') && (
        <FloatingAnnotationControls />
      )}
      
      {/* Right panel with conditional content */}
      <RightPanel>
        {!corpusId && (
          <CorpusRequiredMessage onAddToCorpus={openAddToCorpusModal} />
        )}
        
        {corpusId && (
          <>
            <AnnotationList annotations={annotations} />
            <ChatTray corpusId={corpusId} />
          </>
        )}
        
        {/* Notes work regardless */}
        <NotesPanel documentId={documentId} corpusId={corpusId} />
      </RightPanel>
    </>
  );
};
```

## Testing Strategy

### Unit Tests

#### Component Tests
```typescript
// DocumentKnowledgeBase.test.tsx
describe('DocumentKnowledgeBase Corpus-Optional Mode', () => {
  // Basic rendering tests
  it('should render without corpus', () => {
    const { container } = render(
      <MockedProvider mocks={[documentOnlyMock]}>
        <DocumentKnowledgeBase documentId="123" />
      </MockedProvider>
    );
    expect(container).toBeTruthy();
  });
  
  it('should show add to corpus banner when no corpus provided', () => {
    const { getByText } = render(
      <MockedProvider mocks={[documentOnlyMock]}>
        <DocumentKnowledgeBase documentId="123" />
      </MockedProvider>
    );
    expect(getByText('Document Management Mode')).toBeInTheDocument();
    expect(getByText('Add to Corpus')).toBeInTheDocument();
  });
  
  // Feature visibility tests
  it('should hide chat when no corpus', () => {
    const { queryByTestId } = render(
      <MockedProvider mocks={[documentOnlyMock]}>
        <DocumentKnowledgeBase documentId="123" />
      </MockedProvider>
    );
    expect(queryByTestId('chat-tray')).not.toBeInTheDocument();
  });
  
  it('should show notes panel without corpus', () => {
    const { getByTestId } = render(
      <MockedProvider mocks={[documentOnlyMock]}>
        <DocumentKnowledgeBase documentId="123" />
      </MockedProvider>
    );
    expect(getByTestId('notes-panel')).toBeInTheDocument();
  });
  
  // Annotation control tests
  it('should disable annotation creation without corpus', () => {
    const { queryByTestId } = render(
      <MockedProvider mocks={[documentOnlyMock]}>
        <DocumentKnowledgeBase documentId="123" />
      </MockedProvider>
    );
    expect(queryByTestId('annotation-toolbar')).not.toBeInTheDocument();
  });
  
  it('should not render annotations without corpus', () => {
    const { queryAllByTestId } = render(
      <MockedProvider mocks={[documentOnlyMock]}>
        <DocumentKnowledgeBase documentId="123" />
      </MockedProvider>
    );
    expect(queryAllByTestId(/^annotation-/)).toHaveLength(0);
  });
});
```

#### Hook Tests
```typescript
// useFeatureAvailability.test.tsx
describe('useFeatureAvailability', () => {
  it('should return false for corpus features without corpus', () => {
    const { result } = renderHook(() => useFeatureAvailability());
    
    expect(result.current.isFeatureAvailable('CHAT')).toBe(false);
    expect(result.current.isFeatureAvailable('ANNOTATIONS')).toBe(false);
    expect(result.current.isFeatureAvailable('SUMMARIES')).toBe(false);
  });
  
  it('should return true for non-corpus features', () => {
    const { result } = renderHook(() => useFeatureAvailability());
    
    expect(result.current.isFeatureAvailable('NOTES')).toBe(true);
    expect(result.current.isFeatureAvailable('SEARCH')).toBe(true);
  });
  
  it('should return true for all features with corpus', () => {
    const { result } = renderHook(() => useFeatureAvailability('corpus-123'));
    
    expect(result.current.isFeatureAvailable('CHAT')).toBe(true);
    expect(result.current.isFeatureAvailable('ANNOTATIONS')).toBe(true);
    expect(result.current.hasCorpus).toBe(true);
  });
});
```

#### Annotation Component Tests
```typescript
// TxtAnnotator.test.tsx
describe('TxtAnnotator without corpus', () => {
  const noOpHandler = jest.fn();
  
  it('should not allow text selection when allowInput is false', () => {
    const { container } = render(
      <TxtAnnotator
        text="Sample text"
        annotations={[]}
        read_only={true}
        allowInput={false}
        visibleLabels={[]}
        createAnnotation={noOpHandler}
        updateAnnotation={noOpHandler}
        deleteAnnotation={noOpHandler}
      />
    );
    
    // Simulate text selection
    fireEvent.mouseUp(container);
    expect(noOpHandler).not.toHaveBeenCalled();
  });
  
  it('should not render annotations when empty array provided', () => {
    const { queryAllByTestId } = render(
      <TxtAnnotator
        text="Sample text"
        annotations={[]}
        visibleLabels={[]}
        // ... other props
      />
    );
    
    expect(queryAllByTestId('annotated-span')).toHaveLength(0);
  });
});
```

### Integration Tests

#### Corpus Assignment Flow
```typescript
// corpus-assignment.integration.test.tsx
describe('Corpus Assignment Integration', () => {
  it('should handle complete corpus assignment flow', async () => {
    const mocks = [
      documentOnlyMock,
      myCorpusesMock,
      addDocumentToCorpusMock,
    ];
    
    const { getByText, getByRole } = render(
      <MockedProvider mocks={mocks}>
        <DocumentKnowledgeBase documentId="123" />
      </MockedProvider>
    );
    
    // Click add to corpus
    fireEvent.click(getByText('Add to Corpus'));
    
    // Wait for modal and corpus list
    await waitFor(() => {
      expect(getByText('Select a corpus to enable advanced features')).toBeInTheDocument();
    });
    
    // Select a corpus
    fireEvent.click(getByText('My Research Corpus'));
    
    // Verify navigation
    await waitFor(() => {
      expect(window.location.href).toContain('/corpus/456/document/123');
    });
  });
  
  it('should show appropriate message when user has no corpuses', async () => {
    const mocks = [
      documentOnlyMock,
      emptyCorpusesMock,
    ];
    
    const { getByText, queryByText } = render(
      <MockedProvider mocks={mocks}>
        <DocumentKnowledgeBase documentId="123" />
      </MockedProvider>
    );
    
    fireEvent.click(getByText('Add to Corpus'));
    
    await waitFor(() => {
      expect(queryByText('Select a corpus')).not.toBeInTheDocument();
      expect(getByText('No corpuses available')).toBeInTheDocument();
    });
  });
});
```

#### Feature Toggle Tests
```typescript
// feature-toggle.integration.test.tsx
describe('Feature Availability Integration', () => {
  it('should progressively enable features when corpus is added', async () => {
    const { rerender, queryByTestId, getByTestId } = render(
      <MockedProvider mocks={[documentOnlyMock]}>
        <DocumentKnowledgeBase documentId="123" />
      </MockedProvider>
    );
    
    // Initially no corpus features
    expect(queryByTestId('chat-tray')).not.toBeInTheDocument();
    expect(queryByTestId('annotation-list')).not.toBeInTheDocument();
    expect(getByTestId('notes-panel')).toBeInTheDocument();
    
    // Rerender with corpus
    rerender(
      <MockedProvider mocks={[documentWithCorpusMock]}>
        <DocumentKnowledgeBase documentId="123" corpusId="456" />
      </MockedProvider>
    );
    
    // Now corpus features should be available
    await waitFor(() => {
      expect(getByTestId('chat-tray')).toBeInTheDocument();
      expect(getByTestId('annotation-list')).toBeInTheDocument();
    });
  });
});
```

### E2E Tests

#### Playwright Tests
```typescript
// document-viewer-no-corpus.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Document Viewer Without Corpus', () => {
  test('should allow document viewing without corpus', async ({ page }) => {
    await page.goto('/documents/123');
    
    // Document should load
    await expect(page.locator('[data-testid="pdf-viewer"]')).toBeVisible();
    
    // Corpus banner should be visible
    await expect(page.getByText('Document Management Mode')).toBeVisible();
    
    // Search should work
    await page.click('[data-testid="search-button"]');
    await page.fill('[data-testid="search-input"]', 'test');
    await expect(page.locator('.search-result')).toBeVisible();
  });
  
  test('should prevent annotation creation without corpus', async ({ page }) => {
    await page.goto('/documents/123');
    
    // Try to select text
    const pdfViewer = page.locator('[data-testid="pdf-viewer"]');
    await pdfViewer.selectText({ from: 0, to: 10 });
    
    // No annotation menu should appear
    await expect(page.locator('[data-testid="annotation-menu"]')).not.toBeVisible();
  });
  
  test('should handle corpus assignment', async ({ page }) => {
    await page.goto('/documents/123');
    
    // Click add to corpus
    await page.click('button:has-text("Add to Corpus")');
    
    // Select corpus from modal
    await page.click('text=My Research Corpus');
    await page.click('button:has-text("Add")');
    
    // Should navigate to corpus view
    await expect(page).toHaveURL(/\/corpus\/\d+\/document\/123/);
    
    // Features should now be available
    await expect(page.locator('[data-testid="chat-tray"]')).toBeVisible();
  });
});
```

### Performance Tests

```typescript
// performance.test.tsx
describe('Performance without corpus', () => {
  it('should load faster without corpus data', async () => {
    const startTime = performance.now();
    
    render(
      <MockedProvider mocks={[documentOnlyMock]}>
        <DocumentKnowledgeBase documentId="123" />
      </MockedProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('document-viewer')).toBeInTheDocument();
    });
    
    const loadTime = performance.now() - startTime;
    expect(loadTime).toBeLessThan(1000); // Should load in under 1 second
  });
  
  it('should not make corpus-related queries', async () => {
    const corpusQuerySpy = jest.fn();
    
    render(
      <MockedProvider mocks={[documentOnlyMock]}>
        <DocumentKnowledgeBase documentId="123" />
      </MockedProvider>
    );
    
    await waitFor(() => {
      expect(corpusQuerySpy).not.toHaveBeenCalled();
    });
  });
});
```

### Mock Data

```typescript
// test-mocks.ts
export const documentOnlyMock = {
  request: {
    query: GET_DOCUMENT_ONLY,
    variables: { documentId: '123' },
  },
  result: {
    data: {
      document: {
        id: '123',
        title: 'Test Document',
        fileType: 'application/pdf',
        pdfFile: 'http://example.com/test.pdf',
        txtExtractFile: 'http://example.com/test.txt',
        pawlsParseFile: 'http://example.com/test.pawls',
        myPermissions: ['READ', 'WRITE'],
        allNotesWithoutCorpus: [],
        corpuses: [],
      },
    },
  },
};

export const myCorpusesMock = {
  request: {
    query: GET_MY_CORPUSES,
  },
  result: {
    data: {
      corpuses: [
        {
          id: '456',
          title: 'My Research Corpus',
          documentCount: 10,
        },
      ],
    },
  },
};
```

### Test Coverage Goals

1. **Unit Test Coverage**: 90%+ for new corpus-optional code
2. **Integration Test Coverage**: All major user flows
3. **E2E Test Coverage**: Critical paths (viewing, assignment, feature activation)
4. **Performance Benchmarks**: 
   - Initial load < 1s without corpus
   - No unnecessary GraphQL queries
   - Smooth transition after corpus assignment

## Summary

This strategy enables document viewing without corpus membership while maintaining a clear path to unlock advanced features. Key aspects:

1. **Progressive Enhancement**: Start with basic document viewing, add features when corpus is assigned
2. **Clear User Journey**: Prominent "Add to Corpus" CTAs guide users to unlock features
3. **Annotation Control**: Annotations are completely hidden without corpus context
4. **Flexible Architecture**: Easy to add new corpus-optional features in the future
5. **Performance Benefits**: Lighter initial load without corpus data

The implementation focuses on:
- Making corpusId optional throughout the component tree
- Conditional GraphQL queries based on corpus availability
- Clear visual indicators for unavailable features
- Smooth transitions when corpus is assigned
- Complete control over annotation visibility and creation

This approach balances the document management and research platform aspects of OpenContracts, allowing users to interact with documents at different stages of their lifecycle.