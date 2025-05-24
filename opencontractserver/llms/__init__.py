"""
OpenContracts LLM Framework

A beautiful, framework-agnostic API for creating document and corpus agents.

Examples:
    # Simple document agent
    agent = await agents.for_document(123)
    response = await agent.chat("What is this document about?")
    
    # Corpus agent with custom framework
    agent = await agents.for_corpus(456, framework="pydantic_ai")
    async for chunk in agent.stream("Summarize the key findings"):
        print(chunk)
    
    # Advanced configuration
    agent = await agents.for_document(
        document=123,
        framework="llama_index", 
        user_id=789,
        model="gpt-4",
        system_prompt="You are a legal expert...",
        tools=["summarize", "extract_entities"]
    )
    
    # Custom tools from functions
    def extract_dates(text: str) -> str:
        '''Extract dates from text.'''
        return "Found dates: 2024-01-01, 2024-12-31"
    
    agent = await agents.for_document(
        document=123,
        tools=["summarize", extract_dates]
    )
    
    # Vector stores
    store = vector_stores.create("llama_index", corpus_id=456)
    results = store.query("search query")
    
    # Embeddings
    embedder_path, vector = embeddings.generate("Hello world")
"""

from opencontractserver.llms.api import agents, embeddings, tools, vector_stores

__all__ = ["agents", "embeddings", "tools", "vector_stores"]
