 # OpenContracts LLM Framework
 
 OpenContract's API for creating document and corpus agents.
 
 ## Philosophy
 
 This framework embodies the principles of elegant software design:
 
 - **Simplicity**: Beautiful, intuitive APIs that make complex operations feel natural
 - **Framework Agnostic**: Support multiple LLM frameworks (LlamaIndex, PydanticAI) through unified interfaces
 - **Rich Responses**: Every interaction returns structured data with sources, metadata, and conversation tracking
 - **Conversation Management**: Persistent conversations with automatic message storage and retrieval
 - **Tool Integration**: Extensible tool system for document analysis and data retrieval
 - **Type Safety**: Full type hints and structured responses throughout
 
 ## Quick Start
 
 ```python
 from opencontractserver.llms import agents
 
 # Create a document agent
 agent = await agents.for_document(123)
 
 # Chat with rich responses
 response = await agent.chat("What are the key terms in this contract?")
 print(f"Response: {response.content}")
 print(f"Sources: {len(response.sources)} found")
 print(f"Message ID: {response.llm_message_id}")
 
 # Stream responses
 async for chunk in agent.stream("Summarize the main obligations"):
     print(chunk.content, end="")
 ```
 
 ## Core Concepts
 
 ### Agents
 
 Agents are the primary interface for interacting with documents and corpora. They provide:
 
 - **Document Agents**: Work with individual documents
 - **Corpus Agents**: Work with collections of documents
 - **Framework Flexibility**: Choose between LlamaIndex, PydanticAI, or future frameworks
 - **Conversation Persistence**: Automatic conversation management and message storage
 
 #### Creating Agents
 
 ```python
 from opencontractserver.llms import agents
 from opencontractserver.llms.types import AgentFramework
 
 # Document agent with default framework (LlamaIndex)
 agent = await agents.for_document(document_id=123)
 
 # Corpus agent with specific framework
 agent = await agents.for_corpus(
     corpus_id=456,
     framework=AgentFramework.PYDANTIC_AI
 )
 
 # With custom configuration
 agent = await agents.for_document(
     document_id=123,
     user_id=789,
     system_prompt="You are a legal contract analyzer...",
     model="gpt-4",
     temperature=0.1,
     tools=["load_md_summary", "get_notes"]
 )
 ```
 
 #### Agent Responses
 
 All agent interactions return rich, structured responses:
 
 ```python
 # Chat response with full metadata
 response = await agent.chat("What are the payment terms?")
 
 # UnifiedChatResponse attributes:
 response.content              # The LLM's response text
 response.sources              # List of SourceNode objects with citations
 response.user_message_id      # ID of the stored user message
 response.llm_message_id       # ID of the stored LLM response
 response.conversation_id      # Current conversation ID
 response.metadata             # Additional response metadata
 
 # Stream response chunks
 async for chunk in agent.stream("Analyze the liability clauses"):
     # UnifiedStreamResponse attributes:
     chunk.content             # Incremental content
     chunk.sources             # Sources (populated at end)
     chunk.is_final            # True for the last chunk
     chunk.metadata            # Chunk metadata
 ```
 
 ### Conversation Management
 
 The framework provides sophisticated conversation management through the `CoreConversationManager`:
 
 #### Persistent Conversations
 
 ```python
 # Create agent with persistent conversation
 agent = await agents.for_document(
     document_id=123,
     user_id=456,  # Required for persistence
     conversation_id=789  # Optional: resume existing conversation
 )
 
 # Messages are automatically stored
 response1 = await agent.chat("What is this document about?")
 response2 = await agent.chat("Can you elaborate on section 2?")  # Context maintained
 
 # Access conversation info
 conversation_id = agent.get_conversation_id()
 conversation_info = agent.get_conversation_info()
 print(f"Conversation has {conversation_info['message_count']} messages")
 ```
 
 #### Anonymous Conversations
 
 ```python
 # Anonymous sessions - context maintained in memory only
 agent = await agents.for_document(123)  # No user_id
 response1 = await agent.chat("What is this document about?")
 response2 = await agent.chat("Can you elaborate on section 2?")  # Context maintained in memory
 
 # Anonymous conversations are session-only and not persisted
 conversation_id = agent.get_conversation_id()  # Returns None for anonymous
 conversation_info = agent.get_conversation_info()  # Returns basic info with no persistence
 
 # Important: Anonymous conversations cannot be restored later
 ```
 
 #### Message Storage Control
 
 ```python
 # Control message storage per interaction
 response = await agent.chat(
     "Sensitive query that shouldn't be stored",
     store_messages=False  # Skip database storage
 )
 
 # Manual message storage
 user_msg_id = await agent.store_user_message("Custom user message")
 llm_msg_id = await agent.store_llm_message("Custom LLM response")
 ```
 
 ### Tools
 
 The framework provides a unified tool system that works across all supported frameworks:
 
 #### Built-in Tools
 
 ```python
 from opencontractserver.llms.tools import create_document_tools
 from opencontractserver.llms.tools.core_tools import (
     load_document_md_summary,
     get_notes_for_document_corpus,
     get_md_summary_token_length
 )
 
 # Use built-in tools by name
 agent = await agents.for_document(
     document_id=123,
     tools=["load_md_summary", "get_notes", "token_length"]
 )
 
 # Or use CoreTool objects directly
 tools = create_document_tools()
 agent = await agents.for_document(document_id=123, tools=tools)
 ```
 
 #### Custom Tools
 
 ```python
 from opencontractserver.llms.tools.tool_factory import CoreTool
 
 def analyze_contract_risk(contract_text: str) -> str:
     """Analyze contract risk factors."""
     # Your custom analysis logic
     return "Risk analysis results..."
 
 # Create CoreTool from function
 risk_tool = CoreTool.from_function(
     analyze_contract_risk,
     description="Analyze contract risk factors"
 )
 
 agent = await agents.for_document(
     document_id=123,
     tools=[risk_tool]
 )
 ```
 
 #### Framework-Specific Tools
 
 The framework automatically converts tools to the appropriate format:
 
 ```python
 # LlamaIndex: CoreTool → FunctionTool
 # PydanticAI: CoreTool → PydanticAIToolWrapper
 
 # Tools work seamlessly across frameworks
 llama_agent = await agents.for_document(
     document_id=123,
     framework=AgentFramework.LLAMA_INDEX,
     tools=["load_md_summary"]
 )
 
 pydantic_agent = await agents.for_document(
     document_id=123,
     framework=AgentFramework.PYDANTIC_AI,
     tools=["load_md_summary"]  # Same tool, different framework
 )
 ```
 
 ### Streaming
 
 All agents support streaming responses for real-time interaction:
 
 ```python
 # Stream with automatic message storage
 async for chunk in agent.stream("Summarize findings from all documents"):
     print(chunk.content, end="")
     
     # Access metadata during streaming
     if chunk.is_final:
         print(f"\nSources: {len(chunk.sources)}")
         print(f"Message ID: {chunk.llm_message_id}")
 
 # Stream without storage
 async for chunk in agent.stream("Temporary query", store_messages=False):
     print(chunk.content, end="")
 ```
 
 ### Embeddings
 
 The framework provides a simple embeddings API:
 
 ```python
 from opencontractserver.llms import embeddings
 
 # Generate embeddings
 embedder_path, vector = embeddings.generate("Contract analysis text")
 print(f"Using embedder: {embedder_path}")
 print(f"Vector dimension: {len(vector)}")
 
 # The embeddings integrate with the vector stores for document search
 ```
 
 ### Vector Stores
 
 Vector stores enable semantic search across document annotations:
 
 ```python
 from opencontractserver.llms import vector_stores
 from opencontractserver.llms.vector_stores.core_vector_stores import VectorSearchQuery
 
 # Create vector store
 store = vector_stores.create(
     framework="llama_index",
     user_id=123,
     corpus_id=456
 )
 
 # Search annotations
 query = VectorSearchQuery(
     query_text="payment obligations",
     similarity_top_k=10
 )
 
 results = await store.async_search(query)
 for result in results:
     print(f"Score: {result.similarity_score}")
     print(f"Text: {result.annotation.raw_text[:100]}...")
 ```
 
 ## Architecture
 
 The framework follows a layered architecture that separates concerns and enables framework flexibility:
 
 ```
 ┌─────────────────────────────────────────┐
 │           Beautiful API Layer           │  ← api.py (agents.for_document, etc.)
 ├─────────────────────────────────────────┤
 │        Framework Adapter Layer          │  ← agents/llama_index_agents.py
 │ (Implements CoreAgent for specific SDK) │     agents/pydantic_ai_agents.py
 ├─────────────────────────────────────────┤
 │         Core Agent Protocol             │  ← agents/core_agents.py (Defines .chat, .stream)
 │         & Unified Tool System           │  ← tools/ (CoreTool, UnifiedToolFactory)
 ├─────────────────────────────────────────┤
 │         Core Business Logic             │  ← Framework-agnostic utils, config
 │         & Conversation Management       │     conversations/ (CoreConversationManager)
 ├─────────────────────────────────────────┤
 │      Django Models & Vector Stores      │  ← Your documents + annotation data & persistence
 └─────────────────────────────────────────┘
 ```
 
 ### How It Works
 
 1. **Beautiful API (`api.py`)**:
    - `agents.for_document(123)` provides the elegant entry point
    - Handles parameter validation, type conversion, and defaults
    - Routes to the appropriate factory based on framework choice
 
 2. **Unified Factory (`agents/agent_factory.py`)**:
    - `UnifiedAgentFactory.create_document_agent()` orchestrates agent creation
    - Converts string framework names to enums, resolves tools, creates contexts
    - Delegates to framework-specific implementations
 
 3. **Framework Adapters** (e.g., `agents/llama_index_agents.py`):
    - `LlamaIndexDocumentAgent.create()` builds the actual LLM integration
    - Creates vector stores, configures embeddings, sets up the underlying LlamaIndex agent
    - Returns a framework-specific agent that implements the `CoreAgent` protocol
 
 4. **CoreAgent Protocol (`agents/core_agents.py`)**:
    - The returned agent object (e.g., an instance of `LlamaIndexDocumentAgent`) implements methods like `async def chat(self, message: str)` and `async def stream(self, message: str)`.
    - When you call `await agent.chat("Your query")`, you're calling the adapter's implementation, which in turn interacts with the underlying LLM SDK (e.g., makes a query to a LlamaIndex engine).
    - The framework now returns rich `UnifiedChatResponse` and `UnifiedStreamResponse` objects with sources, metadata, and message tracking.
 
 5. **Conversation Management**:
    - `CoreConversationManager` handles message persistence and retrieval
    - Automatically stores user and LLM messages with proper relationships
    - Supports both persistent (database) and anonymous (memory-only) conversations
 
 6. **Tool System**:
    - `CoreTool` provides framework-agnostic tool definitions
    - Framework-specific factories convert tools to appropriate formats
    - Built-in tools for document analysis, note retrieval, and content access
 
 ### Framework Support
 
 #### LlamaIndex Integration
 
 ```python
 # LlamaIndex agents use:
 # - ChatEngine for conversation management
 # - FunctionTool for tool integration
 # - BasePydanticVectorStore for vector search
 # - Custom embedding models via OpenContractsPipelineEmbedding
 
 from opencontractserver.llms.agents.llama_index_agents import LlamaIndexDocumentAgent
 from opencontractserver.llms.vector_stores.llama_index_vector_stores import LlamaIndexAnnotationVectorStore
 
 # Framework-specific features
 agent = await LlamaIndexDocumentAgent.create(document, config, conversation_manager)
 ```
 
 #### PydanticAI Integration
 
 ```python
 # PydanticAI agents use:
 # - Modern async patterns with proper type safety
 # - RunContext for dependency injection
 # - Structured tool definitions with Pydantic models
 
 from opencontractserver.llms.agents.pydantic_ai_agents import PydanticAIDocumentAgent
 from opencontractserver.llms.vector_stores.pydantic_ai_vector_stores import PydanticAIAnnotationVectorStore
 
 # Framework-specific features
 agent = await PydanticAIDocumentAgent.create(document, config, conversation_manager)
 ```
 
 ## Advanced Usage
 
 ### Custom Configuration
 
 ```python
 from opencontractserver.llms.agents.core_agents import AgentConfig
 
 # Create custom configuration
 config = AgentConfig(
     model="gpt-4-turbo",
     temperature=0.2,
     max_tokens=2000,
     system_prompt="You are an expert legal analyst...",
     embedder_path="sentence-transformers/all-MiniLM-L6-v2",
     tools=["load_md_summary", "get_notes"],
     verbose=True
 )
 
 agent = await agents.for_document(123, config=config)
 ```
 
 ### Conversation Patterns
 
 #### Multi-turn Analysis
 
 ```python
 # Persistent conversation for complex analysis
 agent = await agents.for_document(
     document_id=123,
     user_id=456,
     system_prompt="You are analyzing a legal contract. Build context across multiple questions."
 )
 
 # Build context over multiple interactions
 overview = await agent.chat("Provide an overview of this contract")
 risks = await agent.chat("What are the main risks for the buyer?")
 recommendations = await agent.chat("Based on our discussion, what are your recommendations?")
 
 # Access full conversation
 info = agent.get_conversation_info()
 print(f"Analyzed contract in {info['message_count']} messages")
 ```
 
 #### Anonymous Sessions
 
 ```python
 # Anonymous sessions - context maintained in memory only
 agent = await agents.for_document(123)  # No storage
 response1 = await agent.chat("What is this document about?")
 response2 = await agent.chat("What are the key risks mentioned?")
 response3 = await agent.chat("How do these risks compare?")
 # Context flows between messages within the same session but is lost when session ends
 ```
 
 #### Conversation Restoration
 
 ```python
 # Resume a previous conversation
 agent = await agents.for_document(
     document_id=123,
     user_id=456,
     conversation_id=789  # Resume existing conversation
 )
 
 # Continue where you left off
 response = await agent.chat("Following up on our previous discussion...")
 ```
 
 ### Advanced Tool Usage
 
 #### Custom Tool Development
 
 ```python
 from opencontractserver.llms.tools.tool_factory import CoreTool, ToolMetadata
 from typing import List, Dict, Any
 
 async def analyze_contract_clauses(document_id: int, clause_types: List[str]) -> Dict[str, Any]:
     """Analyze specific types of clauses in a contract.
     
     Args:
         document_id: The document to analyze
         clause_types: Types of clauses to look for (e.g., ['payment', 'termination'])
     
     Returns:
         Dictionary with clause analysis results
     """
     # Your custom analysis logic here
     return {
         "found_clauses": clause_types,
         "analysis": "Detailed analysis results...",
         "recommendations": ["Recommendation 1", "Recommendation 2"]
     }
 
 # Create tool with rich metadata
 clause_tool = CoreTool(
     function=analyze_contract_clauses,
     metadata=ToolMetadata(
         name="analyze_contract_clauses",
         description="Analyze specific types of clauses in a contract",
         parameter_descriptions={
             "document_id": "The ID of the document to analyze",
             "clause_types": "List of clause types to search for"
         }
     )
 )
 
 # Use in agent
 agent = await agents.for_document(
     document_id=123,
     tools=[clause_tool]
 )
 ```
 
 #### Tool Composition
 
 ```python
 from opencontractserver.llms.tools import create_document_tools
 
 # Combine built-in and custom tools
 standard_tools = create_document_tools()
 custom_tools = [clause_tool, risk_tool, compliance_tool]
 
 agent = await agents.for_document(
     document_id=123,
     tools=standard_tools + custom_tools
 )
 ```
 
 ### Vector Store Integration
 
 #### Advanced Search
 
 ```python
 from opencontractserver.llms.vector_stores.core_vector_stores import (
     CoreAnnotationVectorStore,
     VectorSearchQuery
 )
 
 # Create core vector store
 store = CoreAnnotationVectorStore(
     user_id=123,
     corpus_id=456,
     embedder_path="sentence-transformers/all-MiniLM-L6-v2"
 )
 
 # Complex search with filters
 query = VectorSearchQuery(
     query_text="payment obligations and penalties",
     similarity_top_k=20,
     filters={
         "annotation_label__name": "payment_clause",
         "document__title__icontains": "service_agreement"
     }
 )
 
 results = await store.async_search(query)
 
 # Process results
 for result in results:
     annotation = result.annotation
     print(f"Document: {annotation.document.title}")
     print(f"Score: {result.similarity_score:.3f}")
     print(f"Text: {annotation.raw_text[:200]}...")
     print("---")
 ```
 
 #### Framework-Specific Vector Stores
 
 ```python
 # LlamaIndex vector store
 from opencontractserver.llms.vector_stores.llama_index_vector_stores import LlamaIndexAnnotationVectorStore
 
 llama_store = LlamaIndexAnnotationVectorStore(
     user_id=123,
     corpus_id=456
 )
 
 # PydanticAI vector store
 from opencontractserver.llms.vector_stores.pydantic_ai_vector_stores import PydanticAIAnnotationVectorStore
 
 pydantic_store = PydanticAIAnnotationVectorStore(
     user_id=123,
     corpus_id=456
 )
 
 # Both provide the same core functionality with framework-specific optimizations
 ```
 
 ### Configuration Management
 
 ```python
 from opencontractserver.llms.agents.core_agents import get_default_config, AgentConfig
 
 # Start with defaults and customize
 config = get_default_config(
     user_id=123,
     document_id=456
 )
 
 # Override specific settings
 config.model = "gpt-4-turbo"
 config.temperature = 0.1
 config.system_prompt = "You are a specialized contract analyzer..."
 
 agent = await agents.for_document(123, config=config)
 ```
 
 ## Error Handling
 
 The framework provides structured error handling with specific exception types:
 
 ```python
 from opencontractserver.llms import agents
 from opencontractserver.llms.agents.core_agents import AgentError
 from opencontractserver.documents.models import Document
 
 try:
     agent = await agents.for_document(document_id=999999)
     response = await agent.chat("Analyze this document")
 except Document.DoesNotExist:
     print("Document not found")
 except AgentError as e:
     print(f"Agent error: {e}")
 except Exception as e:
     print(f"Unexpected error: {e}")
 
 # Graceful handling of LLM errors
 try:
     response = await agent.chat("Complex query that might fail")
 except Exception as e:
     # Framework handles LLM errors gracefully
     print(f"LLM error: {e}")
     # Conversation state is preserved
 ```
 
 ### Common Error Patterns
 
 ```python
 # Handle missing documents
 try:
     agent = await agents.for_document(document_id)
 except Document.DoesNotExist:
     return {"error": "Document not found"}
 
 # Handle conversation errors
 try:
     response = await agent.chat(user_message)
 except Exception as e:
     # Log error but preserve conversation
     logger.error(f"Chat error: {e}")
     return {"error": "Failed to process message", "conversation_id": agent.get_conversation_id()}
 
 # Handle streaming errors
 try:
     async for chunk in agent.stream(message):
         yield chunk
 except Exception as e:
     # Send error chunk
     yield UnifiedStreamResponse(
         content=f"Error: {e}",
         is_final=True,
         error=str(e)
     )
 ```
 
 ## Performance Considerations
 
 The framework is designed for production use with several performance optimizations:
 
 ### Database Optimization
 
 - **Async ORM**: All database operations use Django's async ORM capabilities
 - **Prefetch Related**: Vector stores prefetch related objects to avoid N+1 queries
 - **Connection Pooling**: Efficient database connection management
 - **Bulk Operations**: Message storage uses bulk operations where possible
 
 ```python
 # Example of optimized queryset in CoreAnnotationVectorStore
 queryset = Annotation.objects.select_related(
     'document', 'annotation_label'
 ).prefetch_related(
     'document__doc_type'
 ).filter(...)
 ```
 
 ### Caching Strategy
 
 - **Embedding Caching**: Vector embeddings are cached to avoid recomputation
 - **Model Caching**: LLM models are cached and reused across requests
 - **Vector Store Caching**: Search results can be cached for repeated queries
 
 ### Memory Management
 
 - **Streaming Responses**: Large responses are streamed to avoid memory issues
 - **Lazy Loading**: Documents and annotations are loaded on-demand
 - **Context Windows**: Conversation context is managed within model limits
 
 ### Concurrency
 
 - **Async Throughout**: All operations are async-compatible
 - **Connection Limits**: Proper connection pooling prevents resource exhaustion
 - **Rate Limiting**: Built-in protection against API rate limits
 
 ```python
 # Example of concurrent agent usage
 import asyncio
 
 async def analyze_documents(document_ids):
     agents = [
         await agents.for_document(doc_id)
         for doc_id in document_ids
     ]
     
     tasks = [
         agent.chat("Summarize key points")
         for agent in agents
     ]
     
     results = await asyncio.gather(*tasks)
     return results
 ```
 
 ## Testing
 
 The framework includes comprehensive test coverage:
 
 ```python
 # Example test patterns
 import pytest
 from opencontractserver.llms import agents
 from opencontractserver.llms.agents.core_agents import UnifiedChatResponse
 
 @pytest.mark.asyncio
 async def test_document_agent_chat():
     agent = await agents.for_document(document_id=123)
     response = await agent.chat("Test message")
     
     assert isinstance(response, UnifiedChatResponse)
     assert response.content
     assert response.user_message_id
     assert response.llm_message_id
 
 @pytest.mark.asyncio
 async def test_conversation_persistence():
     agent = await agents.for_document(
         document_id=123,
         user_id=456
     )
     
     response1 = await agent.chat("First message")
     response2 = await agent.chat("Second message")
     
     # Verify conversation continuity
     assert response1.conversation_id == response2.conversation_id
     
     # Verify message storage
     info = agent.get_conversation_info()
     assert info['message_count'] >= 4  # 2 user + 2 LLM messages
 ```
 
 ## Contributing
 
 The framework is designed for extensibility. Here's how to contribute:
 
 ### Adding Core Functionality
 
 1. **Core Logic**: Add to `core_*.py` modules (e.g., `agents/core_agents.py`, `tools/core_tools.py`).
 2. **Framework Adapters**: Create new adapter in `agents/` (see "Adding a New Framework" below).
 3. **Tools**: Add to `tools/core_tools.py` for general tools, or within framework adapters for framework-specific tool handling.
 4. **API**: Extend `api.py` for new high-level functionality if needed.
 
 ### Adding a New Framework
 
 To add support for a new LLM framework (e.g., LangChain, Haystack):
 
 1. **Add Framework Enum**:
    ```python
    # In types.py
    class AgentFramework(Enum):
        LLAMA_INDEX = "llama_index"
        PYDANTIC_AI = "pydantic_ai"
        LANGCHAIN = "langchain"  # New framework
    ```
 
 2. **Implement Agent Adapters**:
    - Create `agents/langchain_agents.py`
    - Inside this file, define classes for your document and/or corpus agents. These classes **must** inherit from `CoreAgent` (from `opencontractserver.llms.agents.core_agents.py`).
    
    ```python
    # agents/langchain_agents.py
    from opencontractserver.llms.agents.core_agents import CoreAgent, UnifiedChatResponse, UnifiedStreamResponse
    
    class LangChainDocumentAgent(CoreAgent):
        def __init__(self, context, conversation_manager, underlying_agent):
            self.context = context
            self.conversation_manager = conversation_manager
            self.underlying_agent = underlying_agent
        
        @classmethod
        async def create(cls, document, config, conversation_manager, tools=None):
            # Initialize your LangChain agent here
            # Return cls(context, conversation_manager, langchain_agent)
            pass
        
        async def chat(self, message: str, store_messages: bool = True) -> UnifiedChatResponse:
            # Implement chat using your framework
            # Return UnifiedChatResponse with proper metadata
            pass
        
        async def stream(self, message: str, store_messages: bool = True) -> AsyncGenerator[UnifiedStreamResponse, None]:
            # Implement streaming using your framework
            # Yield UnifiedStreamResponse chunks
            pass
    ```
 
 3. **Integrate into `UnifiedAgentFactory`**:
    ```python
    # In agents/agent_factory.py
    elif framework == AgentFramework.LANGCHAIN:
        from opencontractserver.llms.agents.langchain_agents import LangChainDocumentAgent
        return await LangChainDocumentAgent.create(
            document=document_obj,
            config=config,
            conversation_manager=conversation_manager,
            tools=framework_tools
        )
    ```
 
 4. **Add Tool Support**:
    - Create `tools/langchain_tools.py` if needed
    - Implement tool conversion from `CoreTool` to your framework's tool format
    - Update `tools/tool_factory.py` to handle the new framework
 
 5. **Add Vector Store Support**:
    - Create `vector_stores/langchain_vector_stores.py`
    - Implement adapter around `CoreAnnotationVectorStore`
    - Update `vector_stores/vector_store_factory.py`
 
 6. **Testing**:
    - Create comprehensive tests following the patterns in `test_pydantic_ai_agents.py`.
    - Test all CoreAgent protocol methods, conversation management, and error handling.
 
 By following these steps, you can extend the OpenContracts LLM framework to support new LLM technologies while maintaining the consistent, rich API with conversation management, source tracking, and structured responses.
 
 ### Code Style Guidelines
 
 - **Type Hints**: All functions must have complete type hints
 - **Docstrings**: Use Google-style docstrings for all public methods
 - **Async/Await**: Use async patterns consistently throughout
 - **Error Handling**: Provide meaningful error messages and proper exception handling
 - **Testing**: Include comprehensive tests for all new functionality
 
 ### Documentation Standards
 
 - **API Documentation**: Document all public interfaces with examples
 - **Architecture Decisions**: Document significant design choices
 - **Migration Guides**: Provide migration paths for breaking changes
 - **Performance Notes**: Document performance characteristics and limitations
 
 ---
 
 This framework represents the evolution of OpenContracts' LLM capabilities, providing a foundation for sophisticated document analysis while maintaining simplicity and elegance in its API design.