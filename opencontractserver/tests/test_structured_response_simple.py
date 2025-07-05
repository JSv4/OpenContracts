"""
Simple test to verify the structured response API implementation.
"""

import pytest
import vcr
from pydantic import BaseModel, Field

from opencontractserver.llms import agents
from opencontractserver.llms.types import AgentFramework
from opencontractserver.tests.base import BaseFixtureTestCase


class SimpleExtraction(BaseModel):
    """Simple model for testing."""
    title: str = Field(description="Document title")
    page_count: int = Field(description="Number of pages")


@pytest.mark.asyncio
class TestStructuredResponseBasic(BaseFixtureTestCase):
    """Basic tests for structured response API."""
    
    @vcr.use_cassette(
        "fixtures/vcr_cassettes/structured_data_tests/test_basic_string_extraction.yaml",
        filter_headers=["authorization"],
    )
    async def test_basic_string_extraction(self):
        """Test basic string extraction."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id  # Use the test user to access private resources
        )
        
        # Test that the method exists and is callable
        assert hasattr(agent, 'structured_response')
        assert callable(agent.structured_response)
        
        # Test basic extraction
        result = await agent.structured_response(
            "What is this document?",
            str
        )
        
        # Should return None or a string
        assert result is None or isinstance(result, str)
        
    @vcr.use_cassette(
        "fixtures/vcr_cassettes/structured_data_tests/test_pydantic_model_extraction.yaml",
        filter_headers=["authorization"],
    )
    async def test_pydantic_model_extraction(self):
        """Test Pydantic model extraction."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id
        )
        
        result = await agent.structured_response(
            "Extract document information",
            SimpleExtraction
        )
        
        # Should return None or the model
        assert result is None or isinstance(result, SimpleExtraction)
        
        if result:
            assert isinstance(result.title, str)
            assert isinstance(result.page_count, int)
            
    @vcr.use_cassette(
        "fixtures/vcr_cassettes/structured_data_tests/test_llama_index_returns_none.yaml",
        filter_headers=["authorization"],
    )
    async def test_llama_index_returns_none(self):
        """Test that LlamaIndex implementation returns None."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.LLAMA_INDEX,
            user_id=self.user.id
        )
        
        result = await agent.structured_response(
            "Extract something",
            str
        )
        
        # LlamaIndex not implemented, should return None
        assert result is None 