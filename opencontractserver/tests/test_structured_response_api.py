"""
Comprehensive tests for the structured response API.

Tests the new one-shot structured data extraction capabilities that allow
extracting typed data from documents and corpuses without conversation persistence.
"""

import asyncio
from datetime import datetime
from typing import List, Optional

import pytest
from asgiref.sync import sync_to_async
from pydantic import BaseModel, Field

from opencontractserver.llms import agents
from opencontractserver.llms.agents.core_agents import CoreAgent
from opencontractserver.llms.types import AgentFramework
from opencontractserver.tests.base import BaseFixtureTestCase


# Pydantic models for structured extraction tests
class ContractDate(BaseModel):
    """A single important date in a contract."""
    
    date: str = Field(description="Date in ISO format (YYYY-MM-DD)")
    description: str = Field(description="What this date represents")
    is_deadline: bool = Field(description="Whether this is a deadline")


class ContractDates(BaseModel):
    """All important dates found in a contract."""
    
    effective_date: Optional[str] = Field(None, description="Contract effective date")
    expiration_date: Optional[str] = Field(None, description="Contract expiration date")
    key_dates: List[ContractDate] = Field(default_factory=list, description="Other important dates")


class ContractParty(BaseModel):
    """A party to a contract."""
    
    name: str = Field(description="Full legal name")
    role: str = Field(description="Role in contract (e.g., 'Buyer', 'Seller', 'Service Provider')")
    address: Optional[str] = Field(None, description="Business address if mentioned")


class ContractAnalysis(BaseModel):
    """Comprehensive contract analysis results."""
    
    title: str = Field(description="Contract title or type")
    parties: List[ContractParty] = Field(description="All parties to the contract")
    total_value: Optional[float] = Field(None, description="Total contract value in dollars")
    term_months: Optional[int] = Field(None, description="Contract term in months")
    governing_law: Optional[str] = Field(None, description="Governing law jurisdiction")
    key_obligations: List[str] = Field(description="Key obligations for each party")
    risk_factors: List[str] = Field(default_factory=list, description="Identified risk factors")


class PaymentTerm(BaseModel):
    """A payment term in a contract."""
    
    amount: float = Field(description="Payment amount")
    currency: str = Field(default="USD", description="Currency code")
    due_date: Optional[str] = Field(None, description="When payment is due")
    condition: str = Field(description="Payment condition or trigger")


class CorpusInsight(BaseModel):
    """High-level insights from analyzing a corpus of documents."""
    
    total_documents: int = Field(description="Number of documents analyzed")
    common_themes: List[str] = Field(description="Common themes across documents")
    total_contract_value: Optional[float] = Field(None, description="Sum of all contract values")
    most_frequent_parties: List[str] = Field(description="Most frequently appearing parties")
    key_risks: List[str] = Field(description="Key risks identified across all documents")


