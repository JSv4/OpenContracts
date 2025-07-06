# Answering Corpus-Level Queries with WebSockets & Unified Agents

> **NOTE**  This page documents the current implementation on the `JSv4/context-aware-layout` branch.  Older references to a `run_query` Celery task have been removed – queries are now served *live* over a Channels WebSocket.

---

## End-to-end flow

```1:55:config/websocket/consumers/corpus_conversation.py
class CorpusQueryConsumer(AsyncWebsocketConsumer):
    """Streams answers for questions about an entire corpus."""
```

1. **Client → Server** — The React front-end opens `wss://…/ws/corpus/<globalId>/` and sends `{ "query": "…" }`.
2. **`CorpusQueryConsumer.connect`** authenticates the user and resolves the `Corpus` instance.
3. On the first question the consumer lazily initialises a **`CoreAgent`** via `opencontractserver.llms.agents.for_corpus(...)`.
4. The agent internally creates a vector-store with `UnifiedVectorStoreFactory` and chooses the framework specified by `settings.LLMS_DEFAULT_AGENT_FRAMEWORK` (Llama-Index or Pydantic-AI).
5. As the LLM streams its answer the consumer forwards incremental `ASYNC_*` messages to the UI (`ASYNC_START`, `ASYNC_CONTENT`, `ASYNC_THOUGHT`, `ASYNC_SOURCES`, `ASYNC_FINISH`).
6. When complete, or if an error occurs, a terminal frame is sent and the socket is ready for the next question (conversation context is preserved in memory and, if the user is authenticated, persisted to the DB).

### Why WebSockets?

* **Interactivity** – Users see partial answers & thoughts in real-time.
* **Tool calls** – Streaming allows the UI to request approval for function-calling steps (`ASYNC_APPROVAL_NEEDED`).
* **Stateless HTTP keeps working** – The GraphQL API is unchanged; the websocket route is additive.


## Message types

| Type               | When it occurs                                                        |
|--------------------|-----------------------------------------------------------------------|
| `ASYNC_START`      | Consumer has received the first event from the agent and provides IDs |
| `ASYNC_CONTENT`    | Delta content from the LLM                                            |
| `ASYNC_THOUGHT`    | Structured chain-of-thought (only in verbose/debug modes)             |
| `ASYNC_SOURCES`    | Sources associated with the last delta                                |
| `ASYNC_APPROVAL`   | Agent paused awaiting human approval for a tool call                  |
| `ASYNC_ERROR`      | Non-fatal error – conversation can continue                           |
| `ASYNC_FINISH`     | Final content, final list of sources, optional timeline               |
| `SYNC_CONTENT`     | Immediate error or notice outside the async flow                      |


## Extensibility hooks

1. **Framework** – switch Llama-Index ↔ Pydantic-AI by toggling `LLMS_DEFAULT_AGENT_FRAMEWORK`.
2. **Embedders** – set `Corpus.preferred_embedder` to override sentence-transformer model.
3. **Tools** – pass `?tools=…` query-string parameter or register server-side defaults.


## Further reading

* Agent factory implementation – `opencontractserver.llms.agents.agent_factory.UnifiedAgentFactory`.
* Event classes – `opencontractserver.llms.agents.core_agents.*Event`.
* Front-end integration – see `frontend/src/chat/CorpusChatStream.tsx` (not shown here).
