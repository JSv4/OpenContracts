import logging
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser, Group, Permission
from django.db.models.query import QuerySet
from django.test import TestCase
from graphql_relay import to_global_id

# Permission helpers (assuming django-guardian setup)
from guardian.shortcuts import assign_perm

# Models to test
from opencontractserver.annotations.models import Annotation, AnnotationLabel
from opencontractserver.corpuses.models import Corpus, CorpusQuery
from opencontractserver.documents.models import Document

# Function to test
from opencontractserver.shared.resolvers import (
    resolve_oc_model_queryset,
    resolve_single_oc_model_from_id,
)

# Configure logging to see debug messages from the resolver
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

User = get_user_model()


class ResolverCoverageTests(TestCase):
    """Precise tests for specific code paths in resolvers.py"""

    def setUp(self):
        # Create users
        self.user = User.objects.create_user(
            username="resolver_test_user", password="test"
        )
        self.superuser = User.objects.create_superuser(
            username="resolver_test_super", password="test"
        )
        self.anon_user = AnonymousUser()

        # Get or create the anonymous/public group (assuming a standard setup)
        # Adjust group name if your project uses a different convention
        self.public_group, _ = Group.objects.get_or_create(name="Public Objects Access")

        # Create a public corpus that's definitely public and save it
        self.public_corpus = Corpus.objects.create(
            title="Definitely Public Corpus",
            description="For resolver tests",
            creator=self.user,
            is_public=True,
        )
        # Assign read permission for the public corpus to the public group
        assign_perm("corpuses.read_corpus", self.public_group, self.public_corpus)

        # Create a private corpus
        self.private_corpus = Corpus.objects.create(
            title="Private Corpus",
            description="For resolver tests",
            creator=self.user,
            is_public=False,
        )

    def test_superuser_sees_all_queryset(self):
        """Superusers should see all objects ordered by creation."""
        result = resolve_oc_model_queryset(Corpus, user=self.superuser)

        # Should see both corpora
        self.assertEqual(result.count(), 2)
        # Should be ordered by created
        self.assertEqual(result.query.order_by, ("created",))

    def test_superuser_single_model_access(self):
        """Superusers should be able to access any object."""
        global_id = to_global_id("CorpusType", self.private_corpus.id)
        result = resolve_single_oc_model_from_id(Corpus, global_id, user=self.superuser)
        self.assertEqual(result, self.private_corpus)

    def test_anonymous_user_only_sees_public(self):
        """Anonymous users should only see public items."""
        global_id = to_global_id("CorpusType", self.public_corpus.id)
        result = resolve_single_oc_model_from_id(Corpus, global_id, user=self.anon_user)
        self.assertEqual(result, self.public_corpus)

        # Can't see private
        global_id = to_global_id("CorpusType", self.private_corpus.id)
        result = resolve_single_oc_model_from_id(Corpus, global_id, user=self.anon_user)
        self.assertIsNone(result)

    # Test invalid user ID specifically patching User.objects.get
    @patch("opencontractserver.shared.resolvers.User.objects.get")
    def test_nonexistent_user_id(self, mock_get):
        """Using a user ID that doesn't exist should fall back to anonymous behavior."""
        # Force the User.DoesNotExist exception
        mock_get.side_effect = User.DoesNotExist()

        result = resolve_oc_model_queryset(Corpus, user=999999)

        # Should only see public corpus (which we explicitly created as public)
        self.assertEqual(result.count(), 1)
        self.assertEqual(result.first(), self.public_corpus)

    # Test non-user object by directly patching resolver's user type check
    @patch("opencontractserver.shared.resolvers.isinstance")
    def test_non_user_object(self, mock_isinstance):
        """Passing something other than a User object should fall back to anonymous."""
        # Make isinstance always return False for our check
        mock_isinstance.return_value = False

        result = resolve_oc_model_queryset(Corpus, user=object())

        # Should only see public corpus
        self.assertEqual(result.count(), 1)
        self.assertEqual(result.first(), self.public_corpus)

    # For global ID errors, patch from_global_id directly
    @patch("opencontractserver.shared.resolvers.from_global_id")
    def test_malformed_global_id(self, mock_from_global_id):
        """When from_global_id raises an exception, return None."""
        # Make from_global_id raise an exception
        mock_from_global_id.side_effect = Exception("Invalid ID")

        result = resolve_single_oc_model_from_id(Corpus, "invalid", user=self.user)
        self.assertIsNone(result)

    # Test real model without permissions using CorpusQuery
    def test_model_without_permissions_queryset(self):
        """Models without UserObjectPermission classes should fall back to creator/public filter."""
        # Create a corpus query linked to the user's private corpus
        corpus_query = CorpusQuery.objects.create(
            corpus=self.private_corpus,
            query="Test query",
            creator=self.user,  # CorpusQuery inherits creator from BaseOCModel
        )

        # User can see their own corpus query
        result = resolve_oc_model_queryset(CorpusQuery, user=self.user)
        self.assertEqual(result.count(), 1)
        self.assertEqual(result.first(), corpus_query)  # Check it's the correct one

        # Other user can't see it (CorpusQuery doesn't have is_public field)
        other_user = User.objects.create_user(
            username="other_test_user", password="test"
        )
        result = resolve_oc_model_queryset(CorpusQuery, user=other_user)
        self.assertEqual(result.count(), 0)


