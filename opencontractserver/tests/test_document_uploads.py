import io
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from docx import Document
from graphene.test import Client

from config.graphql.schema import schema
from opencontractserver.utils.pdf import base_64_encode_bytes

User = get_user_model()


class TestContext:
    def __init__(self, user):
        self.user = user


class UploadDocumentMutationTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="testuser", password="testpassword"
        )
        self.client = Client(schema, context_value=TestContext(self.user))

    def test_upload_document_mime_type_check(self):
        mutation = """
            mutation UploadDocument(
                $file: String!,
                $filename: String!,
                $title: String!,
                $description: String!,
                $customMeta: GenericScalar!,
                $addToCorpusId: ID,
                $makePublic: Boolean!
            ) {
                uploadDocument(
                    base64FileString: $file,
                    filename: $filename,
                    title: $title,
                    description: $description,
                    customMeta: $customMeta,
                    addToCorpusId: $addToCorpusId,
                    makePublic: $makePublic
                ) {
                    ok
                    message
                    document {
                        id
                        title
                    }
                }
            }
        """  # noqa

        # Mock file content
        pdf_content = b"%PDF-1.5\n%\xe2\xe3\xcf\xd3\n"

        # Generate DOCX content
        docx_buffer = io.BytesIO()
        doc = Document()
        doc.add_paragraph("This is a test DOCX file.")
        doc.save(docx_buffer)
        docx_content = docx_buffer.getvalue()

        txt_content = b"This is a text file."

        # Encode file content
        pdf_base64 = base_64_encode_bytes(pdf_content)
        docx_base64 = base_64_encode_bytes(docx_content)
        txt_base64 = base_64_encode_bytes(txt_content)

        # Test PDF upload (should succeed)
        with patch(
            "opencontractserver.documents.models.Document.objects.create"
        ) as mock_create:
            mock_create.return_value = None
            result = self.client.execute(
                mutation,
                variables={
                    "file": pdf_base64,
                    "filename": "test.pdf",
                    "title": "Test PDF",
                    "description": "A test PDF file",
                    "makePublic": True,
                    "customMeta": {},
                },
            )

        self.assertIsNone(result.get("errors"))
        self.assertTrue(result["data"]["uploadDocument"]["ok"])
        self.assertEqual(result["data"]["uploadDocument"]["message"], "Success")

        # Test DOCX upload (should fail)
        result = self.client.execute(
            mutation,
            variables={
                "file": docx_base64,
                "filename": "test.docx",
                "title": "Test DOCX",
                "description": "A test DOCX file",
                "customMeta": {},
            },
        )

        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["uploadDocument"]["ok"])
        self.assertEqual(
            result["data"]["uploadDocument"]["message"],
            "Unallowed filetype: application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

        # Test TXT upload (should fail)
        result = self.client.execute(
            mutation,
            variables={
                "file": txt_base64,
                "filename": "test.txt",
                "title": "Test TXT",
                "description": "A test TXT file",
                "customMeta": {},
            },
        )

        self.assertIsNone(result.get("errors"))
        self.assertFalse(result["data"]["uploadDocument"]["ok"])
        self.assertEqual(
            result["data"]["uploadDocument"]["message"], "Unable to determine file type"
        )
