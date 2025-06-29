# Phase 2 — Component Work

## 1. Panel Adapters

We use a factory helper to *wrap* existing feature panels in minimal boilerplate.

```typescript
// src/components/layout/adapters/createPanelAdapter.tsx (trimmed)

export function createPanelAdapter<P extends object>(
  Component: React.ComponentType<P>,
  defaultConfig: Partial<DockablePanelProps>,
) {
  return React.forwardRef<HTMLDivElement, P & { panelId?: string }>((props, ref) => {
    const { panelId = defaultConfig.id, ...componentProps } = props;
    return (
      <DockablePanel ref={ref} id={panelId} {...defaultConfig}>
        <Component {...(componentProps as P)} />
      </DockablePanel>
    );
  });
}

// Example usage
export const ChatPanelAdapter = createPanelAdapter(ChatTray, {
  id: 'chat',
  title: 'Chat',
  icon: <MessageSquare size={18} />,
  defaultPosition: 'right',
  defaultSize: { width: 400, height: '100%' },
});
```

Adapters guarantee **consistent defaults** (icons, min sizes, etc.) while exposing the wrapped component unchanged.

## 2. `DocumentKnowledgeBase` Toggle

```typescript
// src/components/knowledge_base/document/DocumentKnowledgeBase.tsx (excerpt)

const [featureFlags] = useAtom(featureFlagsAtom);
const useNewLayout = featureFlags.newLayoutSystem;

if (useNewLayout) {
  return (
    <LayoutContainer initialLayout="research" onLayoutChange={handleLayoutChange} enablePersistence>
      {/* Core viewer always visible */}
      <div className="document-viewer-container">{viewerContent}</div>

      {/* Migrated panels */}
      <ChatPanelAdapter documentId={documentId} corpusId={corpusId} onMessageSelect={handleMessageSelect} />
      <NotesPanelAdapter notes={notes} onNoteClick={handleNoteClick} />
      <AnnotationsPanelAdapter annotations={annotations} onAnnotationSelect={handleAnnotationSelect} />
    </LayoutContainer>
  );
}
```

The fallback `legacy-layout` block preserves the existing implementation for non-flagged users. 