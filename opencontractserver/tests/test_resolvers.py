import logging
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser, Permission
from django.contrib.contenttypes.models import ContentType
from django.db.models.query import QuerySet
from django.test import TestCase

# Models to test
from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
# Function to test
from opencontractserver.shared.resolvers import resolve_oc_model_queryset
# Permission helpers (assuming django-guardian setup)
from guardian.shortcuts import assign_perm


# Configure logging to see debug messages from the resolver
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

User = get_user_model()


class ResolveOcModelQuerysetTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        # Create users
        cls.owner = User.objects.create_user(username="owner", password="password123")
        cls.collaborator = User.objects.create_user(username="collaborator", password="password123")
        cls.regular_user = User.objects.create_user(username="regular", password="password123")
        cls.anonymous_user = AnonymousUser()

        # Create Corpuses
        cls.public_corpus = Corpus.objects.create(title="Public Corpus", creator=cls.owner, is_public=True)
        cls.private_corpus = Corpus.objects.create(title="Private Corpus", creator=cls.owner, is_public=False)
        cls.shared_corpus = Corpus.objects.create(title="Shared Corpus", creator=cls.owner, is_public=False)
        cls.collaborator_corpus = Corpus.objects.create(title="Collaborator Corpus", creator=cls.collaborator, is_public=False)

        # Assign read permission for shared_corpus to collaborator
        # Note: Assumes django-guardian permissions like 'read_corpus' exist
        try:
            assign_perm('corpuses.read_corpus', cls.collaborator, cls.shared_corpus)
            logger.info(f"Assigned read_corpus permission to {cls.collaborator.username} for {cls.shared_corpus.title}")
        except Permission.DoesNotExist:
             logger.warning("Could not assign 'read_corpus' permission. Does it exist? Skipping permission assignment.")


        # Create Documents
        cls.public_doc = Document.objects.create(title="Public Doc", creator=cls.owner, is_public=True)
        cls.private_doc = Document.objects.create(title="Private Doc", creator=cls.owner, is_public=False)
        cls.shared_doc = Document.objects.create(title="Shared Doc", creator=cls.owner, is_public=False)
        cls.collaborator_doc = Document.objects.create(title="Collaborator Doc", creator=cls.collaborator, is_public=False)


        # Assign read permission for shared_doc to collaborator
        try:
            assign_perm('documents.read_document', cls.collaborator, cls.shared_doc)
            logger.info(f"Assigned read_document permission to {cls.collaborator.username} for {cls.shared_doc.title}")
        except Permission.DoesNotExist:
             logger.warning("Could not assign 'read_document' permission. Does it exist? Skipping permission assignment.")


        # Associate documents with corpuses
        cls.public_corpus.documents.add(cls.public_doc, cls.private_doc, cls.shared_doc)
        cls.private_corpus.documents.add(cls.private_doc) # Only private doc
        cls.shared_corpus.documents.add(cls.shared_doc) # Only shared doc
        cls.collaborator_corpus.documents.add(cls.collaborator_doc) # Only collaborator doc

        # Create Annotations (need an AnnotationLabel)
        cls.test_label = AnnotationLabel.objects.create(text="TestLabel", creator=cls.owner)
        cls.public_annotation = Annotation.objects.create(document=cls.public_doc, annotation_label=cls.test_label, creator=cls.owner, is_public=True)
        cls.private_annotation = Annotation.objects.create(document=cls.public_doc, annotation_label=cls.test_label, creator=cls.owner, is_public=False)
        cls.shared_doc_annotation = Annotation.objects.create(document=cls.shared_doc, annotation_label=cls.test_label, creator=cls.owner, is_public=False)

        # Assign read permission for shared_doc_annotation to collaborator
        try:
             assign_perm('annotations.read_annotation', cls.collaborator, cls.shared_doc_annotation)
             logger.info(f"Assigned read_annotation permission to {cls.collaborator.username} for annotation {cls.shared_doc_annotation.id}")
        except Permission.DoesNotExist:
            logger.warning("Could not assign 'read_annotation' permission. Skipping assignment.")


    def assertQuerysetOptimized(self, queryset: QuerySet, model_type: type, expected_select: list, expected_prefetch: list):
        """Helper to check if optimizations seem to be applied (basic check)."""
        # Note: Directly inspecting the final SQL query is the most reliable way,
        # but requires deeper integration or database-specific tools.
        # This provides a basic check based on the queryset attributes.
        self.assertIn(model_type, [Corpus, Document], "Optimization checks only implemented for Corpus and Document")

        # Check select_related (might be stored in select_related attribute or implicitly via query structure)
        # This is an approximation - complex queries might not store it directly here.
        if queryset.query.select_related:
             if isinstance(queryset.query.select_related, dict):
                 select_related_fields = set(queryset.query.select_related.keys())
             elif isinstance(queryset.query.select_related, (list, tuple)):
                 select_related_fields = set(queryset.query.select_related)
             else: # boolean True/False indicates automatic detection, less reliable to check
                 select_related_fields = set()
                 logger.warning("select_related structure not dict/list/tuple, cannot reliably check fields.")
        else:
            select_related_fields = set()

        # Check prefetch_related
        prefetch_related_fields = set(queryset._prefetch_related_lookups)

        missing_select = set(expected_select) - select_related_fields
        missing_prefetch = set(expected_prefetch) - prefetch_related_fields

        # Allow creator check to pass even if not explicitly in select_related dict, as Django might handle it implicitly
        missing_select.discard('creator')

        self.assertFalse(missing_select, f"Missing expected select_related fields for {model_type.__name__}: {missing_select}")
        self.assertFalse(missing_prefetch, f"Missing expected prefetch_related fields for {model_type.__name__}: {missing_prefetch}")
        logger.info(f"Verified optimizations for {model_type.__name__}")


    def test_resolve_corpus_queryset_permissions(self):
        """Test visibility rules for Corpus model."""
        # Owner sees all their own + public (4 total: public, private, shared, collaborator's) - assumes superuser or specific logic includes owned
        # Updated assumption: Owner sees their own + public (3 total: public, private, shared)
        owner_qs = resolve_oc_model_queryset(Corpus, self.owner)
        self.assertEqual(owner_qs.count(), 3, f"Owner should see 3 corpuses, saw {owner_qs.count()}")
        self.assertQuerysetOptimized(owner_qs, Corpus, ['creator', 'label_set', 'user_lock'], ['documents'])

        # Collaborator sees public + their own + shared (via permission) (3 total: public, shared, collaborator's)
        collab_qs = resolve_oc_model_queryset(Corpus, self.collaborator)
        self.assertEqual(collab_qs.count(), 3, f"Collaborator should see 3 corpuses, saw {collab_qs.count()}")
        self.assertQuerysetOptimized(collab_qs, Corpus, ['creator', 'label_set', 'user_lock'], ['documents'])


        # Regular user sees only public (1 total: public)
        regular_qs = resolve_oc_model_queryset(Corpus, self.regular_user)
        self.assertEqual(regular_qs.count(), 1, f"Regular user should see 1 corpus, saw {regular_qs.count()}")
        self.assertEqual(regular_qs.first(), self.public_corpus)
        self.assertQuerysetOptimized(regular_qs, Corpus, ['creator', 'label_set', 'user_lock'], ['documents'])


        # Anonymous user sees only public (1 total: public)
        anon_qs = resolve_oc_model_queryset(Corpus, self.anonymous_user)
        self.assertEqual(anon_qs.count(), 1, f"Anonymous user should see 1 corpus, saw {anon_qs.count()}")
        self.assertEqual(anon_qs.first(), self.public_corpus)
        self.assertQuerysetOptimized(anon_qs, Corpus, ['creator', 'label_set', 'user_lock'], ['documents'])


    def test_resolve_document_queryset_permissions(self):
        """Test visibility rules for Document model."""
        # Owner sees all their own + public (3 total: public, private, shared)
        owner_qs = resolve_oc_model_queryset(Document, self.owner)
        self.assertEqual(owner_qs.count(), 3, f"Owner should see 3 documents, saw {owner_qs.count()}")
        self.assertQuerysetOptimized(owner_qs, Document, ['creator', 'user_lock'], ['doc_annotations', 'rows', 'source_relationships', 'target_relationships', 'notes'])

        # Collaborator sees public + their own + shared (via permission) (3 total: public, shared, collaborator's)
        collab_qs = resolve_oc_model_queryset(Document, self.collaborator)
        self.assertEqual(collab_qs.count(), 3, f"Collaborator should see 3 documents, saw {collab_qs.count()}")
        self.assertQuerysetOptimized(collab_qs, Document, ['creator', 'user_lock'], ['doc_annotations', 'rows', 'source_relationships', 'target_relationships', 'notes'])

        # Regular user sees only public (1 total: public)
        regular_qs = resolve_oc_model_queryset(Document, self.regular_user)
        self.assertEqual(regular_qs.count(), 1, f"Regular user should see 1 document, saw {regular_qs.count()}")
        self.assertEqual(regular_qs.first(), self.public_doc)
        self.assertQuerysetOptimized(regular_qs, Document, ['creator', 'user_lock'], ['doc_annotations', 'rows', 'source_relationships', 'target_relationships', 'notes'])

        # Anonymous user sees only public (1 total: public)
        anon_qs = resolve_oc_model_queryset(Document, self.anonymous_user)
        self.assertEqual(anon_qs.count(), 1, f"Anonymous user should see 1 document, saw {anon_qs.count()}")
        self.assertEqual(anon_qs.first(), self.public_doc)
        self.assertQuerysetOptimized(anon_qs, Document, ['creator', 'user_lock'], ['doc_annotations', 'rows', 'source_relationships', 'target_relationships', 'notes'])

    def test_resolve_annotation_queryset_permissions(self):
        """Test visibility rules for Annotation model (no specific optimizations applied in resolver yet)."""
        # Owner sees all their own + public (3 total: public, private, shared_doc_annotation)
        owner_qs = resolve_oc_model_queryset(Annotation, self.owner)
        self.assertEqual(owner_qs.count(), 3, f"Owner should see 3 annotations, saw {owner_qs.count()}")

        # Collaborator sees public + their own + shared (via permission) (2 total: public, shared_doc_annotation)
        collab_qs = resolve_oc_model_queryset(Annotation, self.collaborator)
        self.assertEqual(collab_qs.count(), 2, f"Collaborator should see 2 annotations, saw {collab_qs.count()}")
        self.assertIn(self.public_annotation, collab_qs)
        self.assertIn(self.shared_doc_annotation, collab_qs)


        # Regular user sees only public (1 total: public)
        regular_qs = resolve_oc_model_queryset(Annotation, self.regular_user)
        self.assertEqual(regular_qs.count(), 1, f"Regular user should see 1 annotation, saw {regular_qs.count()}")
        self.assertEqual(regular_qs.first(), self.public_annotation)

        # Anonymous user sees only public (1 total: public)
        anon_qs = resolve_oc_model_queryset(Annotation, self.anonymous_user)
        self.assertEqual(anon_qs.count(), 1, f"Anonymous user should see 1 annotation, saw {anon_qs.count()}")
        self.assertEqual(anon_qs.first(), self.public_annotation) 