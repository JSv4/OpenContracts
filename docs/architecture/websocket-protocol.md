# WebSocket Protocol & State Management

This document describes how our WebSocket-based chat protocol works, specifically how messages from the agent are processed and rendered in the UI.

## Protocol Overview

The chat system uses WebSocket messages to stream partial responses from the agent to the browser. Each message is a JSON payload conforming to the `MessageData` type:

```typescript
interface MessageData {
  type:
    | "ASYNC_START"    // Agent begins generating a response
    | "ASYNC_CONTENT"  // Partial content update
    | "ASYNC_THOUGHT"  // Agent's internal reasoning/tool usage
    | "ASYNC_SOURCES"  // Reference material citations
    | "ASYNC_FINISH"   // Response complete
    | "ASYNC_ERROR"    // Error occurred
    | "SYNC_CONTENT"   // Single-shot historical message
    | "ASYNC_APPROVAL_NEEDED"; // User must approve tool usage
  content: string;
  data?: {
    sources?: WebSocketSources[];
    timeline?: TimelineEntry[];
    message_id?: string;
    tool_name?: string;
    args?: any;
    pending_tool_call?: {
      name: string;
      arguments: any;
      tool_call_id?: string;
    };
  };
}
```

## Connection Lifecycle

The WebSocket connection is managed in `CorpusChat.tsx` through a `useEffect` hook that depends on:
- `auth_token`
- `corpusId`
- `selectedConversationId`
- `isNewChat`

```typescript
// Connection status is tracked via two state hooks:
const [wsReady, setWsReady] = useState(false);
const [wsError, setWsError] = useState<string | null>(null);

// Socket events map directly to these states:
socket.onopen  = () => setWsReady(true);   // Show green "Connected" badge
socket.onerror = () => {                    // Show red error banner
  setWsReady(false);
  setWsError("Error connecting...");
};
socket.onclose = () => setWsReady(false);   // Hide "Connected" badge
```

## Message Processing Pipeline

When a message arrives over the WebSocket, it flows through a processing pipeline that updates various pieces of React state. Here's how each message type is handled:

### 1. ASYNC_START
```typescript
case "ASYNC_START":
  setIsProcessing(true);                              // Disable input
  appendStreamingTokenToChat(content, data?.message_id); // Create message bubble
```

### 2. ASYNC_CONTENT
```typescript
case "ASYNC_CONTENT":
  appendStreamingTokenToChat(content, data?.message_id); // Append to bubble
```

### 3. ASYNC_THOUGHT
```typescript
case "ASYNC_THOUGHT":
  appendThoughtToMessage(content, data);  // Add timeline entry
```

### 4. ASYNC_SOURCES
```typescript
case "ASYNC_SOURCES":
  mergeSourcesIntoMessage(data?.sources, data?.message_id);
```

### 5. ASYNC_FINISH
```typescript
case "ASYNC_FINISH":
  finalizeStreamingResponse(              // Finalize message
    content,
    data?.sources,
    data?.message_id,
    data?.timeline
  );
  setIsProcessing(false);                // Re-enable input
```

## State Management

The WebSocket protocol updates two primary pieces of state:

1. **Chat Messages** (`chat` state in CorpusChat.tsx)
   - Array of `ChatMessageProps`
   - Drives the scrolling message list
   - Updated by `appendStreamingTokenToChat`, `finalizeStreamingResponse`

2. **Source References** (`chatSourcesAtom` Jotai atom)
   - Stores citation metadata
   - Updated by `mergeSourcesIntoMessage`
   - Read by `ChatMessage` component to render source previews

## Visual Components

The state changes above map to specific UI components:

### Message Bubbles
- Controlled by `isComplete` prop on `ChatMessage`
- Streaming messages show only timeline
- Complete messages show full bubble with content

### Timeline View
```typescript
// In ChatMessage.tsx:
const showTimelineOnly =
  isAssistant &&
  effectiveHasTimeline &&
  (!isComplete || content.trim().length === 0);
```

### Input Controls
```typescript
// Input tray is disabled while processing:
<EnhancedChatInputContainer $disabled={isProcessing}>
  <EnhancedChatInput disabled={!wsReady || isProcessing} />
  <SendButton disabled={!wsReady || !newMessage.trim() || isProcessing} />
</EnhancedChatInputContainer>
```

### Auto-scrolling
The message container automatically scrolls to the bottom whenever new content arrives:

```typescript
useEffect(() => {
  scrollToBottom();
}, [combinedMessages]);
```

## Error Handling

Errors can occur at two levels:

1. **Connection Level**
   - Socket errors trigger the error banner
   - Users can attempt reconnection

2. **Message Level**
   - ASYNC_ERROR messages display in the chat
   - Processing state is cleared
   - Input is re-enabled

## References

This documentation is based on analysis of:
- `frontend/src/components/corpuses/CorpusChat.tsx`
- `frontend/src/components/widgets/chat/ChatMessage.tsx`