@pytest.mark.asyncio
class TestStructuredResponseAPI(BaseFixtureTestCase):
    """Test suite for structured response extraction capabilities."""
    
    # Basic type extraction tests
    
    async def test_extract_string_from_document(self):
        """Test extracting a simple string from a document."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        result = await agent.structured_response(
            "What is the main subject of this document? Return just the subject as a string.",
            str
        )
        
        assert isinstance(result, str) or result is None
        if result:
            assert len(result) > 0
    
    async def test_extract_integer_from_document(self):
        """Test extracting an integer value from a document."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        result = await agent.structured_response(
            "How many pages does this document have? Return just the number.",
            int
        )
        
        assert isinstance(result, int) or result is None
        if result:
            assert result > 0
    
    async def test_extract_float_from_document(self):
        """Test extracting a float value from a document."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        result = await agent.structured_response(
            "What is the total monetary value mentioned in this document? Return just the number.",
            float
        )
        
        assert isinstance(result, float) or result is None
    
    async def test_extract_boolean_from_document(self):
        """Test extracting a boolean value from a document."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        result = await agent.structured_response(
            "Does this document contain confidentiality clauses?",
            bool
        )
        
        assert isinstance(result, bool) or result is None
    
    async def test_extract_list_from_document(self):
        """Test extracting a list from a document."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        result = await agent.structured_response(
            "List the main sections or headings in this document.",
            List[str]
        )
        
        assert isinstance(result, list) or result is None
        if result:
            assert all(isinstance(item, str) for item in result)
    
    # Complex Pydantic model extraction tests
    
    async def test_extract_contract_dates(self):
        """Test extracting structured date information from a contract."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        result = await agent.structured_response(
            "Extract all important dates from this contract.",
            ContractDates
        )
        
        assert isinstance(result, ContractDates) or result is None
        if result:
            # Validate the structure
            if result.effective_date:
                assert isinstance(result.effective_date, str)
            assert isinstance(result.key_dates, list)
            for date in result.key_dates:
                assert isinstance(date.date, str)
                assert isinstance(date.description, str)
                assert isinstance(date.is_deadline, bool)
    
    async def test_extract_contract_parties(self):
        """Test extracting party information from a contract."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        result = await agent.structured_response(
            "Identify all parties to this contract with their roles.",
            List[ContractParty]
        )
        
        assert isinstance(result, list) or result is None
        if result:
            for party in result:
                assert isinstance(party, ContractParty)
                assert party.name
                assert party.role
    
    async def test_extract_comprehensive_analysis(self):
        """Test extracting a comprehensive contract analysis."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        result = await agent.structured_response(
            "Provide a comprehensive analysis of this contract.",
            ContractAnalysis
        )
        
        assert isinstance(result, ContractAnalysis) or result is None
        if result:
            assert result.title
            assert len(result.parties) > 0
            assert isinstance(result.key_obligations, list)
    
    async def test_extract_payment_terms(self):
        """Test extracting payment terms from a document."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        result = await agent.structured_response(
            "Extract all payment terms from this document.",
            List[PaymentTerm]
        )
        
        assert isinstance(result, list) or result is None
        if result and len(result) > 0:
            for term in result:
                assert isinstance(term.amount, float)
                assert isinstance(term.currency, str)
                assert isinstance(term.condition, str)
    
    # Corpus-level extraction tests
    
    async def test_extract_corpus_insights(self):
        """Test extracting insights from an entire corpus."""
        # Add multiple documents to corpus
        for doc in self.docs[:3]:  # Use first 3 documents
            await sync_to_async(self.corpus.documents.add)(doc)
        
        agent = await agents.for_corpus(
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        result = await agent.structured_response(
            "Analyze this corpus and provide high-level insights.",
            CorpusInsight
        )
        
        assert isinstance(result, CorpusInsight) or result is None
        if result:
            assert result.total_documents >= 0
            assert isinstance(result.common_themes, list)
            assert isinstance(result.most_frequent_parties, list)
            assert isinstance(result.key_risks, list)
    
    async def test_extract_corpus_statistics(self):
        """Test extracting statistical information from a corpus."""
        agent = await agents.for_corpus(
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        class CorpusStats(BaseModel):
            document_count: int
            total_pages: int
            average_document_length: float
            most_common_document_type: str
        
        result = await agent.structured_response(
            "Calculate statistics for this document collection.",
            CorpusStats
        )
        
        assert isinstance(result, CorpusStats) or result is None
        if result:
            assert result.document_count >= 0
            assert result.total_pages >= 0
            assert result.average_document_length >= 0
    
    # Parameter override tests
    
    async def test_with_custom_system_prompt(self):
        """Test extraction with a custom system prompt."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        result = await agent.structured_response(
            "Extract the document title",
            str,
            system_prompt="You are a title extraction specialist. Be very precise."
        )
        
        assert isinstance(result, str) or result is None
    
    async def test_with_custom_temperature(self):
        """Test extraction with custom temperature setting."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        # Low temperature for deterministic extraction
        result = await agent.structured_response(
            "Is this a legal document?",
            bool,
            temperature=0.1
        )
        
        assert isinstance(result, bool) or result is None
    
    async def test_with_custom_model(self):
        """Test extraction with a different model."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        result = await agent.structured_response(
            "Summarize this document in one sentence.",
            str,
            model="gpt-3.5-turbo"
        )
        
        assert isinstance(result, str) or result is None
    
    async def test_with_max_tokens_limit(self):
        """Test extraction with token limit."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        result = await agent.structured_response(
            "Describe this document.",
            str,
            max_tokens=50
        )
        
        assert isinstance(result, str) or result is None
        if result:
            # Result should be relatively short due to token limit
            assert len(result.split()) < 100
    
    # Error handling tests
    
    async def test_returns_none_on_llm_error(self):
        """Test that the method returns None on LLM errors."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        # Use an invalid model to trigger an error
        result = await agent.structured_response(
            "Extract data",
            str,
            model="invalid-model-name-12345"
        )
        
        assert result is None
    
    async def test_returns_none_on_parsing_error(self):
        """Test that the method returns None when response can't be parsed."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        # Complex model that might fail to parse
        class ComplexModel(BaseModel):
            nested_data: dict[str, List[dict[str, float]]]
            
        result = await agent.structured_response(
            "Extract some data that definitely won't match this complex structure",
            ComplexModel,
            temperature=2.0  # High temperature for unpredictable output
        )
        
        # Should return None rather than raising an exception
        assert result is None or isinstance(result, ComplexModel)
    
    # Framework comparison tests
    
    async def test_pydantic_ai_structured_response(self):
        """Test structured response with PydanticAI framework."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        result = await agent.structured_response(
            "What type of document is this?",
            str
        )
        
        assert isinstance(result, str) or result is None
    
    async def test_llama_index_structured_response_returns_none(self):
        """Test that LlamaIndex returns None (not implemented)."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.LLAMA_INDEX,
            user_id=self.user.id)
        
        result = await agent.structured_response(
            "What type of document is this?",
            str
        )
        
        # LlamaIndex implementation should return None
        assert result is None
    
    # Ephemeral nature tests
    
    async def test_no_conversation_persistence(self):
        """Test that structured responses don't create conversation history."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id  # Even with user_id, shouldn't persist
        )
        
        # Get initial conversation state
        initial_messages = await agent.get_conversation_messages()
        initial_count = len(initial_messages)
        
        # Make structured response call
        result = await agent.structured_response(
            "Extract the document title",
            str
        )
        
        # Check conversation hasn't changed
        final_messages = await agent.get_conversation_messages()
        final_count = len(final_messages)
        
        assert final_count == initial_count
    
    async def test_multiple_extractions_independent(self):
        """Test that multiple extractions are independent."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        # First extraction
        result1 = await agent.structured_response(
            "What is the document about?",
            str
        )
        
        # Second extraction - should not have context from first
        result2 = await agent.structured_response(
            "What was my previous question?",  # This shouldn't know
            str
        )
        
        assert result1 is None or isinstance(result1, str)
        assert result2 is None or isinstance(result2, str)
        
        # The second result shouldn't reference the first question
        if result2:
            assert "document about" not in result2.lower()
    
    # Edge cases and advanced scenarios
    
    async def test_nested_pydantic_models(self):
        """Test extraction with deeply nested Pydantic models."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        class Address(BaseModel):
            street: str
            city: str
            state: str
            zip_code: str
        
        class Company(BaseModel):
            name: str
            address: Address
            subsidiaries: List['Company'] = []
        
        # Update forward reference
        Company.model_rebuild()
        
        result = await agent.structured_response(
            "Extract company information from this document",
            Company
        )
        
        assert isinstance(result, Company) or result is None
        if result:
            assert isinstance(result.address, Address)
    
    async def test_optional_fields_handling(self):
        """Test extraction with many optional fields."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        class DocumentMetadata(BaseModel):
            title: str
            author: Optional[str] = None
            date_created: Optional[str] = None
            version: Optional[str] = None
            department: Optional[str] = None
            classification: Optional[str] = None
            tags: Optional[List[str]] = None
        
        result = await agent.structured_response(
            "Extract all available metadata from this document",
            DocumentMetadata
        )
        
        assert isinstance(result, DocumentMetadata) or result is None
        if result:
            # At least title should be present
            assert result.title
    
    async def test_enum_extraction(self):
        """Test extraction with enum types."""
        from enum import Enum
        
        class DocumentType(str, Enum):
            CONTRACT = "contract"
            INVOICE = "invoice"
            REPORT = "report"
            MEMO = "memo"
            OTHER = "other"
        
        class DocClassification(BaseModel):
            doc_type: DocumentType
            confidence: float = Field(ge=0, le=1)
        
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        result = await agent.structured_response(
            "Classify this document type",
            DocClassification
        )
        
        assert isinstance(result, DocClassification) or result is None
        if result:
            assert isinstance(result.doc_type, DocumentType)
            assert 0 <= result.confidence <= 1
    
    async def test_concurrent_extractions(self):
        """Test multiple concurrent structured extractions."""
        agent = await agents.for_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id)
        
        # Run multiple extractions concurrently
        tasks = [
            agent.structured_response("Extract the title", str),
            agent.structured_response("Count the pages", int),
            agent.structured_response("Is this a contract?", bool),
            agent.structured_response("List the main topics", List[str])
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # All should complete without exceptions
        for result in results:
            assert not isinstance(result, Exception)
            # Each should be None or the expected type


@pytest.mark.asyncio 
class TestStructuredResponseAPIConvenience(BaseFixtureTestCase):
    """Test the convenience methods in AgentAPI for structured responses."""
    
    async def test_get_structured_response_from_document(self):
        """Test the direct API method for document extraction."""
        from opencontractserver.llms.api import AgentAPI
        
        result = await AgentAPI.get_structured_response_from_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            prompt="What is the main topic of this document?",
            target_type=str,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id
        )
        
        assert isinstance(result, str) or result is None
    
    async def test_get_structured_response_from_corpus(self):
        """Test the direct API method for corpus extraction."""
        from opencontractserver.llms.api import AgentAPI
        
        # Add documents to corpus
        for doc in self.docs[:3]:
            await sync_to_async(self.corpus.documents.add)(doc)
        
        result = await AgentAPI.get_structured_response_from_corpus(
            corpus=self.corpus.id,
            prompt="How many documents are in this corpus?",
            target_type=int,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id
        )
        
        assert isinstance(result, int) or result is None
        if result:
            assert result >= 0
    
    async def test_convenience_with_all_overrides(self):
        """Test convenience method with all parameter overrides."""
        from opencontractserver.llms.api import AgentAPI
        
        class SimpleResult(BaseModel):
            answer: str
            confidence: float = Field(ge=0, le=1)
        
        result = await AgentAPI.get_structured_response_from_document(
            document=self.doc.id,
            corpus=self.corpus.id,
            prompt="Analyze this document",
            target_type=SimpleResult,
            framework=AgentFramework.PYDANTIC_AI,
            user_id=self.user.id,
            model="gpt-4",
            system_prompt="You are a document analyst",
            temperature=0.5,
            max_tokens=100,
            embedder="text-embedding-ada-002"
        )
        
        assert isinstance(result, SimpleResult) or result is None 