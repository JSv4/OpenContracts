"""
Quick test for the new structured extraction implementation (synchronous version).
"""
from django.test import TransactionTestCase
from django.contrib.auth import get_user_model

from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.extracts.models import Column, Datacell, Extract, Fieldset
from opencontractserver.tasks.data_extract_tasks import oc_llama_index_doc_query

User = get_user_model()


class NewExtractionTestCase(TransactionTestCase):
    """Test the new agent-based extraction pipeline (sync)."""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", password="testpass"
        )
        
        # Create corpus
        self.corpus = Corpus.objects.create(
            title="Test Corpus",
            creator=self.user
        )
        
        # Create document
        self.document = Document.objects.create(
            title="Test Document",
            creator=self.user,
            file_type="text/plain"
        )
        self.corpus.documents.add(self.document)
        
        # Create fieldset
        self.fieldset = Fieldset.objects.create(
            name="Test Fieldset",
            description="Test extraction fields",
            creator=self.user
        )
        
    def test_simple_string_extraction(self):
        """Test extracting a simple string value."""
        # Create column
        column = Column.objects.create(
            name="Document Title",
            fieldset=self.fieldset,
            query="What is the title of this document?",
            output_type="str",
            extract_is_list=False,
            creator=self.user
        )
        
        # Create extract
        extract = Extract.objects.create(
            name="Test Extract",
            fieldset=self.fieldset,
            creator=self.user
        )
        
        extract.documents.add(self.document)
        
        # Create datacell
        datacell = Datacell.objects.create(
            extract=extract,
            column=column,
            document=self.document,
            data_definition="str",
            creator=self.user
        )
        
        # Run extraction
        oc_llama_index_doc_query.si(datacell.id).apply()
        
        datacell.refresh_from_db()
        
        completed = datacell.completed
        failed = datacell.failed
        data = datacell.data
        
        assert completed is not None
        assert failed is None
        assert data is not None
        assert "data" in data
        
    def test_list_extraction(self):
        """Test extracting a list of values."""
        column = Column.objects.create(
            name="Key Terms",
            fieldset=self.fieldset,
            query="List all the key terms mentioned in this document",
            output_type="str",
            extract_is_list=True,
            creator=self.user
        )
        
        extract = Extract.objects.create(
            name="Test Extract",
            fieldset=self.fieldset,
            creator=self.user
        )
        extract.documents.add(self.document)
        
        datacell = Datacell.objects.create(
            extract=extract,
            column=column,
            document=self.document,
            data_definition="list[str]",
            creator=self.user
        )
        
        # Run extraction
        oc_llama_index_doc_query.si(datacell.id).apply()
        
        datacell.refresh_from_db()
        
        completed = datacell.completed
        data = datacell.data
        
        assert completed is not None
        assert data is not None
        assert isinstance(data.get("data"), list)
        
    def test_with_constraints(self):
        """Test extraction with must_contain_text and limit_to_label."""
        column = Column.objects.create(
            name="Payment Terms",
            fieldset=self.fieldset,
            query="What are the payment terms?",
            output_type="str",
            must_contain_text="payment",
            limit_to_label="contract_clause",
            instructions="Focus on payment schedules and amounts",
            creator=self.user
        )
        
        extract = Extract.objects.create(
            name="Test Extract",
            fieldset=self.fieldset,
            creator=self.user
        )
        extract.documents.add(self.document)
        
        datacell = Datacell.objects.create(
            extract=extract,
            column=column,
            document=self.document,
            data_definition="str",
            creator=self.user
        )
        
        # Run extraction
        oc_llama_index_doc_query.si(datacell.id).apply()
        
        datacell.refresh_from_db()
        
        started = datacell.started
        failed = datacell.failed
        completed = datacell.completed
        
        # Should complete (might return None if constraints not met)
        assert started is not None
        assert failed is None or completed is not None 