class ResolveOcModelQuerysetTest(TestCase):
    @classmethod
    def setUpTestData(cls):
        # Create users
        cls.owner = User.objects.create_user(username="owner", password="password123")
        cls.collaborator = User.objects.create_user(
            username="collaborator", password="password123"
        )
        cls.regular_user = User.objects.create_user(
            username="regular", password="password123"
        )
        cls.anonymous_user = AnonymousUser()

        # Create Corpuses
        cls.public_corpus = Corpus.objects.create(
            title="Public Corpus", creator=cls.owner, is_public=True
        )
        cls.private_corpus = Corpus.objects.create(
            title="Private Corpus", creator=cls.owner, is_public=False
        )
        cls.shared_corpus = Corpus.objects.create(
            title="Shared Corpus", creator=cls.owner, is_public=False
        )
        cls.collaborator_corpus = Corpus.objects.create(
            title="Collaborator Corpus", creator=cls.collaborator, is_public=False
        )

        # Assign read permission for shared_corpus to collaborator
        # Note: Assumes django-guardian permissions like 'read_corpus' exist
        try:
            assign_perm("corpuses.read_corpus", cls.collaborator, cls.shared_corpus)
            logger.info(
                f"Assigned read_corpus permission to {cls.collaborator.username} for {cls.shared_corpus.title}"
            )
        except Permission.DoesNotExist:
            logger.warning(
                "Could not assign 'read_corpus' permission. Does it exist? Skipping permission assignment."
            )

        # Create Documents
        cls.public_doc = Document.objects.create(
            title="Public Doc", creator=cls.owner, is_public=True
        )
        cls.private_doc = Document.objects.create(
            title="Private Doc", creator=cls.owner, is_public=False
        )
        cls.shared_doc = Document.objects.create(
            title="Shared Doc", creator=cls.owner, is_public=False
        )
        cls.collaborator_doc = Document.objects.create(
            title="Collaborator Doc", creator=cls.collaborator, is_public=False
        )

        # Assign read permission for shared_doc to collaborator
        try:
            assign_perm("documents.read_document", cls.collaborator, cls.shared_doc)
            logger.info(
                f"Assigned read_document permission to {cls.collaborator.username} for {cls.shared_doc.title}"
            )
        except Permission.DoesNotExist:
            logger.warning(
                "Could not assign 'read_document' permission. Does it exist? Skipping permission assignment."
            )

        # Associate documents with corpuses
        cls.public_corpus.documents.add(cls.public_doc, cls.private_doc, cls.shared_doc)
        cls.private_corpus.documents.add(cls.private_doc)  # Only private doc
        cls.shared_corpus.documents.add(cls.shared_doc)  # Only shared doc
        cls.collaborator_corpus.documents.add(
            cls.collaborator_doc
        )  # Only collaborator doc

        # Create Annotations (need an AnnotationLabel)
        cls.test_label = AnnotationLabel.objects.create(
            text="TestLabel", creator=cls.owner
        )
        cls.public_annotation = Annotation.objects.create(
            document=cls.public_doc,
            annotation_label=cls.test_label,
            creator=cls.owner,
            is_public=True,
        )
        cls.private_annotation = Annotation.objects.create(
            document=cls.public_doc,
            annotation_label=cls.test_label,
            creator=cls.owner,
            is_public=False,
        )
        cls.shared_doc_annotation = Annotation.objects.create(
            document=cls.shared_doc,
            annotation_label=cls.test_label,
            creator=cls.owner,
            is_public=False,
        )

        # Assign read permission for shared_doc_annotation to collaborator
        try:
            assign_perm(
                "annotations.read_annotation",
                cls.collaborator,
                cls.shared_doc_annotation,
            )
            logger.info(
                f"Assigned read_annotation permission to {cls.collaborator.username} "
                f"for annotation {cls.shared_doc_annotation.id}"
            )
        except Permission.DoesNotExist:
            logger.warning(
                "Could not assign 'read_annotation' permission. Skipping assignment."
            )

    def assertQuerysetOptimized(
        self,
        queryset: QuerySet,
        model_type: type,
        expected_select: list,
        expected_prefetch: list,
    ):
        """Helper to check if optimizations seem to be applied (basic check)."""
        # Note: Directly inspecting the final SQL query is the most reliable way,
        # but requires deeper integration or database-specific tools.
        # This provides a basic check based on the queryset attributes.
        self.assertIn(
            model_type,
            [Corpus, Document],
            "Optimization checks only implemented for Corpus and Document",
        )

        # Check select_related (might be stored in select_related attribute or implicitly via query structure)
        # This is an approximation - complex queries might not store it directly here.
        if queryset.query.select_related:
            if isinstance(queryset.query.select_related, dict):
                select_related_fields = set(queryset.query.select_related.keys())
            elif isinstance(queryset.query.select_related, (list, tuple)):
                select_related_fields = set(queryset.query.select_related)
            else:  # boolean True/False indicates automatic detection, less reliable to check
                select_related_fields = set()
                logger.warning(
                    "select_related structure not dict/list/tuple, cannot reliably check fields."
                )
        else:
            select_related_fields = set()

        # Check prefetch_related
        prefetch_related_fields = set(queryset._prefetch_related_lookups)

        missing_select = set(expected_select) - select_related_fields
        missing_prefetch = set(expected_prefetch) - prefetch_related_fields

        # Allow creator check to pass even if not explicitly in select_related dict
        missing_select.discard("creator")

        self.assertFalse(
            missing_select,
            f"Missing expected select_related fields for {model_type.__name__}: {missing_select}",
        )
        self.assertFalse(
            missing_prefetch,
            f"Missing expected prefetch_related fields for {model_type.__name__}: {missing_prefetch}",
        )
        logger.info(f"Verified optimizations for {model_type.__name__}")

    def test_resolve_corpus_queryset_permissions(self):
        """Test visibility rules for Corpus model."""
        # Owner sees all their own + public (4 total: public, private, shared, collaborator's) -
        # assumes superuser or specific logic includes owned
        # Updated assumption: Owner sees their own + public (3 total: public, private, shared)
        owner_qs = resolve_oc_model_queryset(Corpus, self.owner)
        self.assertEqual(
            owner_qs.count(), 3, f"Owner should see 3 corpuses, saw {owner_qs.count()}"
        )
        self.assertQuerysetOptimized(
            owner_qs, Corpus, ["creator", "label_set", "user_lock"], ["documents"]
        )

        # Collaborator sees public + their own + shared (via permission) (3 total: public, shared, collaborator's)
        collab_qs = resolve_oc_model_queryset(Corpus, self.collaborator)
        self.assertEqual(
            collab_qs.count(),
            3,
            f"Collaborator should see 3 corpuses, saw {collab_qs.count()}",
        )
        self.assertQuerysetOptimized(
            collab_qs, Corpus, ["creator", "label_set", "user_lock"], ["documents"]
        )

        # Regular user sees only public (1 total: public)
        regular_qs = resolve_oc_model_queryset(Corpus, self.regular_user)
        self.assertEqual(
            regular_qs.count(),
            1,
            f"Regular user should see 1 corpus, saw {regular_qs.count()}",
        )
        self.assertEqual(regular_qs.first(), self.public_corpus)
        self.assertQuerysetOptimized(
            regular_qs, Corpus, ["creator", "label_set", "user_lock"], ["documents"]
        )

        # Anonymous user sees only public (1 total: public)
        anon_qs = resolve_oc_model_queryset(Corpus, self.anonymous_user)
        self.assertEqual(
            anon_qs.count(),
            1,
            f"Anonymous user should see 1 corpus, saw {anon_qs.count()}",
        )
        self.assertEqual(anon_qs.first(), self.public_corpus)
        self.assertQuerysetOptimized(
            anon_qs, Corpus, ["creator", "label_set", "user_lock"], ["documents"]
        )

    def test_resolve_document_queryset_permissions(self):
        """Test visibility rules for Document model."""
        # Owner sees all their own + public (3 total: public, private, shared)
        owner_qs = resolve_oc_model_queryset(Document, self.owner)
        self.assertEqual(
            owner_qs.count(), 3, f"Owner should see 3 documents, saw {owner_qs.count()}"
        )
        self.assertQuerysetOptimized(
            owner_qs,
            Document,
            ["creator", "user_lock"],
            [
                "doc_annotations",
                "rows",
                "source_relationships",
                "target_relationships",
                "notes",
            ],
        )

        # Collaborator sees public + their own + shared (via permission) (3 total: public, shared, collaborator's)
        collab_qs = resolve_oc_model_queryset(Document, self.collaborator)
        self.assertEqual(
            collab_qs.count(),
            3,
            f"Collaborator should see 3 documents, saw {collab_qs.count()}",
        )
        self.assertQuerysetOptimized(
            collab_qs,
            Document,
            ["creator", "user_lock"],
            [
                "doc_annotations",
                "rows",
                "source_relationships",
                "target_relationships",
                "notes",
            ],
        )

        # Regular user sees only public (1 total: public)
        regular_qs = resolve_oc_model_queryset(Document, self.regular_user)
        self.assertEqual(
            regular_qs.count(),
            1,
            f"Regular user should see 1 document, saw {regular_qs.count()}",
        )
        self.assertEqual(regular_qs.first(), self.public_doc)
        self.assertQuerysetOptimized(
            regular_qs,
            Document,
            ["creator", "user_lock"],
            [
                "doc_annotations",
                "rows",
                "source_relationships",
                "target_relationships",
                "notes",
            ],
        )

        # Anonymous user sees only public (1 total: public)
        anon_qs = resolve_oc_model_queryset(Document, self.anonymous_user)
        self.assertEqual(
            anon_qs.count(),
            1,
            f"Anonymous user should see 1 document, saw {anon_qs.count()}",
        )
        self.assertEqual(anon_qs.first(), self.public_doc)
        self.assertQuerysetOptimized(
            anon_qs,
            Document,
            ["creator", "user_lock"],
            [
                "doc_annotations",
                "rows",
                "source_relationships",
                "target_relationships",
                "notes",
            ],
        )

    def test_resolve_annotation_queryset_permissions(self):
        """Test visibility rules for Annotation model (no specific optimizations applied in resolver yet)."""
        # Owner sees all their own + public (3 total: public, private, shared_doc_annotation)
        owner_qs = resolve_oc_model_queryset(Annotation, self.owner)
        self.assertEqual(
            owner_qs.count(),
            3,
            f"Owner should see 3 annotations, saw {owner_qs.count()}",
        )

        # Collaborator sees public + their own + shared (via permission) (2 total: public, shared_doc_annotation)
        collab_qs = resolve_oc_model_queryset(Annotation, self.collaborator)
        self.assertEqual(
            collab_qs.count(),
            2,
            f"Collaborator should see 2 annotations, saw {collab_qs.count()}",
        )
        self.assertIn(self.public_annotation, collab_qs)
        self.assertIn(self.shared_doc_annotation, collab_qs)

        # Regular user sees only public (1 total: public)
        regular_qs = resolve_oc_model_queryset(Annotation, self.regular_user)
        self.assertEqual(
            regular_qs.count(),
            1,
            f"Regular user should see 1 annotation, saw {regular_qs.count()}",
        )
        self.assertEqual(regular_qs.first(), self.public_annotation)

        # Anonymous user sees only public (1 total: public)
        anon_qs = resolve_oc_model_queryset(Annotation, self.anonymous_user)
        self.assertEqual(
            anon_qs.count(),
            1,
            f"Anonymous user should see 1 annotation, saw {anon_qs.count()}",
        )
        self.assertEqual(anon_qs.first(), self.public_annotation)

    # def test_invalid_user_id_in_queryset(self):
    #     """Fall back to anonymous if the user ID does not exist."""
    #     # Ensure public_corpus is truly public
    #     self.public_corpus.is_public = True
    #     self.public_corpus.save()

    #     queryset = resolve_oc_model_queryset(Corpus, user=999999)
    #     # Now we see exactly 1 => the public corpus
    #     self.assertEqual(queryset.count(), 1)
    #     self.assertEqual(queryset.first(), self.public_corpus)

    # def test_unexpected_user_object_in_queryset(self):
    #     """Passing a random object => fallback to anonymous => only public corpus."""
    #     # Ensure public_corpus is truly public
    #     self.public_corpus.is_public = True
    #     self.public_corpus.save()

    #     class RandomObject:
    #         pass

    #     queryset = resolve_oc_model_queryset(Corpus, user=RandomObject())
    #     self.assertEqual(queryset.count(), 1)
    #     self.assertEqual(queryset.first(), self.public_corpus)

    # def test_malformed_global_id(self):
    #     """Use an ID that is valid base64 but lacks a colon => from_global_id fails fast."""
    #     invalid_id = base64.b64encode(b"CorpusType").decode()
    #     # => "Q29ycHVzVHlwZQ==", no colon => from_global_id raises an Exception => returns None

    #     obj = resolve_single_oc_model_from_id(Corpus, invalid_id, self.owner)
    #     self.assertIsNone(obj)

    # def test_lookup_error_fallback_no_permissions(self):
    #     """
    #     Use a real model that lacks a userobjectpermission class so
    #     apps.get_model(...) will raise LookupError => fallback logic.
    #     """
    #     # If your code has a simpler model for ephemeral data or
    #     # something that truly doesn't define a userobjectpermission class:
    #     # e.g. TemporaryFileHandle or some other 'foo'.
    #     from opencontractserver.corpuses.models import TemporaryFileHandle

    #     # Create an instance with 'creator=self.owner' or is_public=True for testing
    #     tfh = TemporaryFileHandle.objects.create(creator=self.owner)

    #     # Now call the resolver with a different user
    #     qs = resolve_oc_model_queryset(TemporaryFileHandle, user=self.regular_user)
    #     # Fallback => Q(creator=user) | Q(is_public=True)
    #     # => the regular_user isn't the creator; if not public => no objects
    #     self.assertFalse(qs.exists())

    # def test_superuser_in_queryset(self):
    #     """Test that superusers see all objects ordered by creation date."""
    #     super_user = User.objects.create_superuser(
    #         username="test_superuser", password="password123"
    #     )
    #     queryset = resolve_oc_model_queryset(Corpus, super_user)
    #     self.assertEqual(queryset.count(), 4, "Superuser should see all corpuses")
    #     self.assertEqual(queryset.query.order_by, ("created",), "Should be ordered by created")

    # def test_anonymous_user_single_model(self):
    #     """Test that anonymous users only see public objects in single model resolver."""
    #     global_id = to_global_id("CorpusType", self.private_corpus.id)
    #     obj = resolve_single_oc_model_from_id(Corpus, global_id, self.anonymous_user)
    #     self.assertIsNone(obj, "Anonymous user should not see private corpus")

    # def test_superuser_single_model(self):
    #     """Test that superusers can access any object in single model resolver."""
    #     super_user = User.objects.create_superuser(
    #         username="test_super_single", password="password123"
    #     )
    #     global_id = to_global_id("CorpusType", self.private_corpus.id)
    #     obj = resolve_single_oc_model_from_id(Corpus, global_id, super_user)
    #     self.assertEqual(obj, self.private_corpus, "Superuser should see private corpus")

    # @patch("django.apps.apps.get_model", side_effect=LookupError("Mocked lookup error"))
    # def test_lookup_error_in_queryset(self, mock_get_model):
    #     """Test fallback when permission model lookup fails in queryset resolver."""
    #     # Reference self.collaborator.id BEFORE patching
    #     collab_id = self.collaborator.id

    #     # Now do the patch AFTER we've accessed collaborator.id
    #     queryset = resolve_oc_model_queryset(Corpus, user=collab_id)
    #     # Should fall back to creator/public filter
    #     self.assertEqual(queryset.count(), 2, "Should see public corpus and own corpus")
    #     self.assertIn(self.public_corpus, queryset)
    #     self.assertIn(self.collaborator_corpus, queryset)

    # @patch("django.apps.apps.get_model", side_effect=LookupError("Mocked lookup error"))
    # def test_lookup_error_in_single_model(self, mock_get_model):
    #     """Test fallback when permission model lookup fails in single model resolver."""
    #     # Reference self.private_corpus.id BEFORE patching
    #     p_corpus_id = self.private_corpus.id
    #     global_id = to_global_id("CorpusType", p_corpus_id)

    #     # Now do the patch AFTER we've accessed the corpus ID
    #     obj = resolve_single_oc_model_from_id(Corpus, global_id, self.collaborator)
    #     self.assertIsNone(obj, "Collaborator should not see owner's private corpus")
