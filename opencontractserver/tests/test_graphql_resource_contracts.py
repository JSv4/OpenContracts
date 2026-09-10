"""GraphQL resource visibility and update contracts."""

import json
from typing import Any

from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from django.test import TestCase

from config.jwt_auth.shortcuts import get_token
from opencontractserver.analyzer.models import Analysis, Analyzer, GremlinEngine
from opencontractserver.annotations.models import (
    Annotation,
    AnnotationLabel,
    LabelSet,
    Relationship,
)
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document, DocumentPath
from opencontractserver.types.enums import PermissionTypes
from opencontractserver.utils.ids import to_global_id
from opencontractserver.utils.permissioning import set_permissions_for_obj_to_user

User = get_user_model()


class GraphQLResourceContractTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username="audit_owner", password="audit")
        self.viewer = User.objects.create_user(
            username="audit_viewer", password="audit"
        )
        self.corpus = Corpus.objects.create(
            title="Audit corpus", creator=self.owner, is_public=True
        )
        self.document = Document.objects.create(
            title="Audit document", creator=self.owner, is_public=True
        )
        DocumentPath.objects.create(
            document=self.document,
            corpus=self.corpus,
            creator=self.owner,
            path="audit.pdf",
            version_number=1,
            is_current=True,
            is_deleted=False,
        )

    def query(self, query, variables, user=None):
        headers: dict[str, Any] = (
            {"HTTP_AUTHORIZATION": f"Bearer {get_token(user)}"} if user else {}
        )
        response = self.client.post(
            "/graphql/",
            {"query": query, "variables": variables},
            content_type="application/json",
            **headers,
        )
        self.assertEqual(response.status_code, 200, response.content)
        result = response.json()
        self.assertNotIn("errors", result, result)
        return result["data"]

    def test_corpus_update_preserves_owner(self):
        set_permissions_for_obj_to_user(
            self.viewer, self.corpus, [PermissionTypes.READ, PermissionTypes.UPDATE]
        )
        self.assertFalse(self.corpus.user_can(self.viewer, PermissionTypes.DELETE))
        result = self.query(
            'mutation($id: String!) { updateCorpus(id: $id, title: "Edited") { ok message } }',
            {"id": to_global_id("CorpusType", self.corpus.pk)},
            self.viewer,
        )
        self.assertTrue(result["updateCorpus"]["ok"], result)
        self.corpus.refresh_from_db()
        self.assertEqual(
            self.corpus.creator_id,
            self.owner.pk,
            "UPDATE transferred ownership to the editor",
        )
        fresh = Corpus.objects.get(pk=self.corpus.pk)
        self.assertFalse(fresh.user_can(self.viewer, PermissionTypes.DELETE))
        self.assertFalse(fresh.user_can(self.viewer, PermissionTypes.PERMISSION))

    def test_labelset_update_preserves_owner(self):
        labelset = LabelSet.objects.create(title="Audit labels", creator=self.owner)
        set_permissions_for_obj_to_user(
            self.viewer, labelset, [PermissionTypes.READ, PermissionTypes.UPDATE]
        )
        result = self.query(
            'mutation($id: String!) { updateLabelset(id: $id, title: "Edited") { ok message } }',
            {"id": to_global_id("LabelSetType", labelset.pk)},
            self.viewer,
        )
        self.assertTrue(result["updateLabelset"]["ok"], result)
        labelset.refresh_from_db()
        self.assertEqual(
            labelset.creator_id, self.owner.pk, "UPDATE transferred label-set ownership"
        )

    def test_labelset_assignment_requires_read(self):
        labelset = LabelSet.objects.create(
            title="SYNTHETIC_PRIVATE_LABELS", creator=self.owner
        )
        set_permissions_for_obj_to_user(
            self.viewer, self.corpus, [PermissionTypes.READ, PermissionTypes.UPDATE]
        )
        query = "mutation($id: String!, $labels: String!) { updateCorpus(id: $id, labelSet: $labels) { ok } }"
        variables = {
            "id": to_global_id("CorpusType", self.corpus.pk),
            "labels": to_global_id("LabelSetType", labelset.pk),
        }
        result = self.query(query, variables, self.viewer)
        self.assertFalse(result["updateCorpus"]["ok"])
        self.corpus.refresh_from_db()
        self.assertIsNone(self.corpus.label_set_id)
        set_permissions_for_obj_to_user(self.viewer, labelset, [PermissionTypes.READ])
        result = self.query(query, variables, self.viewer)
        self.assertTrue(result["updateCorpus"]["ok"])
        self.corpus.refresh_from_db()
        self.assertEqual(self.corpus.label_set_id, labelset.pk)
        self.assertEqual(self.corpus.creator_id, self.owner.pk)

    def privacy_fixture(self):
        analyzer = Analyzer.objects.create(
            id="audit_analyzer",
            creator=self.owner,
            task_name="opencontractserver.tasks.noop",
        )
        analysis = Analysis.objects.create(
            analyzer=analyzer,
            analyzed_corpus=self.corpus,
            creator=self.owner,
            is_public=False,
        )
        label = AnnotationLabel.objects.create(
            text="Audit", creator=self.owner, label_type="TOKEN_LABEL"
        )
        common = dict(
            creator=self.owner,
            document=self.document,
            corpus=self.corpus,
            page=1,
            json={},
            annotation_label=label,
        )
        plain = Annotation.objects.create(
            raw_text="public annotation", structural=True, **common
        )
        private = Annotation.objects.create(
            raw_text="AUDIT_SECRET_ANALYSIS_TEXT",
            created_by_analysis=analysis,
            parent=plain,
            **common,
        )
        self.assertTrue(
            Annotation.objects.visible_to_user(AnonymousUser())
            .filter(pk=plain.pk)
            .exists()
        )
        self.assertFalse(
            Annotation.objects.visible_to_user(AnonymousUser())
            .filter(pk=private.pk)
            .exists()
        )
        return plain, private, analysis

    def test_tree_fields_respect_source_visibility(self):
        plain, private, _ = self.privacy_fixture()
        result = self.query(
            "query($id: ID!) { annotation(id: $id) { id descendantsTree fullTree subtree } }",
            {"id": to_global_id("AnnotationType", plain.pk)},
        )
        self.assertNotIn(
            private.raw_text,
            json.dumps(result),
            "Anonymous tree traversal returned analysis-private text",
        )

    def test_tree_keeps_private_source_content_for_authorized_owner(self):
        plain, private, _ = self.privacy_fixture()
        result = self.query(
            "query($id: ID!) { annotation(id: $id) { descendantsTree fullTree subtree } }",
            {"id": to_global_id("AnnotationType", plain.pk)},
            self.owner,
        )
        self.assertIn(private.raw_text, json.dumps(result))

    def test_legacy_analysis_link_obeys_independent_visibility(self):
        plain, _, analysis = self.privacy_fixture()
        plain.analysis = analysis
        plain.save(update_fields=["analysis"])
        query = "query($id: ID!) { annotation(id: $id) { analysis { id } } }"
        variables = {"id": to_global_id("AnnotationType", plain.pk)}
        self.assertIsNone(self.query(query, variables)["annotation"]["analysis"])
        self.assertEqual(
            self.query(query, variables, self.owner)["annotation"]["analysis"]["id"],
            to_global_id("AnalysisType", analysis.pk),
        )

    def test_relationship_lists_respect_visibility(self):
        plain, _, analysis = self.privacy_fixture()
        label = AnnotationLabel.objects.create(
            text="AUDIT_SECRET_RELATIONSHIP",
            creator=self.owner,
            label_type="RELATIONSHIP_LABEL",
        )
        relation = Relationship.objects.create(
            creator=self.owner,
            document=self.document,
            corpus=self.corpus,
            created_by_analysis=analysis,
            relationship_label=label,
        )
        relation.source_annotations.add(plain)
        self.assertFalse(
            Relationship.objects.visible_to_user(AnonymousUser())
            .filter(pk=relation.pk)
            .exists()
        )
        result = self.query(
            "query($id: ID!) { annotation(id: $id) { allSourceNodeInRelationship { id relationshipLabel { text } } } }",
            {"id": to_global_id("AnnotationType", plain.pk)},
        )
        self.assertNotIn(
            label.text,
            json.dumps(result),
            "Anonymous relationship traversal bypassed source privacy",
        )

    def test_parent_annotation_respects_visibility(self):
        plain, private, _ = self.privacy_fixture()
        private.parent = None
        private.save(update_fields=["parent"])
        plain.parent = private
        plain.save(update_fields=["parent"])
        result = self.query(
            "query($id: ID!) { annotation(id: $id) { parent { id rawText } } }",
            {"id": to_global_id("AnnotationType", plain.pk)},
        )
        self.assertIsNone(
            result["annotation"]["parent"],
            "Default FK resolution exposed a private parent",
        )

    def test_analyzer_engine_respects_visibility(self):
        engine = GremlinEngine.objects.create(
            creator=self.owner,
            url="https://example.invalid",
            api_key="SYNTHETIC_ENGINE_SECRET",
        )
        analyzer = Analyzer.objects.create(
            id="remote_audit", creator=self.owner, host_gremlin=engine, is_public=True
        )
        result = self.query(
            "query($id: ID!) { analyzer(id: $id) { hostGremlin { url apiKey } } }",
            {"id": to_global_id("AnalyzerType", analyzer.pk)},
        )
        self.assertIsNone(result["analyzer"]["hostGremlin"])

    def test_engine_credentials_require_management_access(self):
        engine = GremlinEngine.objects.create(
            creator=self.owner,
            is_public=True,
            url="https://example.invalid",
            api_key="SYNTHETIC_ENGINE_SECRET",
        )
        analyzer = Analyzer.objects.create(
            id="remote_audit", creator=self.owner, host_gremlin=engine, is_public=True
        )
        query = "query($id: ID!) { analyzer(id: $id) { hostGremlin { url apiKey } } }"
        variables = {"id": to_global_id("AnalyzerType", analyzer.pk)}
        result = self.query(query, variables)
        self.assertEqual(result["analyzer"]["hostGremlin"]["url"], engine.url)
        self.assertIsNone(result["analyzer"]["hostGremlin"]["apiKey"])
        result = self.query(query, variables, self.owner)
        self.assertEqual(result["analyzer"]["hostGremlin"]["apiKey"], engine.api_key)

    def test_corpus_labelset_respects_visibility(self):
        labelset = LabelSet.objects.create(
            title="SYNTHETIC_PRIVATE_LABELSET", creator=self.owner
        )
        self.corpus.label_set = labelset
        self.corpus.save(update_fields=["label_set"])
        self.assertFalse(
            LabelSet.objects.visible_to_user(AnonymousUser())
            .filter(pk=labelset.pk)
            .exists()
        )
        result = self.query(
            "query($id: ID!) { corpus(id: $id) { labelSet { id title } } }",
            {"id": to_global_id("CorpusType", self.corpus.pk)},
        )
        self.assertIsNone(result["corpus"]["labelSet"])
