#  Copyright (C) 2022  John Scrudato

import json
import logging

import requests
import responses
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db import transaction
from django.test import TestCase
from django.test.client import Client as DjangoClient
from graphene.test import Client
from graphql_relay import to_global_id
from rest_framework.test import APIClient

from config.graphql.schema import schema
from opencontractserver.analyzer.models import Analysis, Analyzer, GremlinEngine
from opencontractserver.annotations.models import Annotation, AnnotationLabel, LabelSet
from opencontractserver.corpuses.models import Corpus
from opencontractserver.documents.models import Document
from opencontractserver.tasks.analyzer_tasks import (
    import_analysis,
    install_analyzer_task,
    request_gremlin_manifest,
    start_analysis,
)
from opencontractserver.tests.fixtures import (
    SAMPLE_GREMLIN_ENGINE_MANIFEST_PATH,
    create_mock_submission_response,
    generate_random_analyzer_return_values,
    get_valid_pdf_urls,
)

User = get_user_model()

logger = logging.getLogger(__name__)


class TestContext:
    def __init__(self, user):
        self.user = user


class GraphQLTestCase(TestCase):

    def setUp(self):
        logger.info("Starting setUp method")

        # Setup a test user
        with transaction.atomic():
            self.user = User.objects.create_user(username="bob", password="12345678")
        logger.info(f"Created test user: {self.user}")

        self.graphene_client = Client(schema, context_value=TestContext(self.user))
        logger.info("Created graphene client")

        # Setup a test JWT token for user
        executed_login_data = self.graphene_client.execute(
            """
            mutation ($username: String!, $password: String!) {
                tokenAuth(username: $username, password: $password) {
                      token
                      refreshExpiresIn
                      payload
                }
            }
            """,
            variable_values={"username": "bob", "password": "12345678"},
        )
        logger.info(f"Executed login: {executed_login_data}")

        self.jwt_token = executed_login_data["data"]["tokenAuth"]["token"]
        logger.info(f"JWT token retrieved: {self.jwt_token}")

        # Create a test client to make GraphQL requests
        self.client_header = {"HTTP_AUTHORIZATION": f"Bearer {self.jwt_token}"}
        self.django_client = DjangoClient()
        self.authenticated_client = APIClient()
        self.authenticated_client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {self.jwt_token}"
        )
        logger.info("Created test clients")

        # Create a test corpus
        with transaction.atomic():
            self.corpus = Corpus.objects.create(
                title="Test Analysis Corpus", creator=self.user, backend_lock=False
            )
        self.global_corpus_id = to_global_id("CorpusType", self.corpus.id)
        logger.info(f"Created test corpus: {self.corpus}")

        self.doc_ids = []
        for index, url in enumerate(get_valid_pdf_urls()):
            response = requests.get(url)
            self.assertEqual(response.status_code, 200)

            pdf_contents = ContentFile(response.content)
            with transaction.atomic():
                document = Document.objects.create(
                    title=f"TestDoc{index}",
                    description="Manually created",
                    creator=self.user,
                )
                document.pdf_file.save("dummy_file.pdf", pdf_contents)

                self.doc_ids.append(document.id)
                logger.info(f"Created document with id: {document.id}")

        logger.info(f"{len(get_valid_pdf_urls())} pdfs loaded for analysis")

        # Link docs to corpus
        self.corpus.documents.add(*self.doc_ids)
        logger.info("Linked documents to corpus")

        # Setup a test gremlin + analyzers
        with transaction.atomic():
            self.gremlin = GremlinEngine.objects.create(
                url="http://localhost:8000", creator=self.user
            )
        logger.info(f"Created GremlinEngine: {self.gremlin}")

        with responses.RequestsMock() as rsps:
            rsps.add(
                responses.GET,
                self.gremlin.url + "/api/analyzers",
                json=json.loads(SAMPLE_GREMLIN_ENGINE_MANIFEST_PATH.open("r").read()),
                status=200,
            )
            analyzer_manifests = (
                request_gremlin_manifest.si(gremlin_id=self.gremlin.id).apply().get()
            )
            self.assertIsNotNone(analyzer_manifests)
        logger.info(f"Retrieved analyzer manifests: {analyzer_manifests}")

        with transaction.atomic():
            install_analyzer_task.si(
                gremlin_id=self.gremlin.id,
                analyzer_manifests=analyzer_manifests,
            ).apply().get()

        self.assertEqual(Analyzer.objects.all().count(), len(analyzer_manifests))
        logger.info(f"Installed {Analyzer.objects.all().count()} analyzers")

        # Import a faux analysis
        self.analyzer = Analyzer.objects.all()[0]
        self.analyzer_global_id = to_global_id("AnalyzerType", self.analyzer.id)
        logger.info(f"Selected analyzer for faux analysis: {self.analyzer}")

        with responses.RequestsMock() as rsps:
            rsps.add(
                responses.POST,
                f"{self.gremlin.url}/api/jobs/submit",
                body=json.dumps(create_mock_submission_response(self.analyzer.id)),
                status=200,
                content_type="application/json",
            )

            with transaction.atomic():
                analysis = Analysis.objects.create(
                    analyzer_id=self.analyzer.id,
                    analyzed_corpus_id=self.corpus.id,
                    creator=self.user,
                )
            logger.info(f"Created Analysis object: {analysis}")

            self.analysis_id = (
                start_analysis.si(analysis_id=analysis.id, user_id=self.user.id)
                .apply()
                .get()
            )
        logger.info(f"Started analysis with ID: {self.analysis_id}")

        # Mock callback results to actually create data
        mock_gremlin_response_data = generate_random_analyzer_return_values(
            doc_ids=self.doc_ids
        )
        logger.info("Generated mock gremlin response data")

        analysis_result = (
            import_analysis.si(
                creator_id=self.user.id,
                analysis_id=self.analysis_id,
                analysis_results=mock_gremlin_response_data,
            )
            .apply()
            .get()
        )
        logger.info(f"Imported analysis result: {analysis_result}")

        self.assertTrue(analysis_result)

        # Rough and ready test of imports - count database objs
        annotation_count = Annotation.objects.all().count()
        label_set_count = LabelSet.objects.all().count()
        label_count = AnnotationLabel.objects.all().count()

        logger.info(f"Created {annotation_count} annotations")
        logger.info(f"Created {label_set_count} label sets")
        logger.info(f"Created {label_count} labels")

        self.assertTrue(annotation_count > 0)
        self.assertTrue(label_set_count > 0)
        self.assertTrue(label_count > 0)

        logger.info("setUp method completed successfully")

    def __test_get_analyzer_list(self):

        logger.info("Test analyzer list query...")

        ANALYZER_LIST_REQUEST = """
                query {
                  analyzers {
                    edges {
                      node {
                        id
                        analyzerId
                        description
                        hostGremlin {
                          id
                        }
                        disabled
                        isPublic
                        manifest
                      }
                    }
                  }
                }
            """

        analyzer_list_response = self.graphene_client.execute(ANALYZER_LIST_REQUEST)

        logger.info(f"analyzer_list_response: {analyzer_list_response['data']}")

        self.assertTrue(len(analyzer_list_response["data"]["analyzers"]["edges"]), 1)
        self.assertIsNotNone(
            analyzer_list_response["data"]["analyzers"]["edges"][0]["node"][
                "hostGremlin"
            ]
        )
        self.assertTrue(
            analyzer_list_response["data"]["analyzers"]["edges"][0]["node"][
                "analyzerId"
            ]
            == "OC.SPACY.ANALYZER.V1"
        )

        logger.info("\tSUCCESS")

    def __test_get_analyzer(self):

        logger.info("Test request specific analyzer...")

        relay_global_id = to_global_id("AnalyzerType", "OC.SPACY.ANALYZER.V1")

        ANALYZER_REQUEST = """
                        query($id: ID!) {
                          analyzer(id:$id) {
                            id
                            analyzerId
                            description
                            hostGremlin {
                              id
                            }
                            disabled
                            isPublic
                            manifest
                          }
                        }
                    """
        single_analyzer_response = self.graphene_client.execute(
            ANALYZER_REQUEST, variables={"id": relay_global_id}
        )

        self.assertIsNotNone(single_analyzer_response["data"]["analyzer"])
        self.assertIsNotNone(
            single_analyzer_response["data"]["analyzer"]["hostGremlin"]
        )
        self.assertTrue(
            single_analyzer_response["data"]["analyzer"]["analyzerId"]
            == "OC.SPACY.ANALYZER.V1"
        )

        logger.info("\tSUCCESS")

    def __test_get_analyses(self):

        logger.info("Test get analyses list...")

        REQUEST_ANALYSIS_DETAILS = """
            query {
              analyses {
                edges {
                  node {
                    id
                    analysisStarted
                    analysisCompleted
                    analyzedDocuments {
                      edges {
                        node {
                          id
                        }
                      }
                    }
                    receivedCallbackFile
                    analyzer {
                      id
                      analyzerId
                      hostGremlin {
                        id
                      }
                    }
                  }
                }
              }
            }
        """

        analysis_list_request = self.graphene_client.execute(REQUEST_ANALYSIS_DETAILS)

        # Get list of analyses from the response
        analysis_list = analysis_list_request["data"]["analyses"]["edges"]
        logger.info(f"Analysis list (count {len(analysis_list)}): {analysis_list}")

        # There should only be one
        self.assertTrue(len(analysis_list) == 1)

        # Grab that one
        received_analysis = analysis_list[0]["node"]

        # Assert some of what we know to be true about it (could probably do more here)
        self.assertIsNotNone(received_analysis["analyzer"]["hostGremlin"])
        self.assertTrue(
            received_analysis["analyzer"]["analyzerId"] == "OC.SPACY.ANALYZER.V1"
        )
        self.assertTrue(
            len(received_analysis["analyzedDocuments"]["edges"])
            == len(get_valid_pdf_urls())
        )
        logger.info("SUCCESS!")

    def __test_start_analysis(self):
        START_ANALYSIS_REQUEST = """
            mutation($analyzerId:ID!, $corpusId:ID!) {
              startAnalysisOnCorpus(corpusId:$corpusId, analyzerId:$analyzerId) {
                ok
                message
                obj {
                  id
                }
              }
            }
        """

        logger.info(f"Start analysis...")
        new_analysis_response = self.graphene_client.execute(
            START_ANALYSIS_REQUEST, variables={"corpusId": self.global_corpus_id, "analyzerId": self.analyzer_global_id}
        )
        logger.info(f"New analysis response: {new_analysis_response}")

    def test_endpoints(self):

        self.__test_get_analyzer_list()
        self.__test_get_analyzer()
        self.__test_get_analyses()
        self.__test_start_analysis()
